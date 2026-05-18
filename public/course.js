let currentCourse = null;

async function loadCourse(course) {
  currentCourse = course;
  document.getElementById('course-user-greeting').textContent = currentStudent.name;
  document.getElementById('sidebar-course-code').textContent = course.course_code;
  document.getElementById('course-title-header').textContent =
    `${course.course_code}: ${course.course_title}`;

  // Reset sidebar nav to Modules active
  document.getElementById('nav-modules').classList.add('active');
  document.getElementById('nav-grades').classList.remove('active');
  document.getElementById('sidebar-modules').style.display = '';

  await loadModules(course);

  document.getElementById('back-to-dashboard').onclick = () => loadDashboard();

  showScreen('course-screen');
}

async function loadModules(course) {
  const res = await apiFetch(`/api/courses/${encodeURIComponent(course.course_id)}/content`);
  const rows = await res.json();

  const weeks = [];
  const weekMap = new Map();

  for (const row of rows) {
    if (!weekMap.has(row.week_id)) {
      const wk = {
        id: row.week_id,
        title: row.week_title,
        sort: row.week_sort,
        entries: [],
      };
      weekMap.set(row.week_id, wk);
      weeks.push(wk);
    }

    weekMap.get(row.week_id).entries.push({
      id: row.entry_id,
      title: row.entry_title,
      type: row.entry_type,
      url: row.entry_url,
      sort: row.entry_sort,
    });
  }

  weeks.sort((a, b) => a.sort - b.sort);

  const sidebarList = document.getElementById('sidebar-modules');
  sidebarList.innerHTML = '';
  weeks.forEach((wk, i) => {
    const li = document.createElement('li');
    li.textContent = wk.title;
    if (i === 0) li.classList.add('active');
    li.addEventListener('click', () => {
      sidebarList.querySelectorAll('li').forEach(l => l.classList.remove('active'));
      li.classList.add('active');
      const target = document.getElementById(`week-${wk.id}`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    sidebarList.appendChild(li);
  });

  // Module list is rendered by the React bundle in course-react.js, which
  // exposes window.mountCourseContent. The sidebar above stays vanilla per
  // the assignment.
  const container = document.getElementById('modules-container');
  window.mountCourseContent(container, weeks);
}

// Sidebar nav: Modules vs Grades
document.getElementById('nav-modules').addEventListener('click', async () => {
  document.getElementById('nav-modules').classList.add('active');
  document.getElementById('nav-grades').classList.remove('active');
  document.getElementById('sidebar-modules').style.display = '';
  document.getElementById('course-title-header').textContent =
    `${currentCourse.course_code}: ${currentCourse.course_title}`;
  await loadModules(currentCourse);
});

document.getElementById('nav-grades').addEventListener('click', async () => {
  document.getElementById('nav-grades').classList.add('active');
  document.getElementById('nav-modules').classList.remove('active');
  document.getElementById('sidebar-modules').style.display = 'none';
  document.getElementById('course-title-header').textContent =
    `${currentCourse.course_code}: Grades`;
  await loadStudentGrades(currentCourse);
});
