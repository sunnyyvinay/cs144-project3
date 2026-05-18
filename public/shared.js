let currentStudent = null;

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.body.className = id === 'hacked-screen' ? 'hacked-body' : '';
}

function logout() {
  currentStudent = null;
  document.getElementById('uid').value = '';
  document.getElementById('password').value = '';
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
