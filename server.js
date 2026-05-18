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
// TODO: Students should only be able to see their own courses
app.get('/api/students/:uid/courses', (req, res) => {
  const rows = db.prepare(`
    SELECT course_id, course_code, course_title, instructor
    FROM student_courses
    WHERE login_uid = ?
  `).all(req.params.uid);
  res.json(rows);
});

// Get course content
app.get('/api/courses/:courseId/content', (req, res) => {
  const rows = db.prepare(`
    SELECT week_id, week_title, week_sort, entry_id, entry_title, entry_type, entry_url, entry_sort
    FROM course_content
    WHERE course_id = ?
  `).all(req.params.courseId);
  res.json(rows);
});

// Get courses taught by a professor
app.get('/api/professors/:uid/courses', (req, res) => {
  const rows = db.prepare(`
    SELECT course_id, course_code, course_title, instructor
    FROM professor_courses
    WHERE professor_uid = ?
  `).all(req.params.uid);
  res.json(rows);
});

// Get enrolled students for a course
app.get('/api/courses/:courseId/students', (req, res) => {
  const rows = db.prepare(`
    SELECT uid, name
    FROM course_students
    WHERE course_id = ?
    ORDER BY name
  `).all(req.params.courseId);
  res.json(rows);
});

// Get grades for a student in a course
// TODO: Students should only be able to see their own grades
app.get('/api/students/:uid/courses/:courseId/grades', (req, res) => {
  const rows = db.prepare(`
    SELECT grade_id, assignment_id, assignment_name, score
    FROM student_grades
    WHERE login_uid = ? AND course_id = ?
    ORDER BY sort_order
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
// TODO: Only a professor should be able to change grades
app.post('/api/grades', (req, res) => {
  const { grades } = req.body;
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
