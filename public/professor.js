let profStudents = [];
let profCurrentIndex = 0;
let profCurrentCourse = null;

async function loadProfessorGrades(course) {
  profCurrentCourse = course;
  document.getElementById('prof-user-greeting').textContent = `Prof. ${currentStudent.name}`;
  document.getElementById('prof-course-title').textContent =
    `${course.course_code}: ${course.course_title}`;

  const res = await fetch(`/api/courses/${course.course_id}/students`);
  profStudents = await res.json();

  if (profStudents.length === 0) {
    document.getElementById('prof-grades-tbody').innerHTML =
      '<tr><td colspan="3">No students enrolled.</td></tr>';
    document.getElementById('prof-grades-tfoot').innerHTML = '';
    document.getElementById('student-indicator').textContent = 'No students';
    document.getElementById('prof-student-name').textContent = '';
    showScreen('professor-grades-screen');
    return;
  }

  profCurrentIndex = 0;
  await renderProfessorGrades();
  showScreen('professor-grades-screen');
}

async function renderProfessorGrades() {
  const student = profStudents[profCurrentIndex];

  document.getElementById('student-indicator').textContent =
    `Student ${profCurrentIndex + 1} of ${profStudents.length}`;
  document.getElementById('prof-student-name').textContent = student.name;
  document.getElementById('prev-student').disabled = profCurrentIndex === 0;
  document.getElementById('next-student').disabled = profCurrentIndex === profStudents.length - 1;

  const res = await fetch(
    `/api/students/${student.uid}/courses/${profCurrentCourse.course_id}/grades`
  );
  const grades = await res.json();

  const tbody = document.getElementById('prof-grades-tbody');
  tbody.innerHTML = '';

  let totalScore = 0;

  // TODO: Data from the server should be safe to render in the page
  for (const g of grades) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${g.assignment_name}</td>
      <td><input type="number" name="grade_${g.grade_id}" value="${g.score}" min="0" max="100" class="grade-input"></td>
      <td>100</td>
    `;
    tbody.appendChild(tr);
    totalScore += g.score;
  }

  const finalGrade = grades.length > 0 ? (totalScore / grades.length).toFixed(1) : '0.0';
  const letter = letterGrade(parseFloat(finalGrade));

  document.getElementById('prof-grades-tfoot').innerHTML = `
    <tr class="final-row">
      <td><strong>Final Grade</strong></td>
      <td><strong>${finalGrade}</strong></td>
      <td><strong>100</strong></td>
    </tr>
    <tr class="letter-row">
      <td><strong>Letter Grade</strong></td>
      <td colspan="2"><strong class="letter-${letter}">${letter}</strong></td>
    </tr>
  `;

  document.getElementById('prof-save-status').textContent = '';

  tbody.addEventListener('input', () => {
    const inputs = tbody.querySelectorAll('input[type="number"]');
    let total = 0;
    for (const input of inputs) total += parseInt(input.value) || 0;
    const avg = inputs.length > 0 ? (total / inputs.length).toFixed(1) : '0.0';
    const letter = letterGrade(parseFloat(avg));
    document.getElementById('prof-grades-tfoot').innerHTML = `
      <tr class="final-row">
        <td><strong>Final Grade</strong></td>
        <td><strong>${avg}</strong></td>
        <td><strong>100</strong></td>
      </tr>
      <tr class="letter-row">
        <td><strong>Letter Grade</strong></td>
        <td colspan="2"><strong class="letter-${letter}">${letter}</strong></td>
      </tr>
    `;
  });
}

document.getElementById('prev-student').addEventListener('click', async () => {
  if (profCurrentIndex > 0) {
    profCurrentIndex--;
    await renderProfessorGrades();
  }
});

document.getElementById('next-student').addEventListener('click', async () => {
  if (profCurrentIndex < profStudents.length - 1) {
    profCurrentIndex++;
    await renderProfessorGrades();
  }
});

document.getElementById('prof-back-btn').addEventListener('click', () => {
  loadProfessorDashboard();
});

document.getElementById('prof-grades-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const grades = [];

  for (const input of e.target.querySelectorAll('input[type="number"]')) {
    grades.push({
      grade_id: parseInt(input.name.split('_')[1]),
      score: parseInt(input.value)
    });
  }

  await fetch('/api/grades', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grades })
  });

  document.getElementById('prof-save-status').textContent = 'Grades saved!';
});
