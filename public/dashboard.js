async function loadDashboard() {
  document.getElementById('user-greeting').textContent = currentStudent.name;
  const res = await fetch(`/api/students/${currentStudent.uid}/courses`);
  const courses = await res.json();

  const grid = document.getElementById('course-list');
  grid.innerHTML = '';

  // TODO: Data from the server should be safe to render in the page
  courses.forEach((course, i) => {
    const card = document.createElement('div');
    card.className = `course-card course-color-${i % 5}`;
    card.innerHTML = `
      <img src="/images/course-${course.course_id}.jpg" alt="${course.course_code}" class="course-card-img">
      <div class="course-card-banner">
        <div class="card-code">${course.course_code}</div>
        <div class="card-instructor">${course.instructor}</div>
      </div>
    `;
    card.addEventListener('click', () => loadCourse(course));
    grid.appendChild(card);
  });

  showScreen('dashboard-screen');
}

async function loadProfessorDashboard() {
  document.getElementById('user-greeting').textContent = `Prof. ${currentStudent.name}`;
  const res = await fetch(`/api/professors/${currentStudent.uid}/courses`);
  const courses = await res.json();

  const grid = document.getElementById('course-list');
  grid.innerHTML = '';

  // TODO: Data from the server should be safe to render in the page
  courses.forEach((course, i) => {
    const card = document.createElement('div');
    card.className = `course-card course-color-${i % 5}`;
    card.innerHTML = `
      <img src="/images/course-${course.course_id}.jpg" alt="${course.course_code}" class="course-card-img">
      <div class="course-card-banner">
        <div class="card-code">${course.course_code}</div>
        <div class="card-instructor">${course.instructor}</div>
      </div>
    `;
    card.addEventListener('click', () => loadProfessorGrades(course));
    grid.appendChild(card);
  });

  showScreen('dashboard-screen');
}
