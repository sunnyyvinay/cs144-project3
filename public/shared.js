let currentStudent = null;

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.body.className = id === 'hacked-screen' ? 'hacked-body' : '';
}

// Escape any string before interpolating it into innerHTML. Used wherever
// server data still has to flow through an HTML template (e.g. table rows
// built with string concatenation). The same fetch wrapper attaches cookies
// so JWT auth survives across requests.
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function apiFetch(url, options = {}) {
  return fetch(url, { credentials: 'same-origin', ...options });
}

async function logout() {
  try { await apiFetch('/api/logout', { method: 'POST' }); } catch {}
  currentStudent = null;
  const uidInput = document.getElementById('uid');
  const pwInput = document.getElementById('password');
  if (uidInput) uidInput.value = '';
  if (pwInput) pwInput.value = '';
  showScreen('login-screen');
}

function letterGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

document.getElementById('logout-btn').addEventListener('click', logout);
document.getElementById('course-logout-btn').addEventListener('click', logout);
document.getElementById('prof-logout-btn').addEventListener('click', logout);
