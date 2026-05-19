const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { execFileSync } = require('child_process');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

const dbPath = path.join(__dirname, 'canvas.db');
for (const suffix of ['', '-shm', '-wal']) {
  try { fs.unlinkSync(dbPath + suffix); } catch {}
}
require('child_process').execSync('node init_db.js', { cwd: __dirname, stdio: 'inherit' });

const app = express();
const db = new Database(dbPath, { readonly: false });
db.pragma('journal_mode = WAL');

const PORT = process.env.PORT || 3000;
const ORIGIN = `https://localhost:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(48).toString('hex');
const JWT_TTL = '2h';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// CORS: only allow same-origin requests
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin === ORIGIN) {
    res.header('Access-Control-Allow-Origin', ORIGIN);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET, POST');
  }
  res.header('Vary', 'Origin');
  next();
});

// Security headers (CSP)
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// CSRF defense for state-changing requests
function requireSameOrigin(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const origin = req.headers.origin || req.headers.referer || '';
  if (!origin.startsWith(ORIGIN)) {
    return res.status(403).json({ error: 'Cross-origin request blocked' });
  }
  next();
}
app.use(requireSameOrigin);

function signToken(user) {
  return jwt.sign(
    { uid: user.uid, role: user.role, name: user.name },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: JWT_TTL }
  );
}

function setAuthCookie(res, token) {
  res.cookie('auth', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 2 * 60 * 60 * 1000,
    path: '/',
  });
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.auth;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

function requireProfessor(req, res, next) {
  if (req.user.role !== 'professor') {
    return res.status(403).json({ error: 'Professor role required' });
  }
  next();
}

// Login
app.post('/api/login', (req, res) => {
  const { uid, password } = req.body || {};
  if (typeof uid !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Invalid request' });
  }
  const row = db.prepare('SELECT uid, name, role, password FROM login WHERE uid = ?').get(uid);
  const hash = row ? row.password : '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi';
  const ok = bcrypt.compareSync(password, hash);
  if (!row || !ok) {
    return res.status(401).json({ error: 'Invalid UID or password' });
  }
  setAuthCookie(res, signToken(row));
  res.json({ uid: row.uid, name: row.name, role: row.role });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('auth', { path: '/' });
  res.json({ success: true });
});

// Lets the client recover the current user without exposing tokens.
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ uid: req.user.uid, name: req.user.name, role: req.user.role });
});

// Helper: is this professor the one teaching this course?
function professorTeachesCourse(professorUid, courseId) {
  const row = db.prepare(
    'SELECT 1 FROM professor_courses WHERE professor_uid = ? AND course_id = ?'
  ).get(professorUid, Number(courseId));
  return !!row;
}

function studentEnrolledInCourse(studentUid, courseId) {
  const row = db.prepare(
    'SELECT 1 FROM student_courses WHERE login_uid = ? AND course_id = ?'
  ).get(studentUid, Number(courseId));
  return !!row;
}

// Student can read only their own enrolled courses.
app.get('/api/students/:uid/courses', requireAuth, (req, res) => {
  if (req.user.uid !== req.params.uid) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const rows = db.prepare(`
    SELECT course_id, course_code, course_title, instructor
    FROM student_courses
    WHERE login_uid = ?
  `).all(req.params.uid);
  res.json(rows);
});

// Professor can read only their own taught courses.
app.get('/api/professors/:uid/courses', requireAuth, (req, res) => {
  if (req.user.uid !== req.params.uid || req.user.role !== 'professor') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const rows = db.prepare(`
    SELECT course_id, course_code, course_title, instructor
    FROM professor_courses
    WHERE professor_uid = ?
  `).all(req.params.uid);
  res.json(rows);
});

// Course content visible to enrolled students and the professor teaching it.
app.get('/api/courses/:courseId/content', requireAuth, (req, res) => {
  const courseId = req.params.courseId;
  const allowed =
    (req.user.role === 'professor' && professorTeachesCourse(req.user.uid, courseId)) ||
    (req.user.role === 'student'   && studentEnrolledInCourse(req.user.uid, courseId));
  if (!allowed) return res.status(403).json({ error: 'Forbidden' });

  const rows = db.prepare(`
    SELECT week_id, week_title, week_sort, entry_id, entry_title, entry_type, entry_url, entry_sort
    FROM course_content
    WHERE course_id = ?
  `).all(courseId);
  res.json(rows);
});

// Course roster: only the professor who teaches it.
app.get('/api/courses/:courseId/students', requireAuth, requireProfessor, (req, res) => {
  if (!professorTeachesCourse(req.user.uid, req.params.courseId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const rows = db.prepare(`
    SELECT uid, name
    FROM course_students
    WHERE course_id = ?
    ORDER BY name
  `).all(req.params.courseId);
  res.json(rows);
});

// Grades: the student themself, or the professor teaching the course.
app.get('/api/students/:uid/courses/:courseId/grades', requireAuth, (req, res) => {
  const { uid, courseId } = req.params;
  const isSelf = req.user.role === 'student' && req.user.uid === uid;
  const isCourseProf = req.user.role === 'professor' && professorTeachesCourse(req.user.uid, courseId);
  if (!isSelf && !isCourseProf) return res.status(403).json({ error: 'Forbidden' });

  const rows = db.prepare(`
    SELECT grade_id, assignment_id, assignment_name, score
    FROM student_grades
    WHERE login_uid = ? AND course_id = ?
    ORDER BY sort_order
  `).all(uid, courseId);
  res.json(rows);
});

// Search course materials — uses execFile with an argv array, so user input
// becomes a literal grep argument and can never be parsed as shell syntax.
app.get('/api/search', requireAuth, (req, res) => {
  const query = String(req.query.q || '');
  if (!query || query.length > 200) return res.json({ files: [] });
  try {
    const output = execFileSync('grep', ['-rlF', '--', query, 'public/'], {
      cwd: __dirname,
      encoding: 'utf8',
    });
    const files = output.trim().split('\n').filter(Boolean);
    res.json({ files });
  } catch {
    res.json({ files: [] });
  }
});

// Only the professor teaching the course of each affected grade may write it.
app.post('/api/grades', requireAuth, requireProfessor, (req, res) => {
  const { grades } = req.body || {};
  if (!Array.isArray(grades)) return res.status(400).json({ error: 'Invalid grades' });

  const lookup = db.prepare(`
    SELECT sg.grade_id, sg.course_id
    FROM student_grades sg
    WHERE sg.grade_id = ?
  `);
  for (const g of grades) {
    if (!Number.isInteger(g.grade_id) || !Number.isInteger(g.score) || g.score < 0 || g.score > 100) {
      return res.status(400).json({ error: 'Invalid grade entry' });
    }
    const row = lookup.get(g.grade_id);
    if (!row || !professorTeachesCourse(req.user.uid, row.course_id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  const updateNormalized = db.prepare('UPDATE grade SET score = ? WHERE id = ?');
  const updateDenormalized = db.prepare('UPDATE student_grades SET score = ? WHERE grade_id = ?');
  const tx = db.transaction(() => {
    for (const g of grades) {
      updateNormalized.run(g.score, g.grade_id);
      updateDenormalized.run(g.score, g.grade_id);
    }
  });
  tx();
  res.json({ success: true });
});

const certDir = path.join(__dirname, 'certs');
const keyPath = path.join(certDir, 'localhost+2-key.pem');
const certPath = path.join(certDir, 'localhost+2.pem');
if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  console.error('TLS cert/key not found in ./certs. Run: mkcert localhost 127.0.0.1 ::1 (from ./certs)');
  process.exit(1);
}
const server = https.createServer(
  { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) },
  app
).listen(PORT, () => console.log(`Server running on https://localhost:${PORT}`));

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try: PORT=3001 node server.js`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
