async function loadStudentGrades(course) {
  const res = await apiFetch(
    `/api/students/${encodeURIComponent(currentStudent.uid)}/courses/${encodeURIComponent(course.course_id)}/grades`
  );
  const grades = await res.json();

  const container = document.getElementById('modules-container');

  let rowsHtml = '';
  let totalScore = 0;

  for (const g of grades) {
    const gradeId = Number(g.grade_id);
    const score = Number(g.score);
    rowsHtml += `
          <tr>
            <td>${escapeHtml(g.assignment_name)}</td>
            <td>${score}</td>
            <td>100</td>
            <input type="hidden" name="grade_${gradeId}" value="${score}">
          </tr>`;
    totalScore += score;
  }

  const finalGrade = grades.length > 0 ? (totalScore / grades.length).toFixed(1) : '0.0';
  const letter = letterGrade(parseFloat(finalGrade));

  container.innerHTML = `
    <div class="grades-container">
      <table class="grades-table">
        <thead>
          <tr>
            <th>Assignment</th>
            <th>Score</th>
            <th>Out Of</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}
        </tbody>
        <tfoot>
          <tr class="final-row">
            <td><strong>Final Grade</strong></td>
            <td><strong>${finalGrade}</strong></td>
            <td><strong>100</strong></td>
          </tr>
          <tr class="letter-row">
            <td><strong>Letter Grade</strong></td>
            <td colspan="2"><strong class="letter-${letter}">${letter}</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}
