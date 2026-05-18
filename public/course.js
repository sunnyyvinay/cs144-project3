const SLIDES_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
  <polyline points="14 2 14 8 20 8"/>
  <line x1="16" y1="13" x2="8" y2="13"/>
  <line x1="16" y1="17" x2="8" y2="17"/>
  <polyline points="10 9 9 9 8 9"/>
</svg>`;

const RECORDING_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <polygon points="23 7 16 12 23 17 23 7"/>
  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
</svg>`;

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
  const res = await fetch(`/api/courses/${course.course_id}/content`);
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

  const container = document.getElementById('modules-container');
  container.innerHTML = '';

  for (const wk of weeks) {
    const section = document.createElement('div');
    section.className = 'module-section';
    section.id = `week-${wk.id}`;

    const sorted = wk.entries.sort((a, b) => a.sort - b.sort);
    // TODO: Data from the server should be safe to render in the page
    let entriesHtml = '';
    for (const entry of sorted) {
      const icon = entry.type === 'slides' ? SLIDES_ICON : RECORDING_ICON;
      const iconClass = entry.type === 'slides' ? 'icon-slides' : 'icon-recording';
      entriesHtml += `
        <a href="${entry.url}" class="material-link">
          <span class="material-icon ${iconClass}">${icon}</span>
          <span>${entry.title}</span>
        </a>
      `;
    }

    const header = document.createElement('div');
    header.className = 'module-header';
    header.innerHTML = `<h3>${wk.title}</h3><span class="module-toggle">&#9660;</span>`;
    header.addEventListener('click', () => toggleModule(header));

    const body = document.createElement('div');
    body.className = 'module-body';
    body.innerHTML = `<div class="lecture-group">${entriesHtml}</div>`;

    section.appendChild(header);
    section.appendChild(body);
    container.appendChild(section);
  }
}

function toggleModule(header) {
  header.classList.toggle('collapsed');
  const body = header.nextElementSibling;
  body.classList.toggle('collapsed');
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
