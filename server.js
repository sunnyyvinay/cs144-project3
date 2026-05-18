const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const dbPath = path.join(__dirname, 'canvas.db');
for (const suffix of ['', '-shm', '-wal']) {
  try { fs.unlinkSync(dbPath + suffix); } catch {}
}
execSync('node init_db.js', { cwd: __dirname, stdio: 'inherit' });

const app = express();
const db = new Database(dbPath, { readonly: false });
db.pragma('journal_mode = WAL');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// TODO: Requests should only be accepted from trusted origins
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Allow-Methods', '*');
  next();
});
// TODO: The browser should not execute any scripts that are not in a source file
app.use(express.static(path.join(__dirname, 'public')));

// Login
// TODO: Only a user with the correct password should be able to log in
// TODO: The server should know who is making each request
app.post('/api/login', (req, res) => {
  const { uid, password } = req.body;
  const student = db.prepare(`SELECT uid, name, role FROM login WHERE uid = '${uid}' AND password = '${password}'`).get();
  if (!student) {
    const byUid = db.prepare(`SELECT uid, name, role FROM login WHERE uid = '${uid}'`).get();
    if (byUid) return res.json(byUid);
    return res.status(401).json({ error: 'Invalid UID or password' });
  }
  res.json(student);
});

// Get enrolled courses
// TODO: Query the student_courses denormalized table instead
// TODO: Students should only be able to see their own courses
app.get('/api/students/:uid/courses', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id AS course_id, c.code AS course_code, c.title AS course_title, c.instructor
    FROM enrollment e
    JOIN course c ON c.id = e.course_id
    WHERE e.login_uid = ?
  `).all(req.params.uid);
  res.json(rows);
});

// Get course content
// TODO: Query the course_content denormalized table instead
app.get('/api/courses/:courseId/content', (req, res) => {
  const rows = db.prepare(`
    SELECT
      w.id AS week_id,
      w.title AS week_title,
      w.sort_order AS week_sort,
      e.id AS entry_id,
      e.title AS entry_title,
      e.type AS entry_type,
      e.url AS entry_url,
      e.sort_order AS entry_sort
    FROM week w
    JOIN entry e ON e.week_id = w.id
    WHERE w.course_id = ?
    ORDER BY w.sort_order, e.sort_order
  `).all(req.params.courseId);
  res.json(rows);
});

// Get courses taught by a professor
// TODO: Query the professor_courses denormalized table instead
app.get('/api/professors/:uid/courses', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id AS course_id, c.code AS course_code, c.title AS course_title, c.instructor
    FROM course c
    WHERE c.professor_uid = ?
  `).all(req.params.uid);
  res.json(rows);
});

// Get enrolled students for a course
// TODO: Query the course_students denormalized table instead
app.get('/api/courses/:courseId/students', (req, res) => {
  const rows = db.prepare(`
    SELECT l.uid, l.name
    FROM enrollment e
    JOIN login l ON l.uid = e.login_uid
    WHERE e.course_id = ?
    ORDER BY l.name
  `).all(req.params.courseId);
  res.json(rows);
});

// Get grades for a student in a course
// TODO: Query the student_grades denormalized table instead
// TODO: Students should only be able to see their own grades
app.get('/api/students/:uid/courses/:courseId/grades', (req, res) => {
  const rows = db.prepare(`
    SELECT g.id AS grade_id, a.id AS assignment_id, a.name AS assignment_name, g.score
    FROM grade g
    JOIN assignment a ON a.id = g.assignment_id
    WHERE g.login_uid = ? AND a.course_id = ?
    ORDER BY a.sort_order
  `).all(req.params.uid, req.params.courseId);
  res.json(rows);
});

// Search course materials
// TODO: User input should not be able to execute arbitrary commands on the server
app.get('/api/search', (req, res) => {
  const query = req.query.q;
  try {
    const output = execSync(`grep -rl "${query}" public/`).toString();
    const files = output.trim().split('\n').filter(Boolean);
    res.json({ files });
  } catch (e) {
    res.json({ files: [] });
  }
});

// Update grades
// TODO: Also update the corresponding denormalized table
// TODO: Only a professor should be able to change grades
app.post('/api/grades', (req, res) => {
  const { grades } = req.body;
  const update = db.prepare('UPDATE grade SET score = ? WHERE id = ?');
  const tx = db.transaction(() => {
    for (const g of grades) {
      update.run(g.score, g.grade_id);
    }
  });
  tx();
  res.json({ success: true });
});

// TODO: The connection between the browser and the server should be encrypted
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try: PORT=3001 node server.js`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
