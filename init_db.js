const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');

const db = new Database(path.join(__dirname, 'canvas.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE login (
    uid TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student'
  );

  CREATE TABLE course (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    instructor TEXT NOT NULL,
    professor_uid TEXT,
    FOREIGN KEY (professor_uid) REFERENCES login(uid)
  );

  CREATE TABLE enrollment (
    login_uid TEXT NOT NULL,
    course_id INTEGER NOT NULL,
    PRIMARY KEY (login_uid, course_id),
    FOREIGN KEY (login_uid) REFERENCES login(uid),
    FOREIGN KEY (course_id) REFERENCES course(id)
  );

  CREATE TABLE week (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    FOREIGN KEY (course_id) REFERENCES course(id)
  );

  CREATE TABLE entry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('slides', 'recording')),
    url TEXT NOT NULL DEFAULT '#',
    sort_order INTEGER NOT NULL,
    FOREIGN KEY (week_id) REFERENCES week(id)
  );

  CREATE TABLE assignment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    FOREIGN KEY (course_id) REFERENCES course(id)
  );

  CREATE TABLE grade (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login_uid TEXT NOT NULL,
    assignment_id INTEGER NOT NULL,
    score INTEGER NOT NULL,
    UNIQUE(login_uid, assignment_id),
    FOREIGN KEY (login_uid) REFERENCES login(uid),
    FOREIGN KEY (assignment_id) REFERENCES assignment(id)
  );
`);

const seed = db.transaction(() => {
  const insertLogin = db.prepare('INSERT INTO login (uid, name, password, role) VALUES (?, ?, ?, ?)');
  const hash = (p) => bcrypt.hashSync(p, 12);
  insertLogin.run('123456789', 'Alice Johnson', hash('alice123'), 'student');
  insertLogin.run('987654321', 'Bob Smith', hash('bob456'), 'student');
  insertLogin.run('555123456', 'Charlie Davis', hash('charlie789'), 'student');
  insertLogin.run('profrosario', 'Rosario', hash('bruin'), 'professor');

  const insertCourse = db.prepare('INSERT INTO course (code, title, instructor, professor_uid) VALUES (?, ?, ?, ?)');
  insertCourse.run('COM SCI 35L', 'Software Construction', 'Deuerschmidt', null);
  insertCourse.run('COM SCI 144', 'Web Applications', 'Rosario', 'profrosario');
  insertCourse.run('COM SCI 130', 'Software Engineering', 'Deuerschmidt', null);
  insertCourse.run('CS 33', 'Introduction to Computer Organization', 'Batista', null);
  insertCourse.run('CS 131', 'Programming Languages', 'Eggert', null);

  const courses = db.prepare('SELECT id, code FROM course ORDER BY id').all();

  const insertEnrollment = db.prepare('INSERT INTO enrollment (login_uid, course_id) VALUES (?, ?)');
  const enrollments = [
    ['123456789', [0, 1, 3]],
    ['987654321', [1, 2, 4]],
    ['555123456', [0, 3, 4]],
  ];
  for (const [uid, cis] of enrollments) {
    for (const ci of cis) insertEnrollment.run(uid, courses[ci].id);
  }

  const insertWeek = db.prepare('INSERT INTO week (course_id, title, sort_order) VALUES (?, ?, ?)');
  const insertEntry = db.prepare('INSERT INTO entry (week_id, title, type, url, sort_order) VALUES (?, ?, ?, ?, ?)');

  for (const course of courses) {
    const genWeek = insertWeek.run(course.id, 'General Information', 0);
    const genWeekId = genWeek.lastInsertRowid;
    insertEntry.run(genWeekId, 'Course Introduction Slides', 'slides', '#', 1);
    insertEntry.run(genWeekId, 'Course Introduction Recording', 'recording', '#', 2);
    insertEntry.run(genWeekId, 'Syllabus Overview Slides', 'slides', '#', 3);
    insertEntry.run(genWeekId, 'Syllabus Overview Recording', 'recording', '#', 4);

    let lectureNum = 1;
    for (let w = 1; w <= 10; w++) {
      const week = insertWeek.run(course.id, `Week ${w}`, w);
      const weekId = week.lastInsertRowid;
      for (let lec = 0; lec < 2; lec++) {
        insertEntry.run(weekId, `Lecture ${lectureNum} Slides`, 'slides', '#', lectureNum * 10 + 1);
        insertEntry.run(weekId, `Lecture ${lectureNum} Recording`, 'recording', '#', lectureNum * 10 + 2);
        lectureNum++;
      }
    }
  }

  const insertAssignment = db.prepare('INSERT INTO assignment (course_id, name, sort_order) VALUES (?, ?, ?)');
  for (const c of courses) {
    insertAssignment.run(c.id, 'Midterm', 1);
    insertAssignment.run(c.id, 'Final Exam', 2);
  }

  const insertGrade = db.prepare('INSERT INTO grade (login_uid, assignment_id, score) VALUES (?, ?, ?)');
  const allEnrollments = db.prepare('SELECT login_uid, course_id FROM enrollment').all();
  const allAssignments = db.prepare('SELECT id, course_id FROM assignment').all();

  for (const enr of allEnrollments) {
    const courseAssignments = allAssignments.filter(a => a.course_id === enr.course_id);
    for (const a of courseAssignments) {
      const score = Math.floor(Math.random() * 41) + 60;
      insertGrade.run(enr.login_uid, a.id, score);
    }
  }
});

seed();

// --- Part 1: Denormalized Tables ---
db.exec(`
  CREATE TABLE student_courses AS
  SELECT
    e.login_uid     AS login_uid,
    c.id            AS course_id,
    c.code          AS course_code,
    c.title         AS course_title,
    c.instructor    AS instructor
  FROM enrollment e
  JOIN course c ON c.id = e.course_id;

  CREATE INDEX idx_student_courses_login_uid ON student_courses(login_uid);

  CREATE TABLE professor_courses AS
  SELECT
    c.professor_uid AS professor_uid,
    c.id            AS course_id,
    c.code          AS course_code,
    c.title         AS course_title,
    c.instructor    AS instructor
  FROM course c
  WHERE c.professor_uid IS NOT NULL;

  CREATE INDEX idx_professor_courses_professor_uid ON professor_courses(professor_uid);

  CREATE TABLE course_content AS
  SELECT
    w.course_id     AS course_id,
    w.id            AS week_id,
    w.title         AS week_title,
    w.sort_order    AS week_sort,
    en.id           AS entry_id,
    en.title        AS entry_title,
    en.type         AS entry_type,
    en.url          AS entry_url,
    en.sort_order   AS entry_sort
  FROM week w
  JOIN entry en ON en.week_id = w.id;

  CREATE INDEX idx_course_content_course_id ON course_content(course_id);

  CREATE TABLE course_students AS
  SELECT
    e.course_id AS course_id,
    l.uid       AS uid,
    l.name      AS name
  FROM enrollment e
  JOIN login l ON l.uid = e.login_uid;

  CREATE INDEX idx_course_students_course_id ON course_students(course_id);

  CREATE TABLE student_grades AS
  SELECT
    g.login_uid     AS login_uid,
    a.course_id     AS course_id,
    g.id            AS grade_id,
    a.id            AS assignment_id,
    a.name          AS assignment_name,
    g.score         AS score,
    a.sort_order    AS sort_order
  FROM grade g
  JOIN assignment a ON a.id = g.assignment_id;

  CREATE INDEX idx_student_grades_lookup ON student_grades(login_uid, course_id);
  CREATE INDEX idx_student_grades_grade_id ON student_grades(grade_id);
`);

console.log('Database initialized successfully.');
db.close();
