function buildCourseCard(course, i, onClick) {
  const card = document.createElement('div');
  card.className = `course-card course-color-${i % 5}`;

  const img = document.createElement('img');
  img.className = 'course-card-img';
  img.src = `/images/course-${encodeURIComponent(course.course_id)}.jpg`;
  img.alt = course.course_code;

  const banner = document.createElement('div');
  banner.className = 'course-card-banner';

  const code = document.createElement('div');
  code.className = 'card-code';
  code.textContent = course.course_code;

  const instructor = document.createElement('div');
  instructor.className = 'card-instructor';
  instructor.textContent = course.instructor;

  banner.append(code, instructor);
  card.append(img, banner);
  card.addEventListener('click', () => onClick(course));
  return card;
}

async function loadDashboard() {
  document.getElementById('user-greeting').textContent = currentStudent.name;
  const res = await apiFetch(`/api/students/${encodeURIComponent(currentStudent.uid)}/courses`);
  const courses = await res.json();

  const grid = document.getElementById('course-list');
  grid.innerHTML = '';
  courses.forEach((course, i) => grid.appendChild(buildCourseCard(course, i, loadCourse)));
  showScreen('dashboard-screen');
}

async function loadProfessorDashboard() {
  document.getElementById('user-greeting').textContent = `Prof. ${currentStudent.name}`;
  const res = await apiFetch(`/api/professors/${encodeURIComponent(currentStudent.uid)}/courses`);
  const courses = await res.json();

  const grid = document.getElementById('course-list');
  grid.innerHTML = '';
  courses.forEach((course, i) => grid.appendChild(buildCourseCard(course, i, loadProfessorGrades)));
  showScreen('dashboard-screen');
}
