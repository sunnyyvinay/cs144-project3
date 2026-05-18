document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const uid = document.getElementById('uid').value.trim();
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.classList.add('hidden');

  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, password }),
  });

  if (!res.ok) {
    errorEl.textContent = 'Invalid UID or password.';
    errorEl.classList.remove('hidden');
    return;
  }

  currentStudent = await res.json();
  if (currentStudent.role === 'professor') {
    loadProfessorDashboard();
  } else {
    loadDashboard();
  }
});
