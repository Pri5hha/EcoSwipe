const state = {
  registerMode: true
};

const els = {
  authForm: document.getElementById('authForm'),
  authTitle: document.getElementById('authTitle'),
  authHint: document.getElementById('authHint'),
  nameInput: document.getElementById('nameInput'),
  emailInput: document.getElementById('emailInput'),
  passwordInput: document.getElementById('passwordInput'),
  submitBtn: document.getElementById('submitBtn'),
  switchModeBtn: document.getElementById('switchModeBtn'),
  toast: document.getElementById('toast')
};

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.add('hidden'), 2600);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    credentials: 'include'
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || 'Request failed');
  }

  return payload;
}

function setMode(registerMode) {
  state.registerMode = registerMode;
  els.authTitle.textContent = registerMode ? 'Create Account' : 'Login';
  els.authHint.textContent = registerMode
    ? 'Password must include uppercase, lowercase, number, and symbol.'
    : 'Sign in to continue to your EcoSwipe dashboard.';
  els.submitBtn.textContent = registerMode ? 'Register' : 'Login';
  els.switchModeBtn.textContent = registerMode ? 'Switch to Login' : 'Switch to Register';
  els.nameInput.classList.toggle('hidden', !registerMode);
}

async function submitAuth(e) {
  e.preventDefault();

  const endpoint = state.registerMode ? '/api/auth/register' : '/api/auth/login';
  const payload = {
    email: els.emailInput.value.trim(),
    password: els.passwordInput.value
  };
  if (state.registerMode) {
    payload.name = els.nameInput.value.trim();
  }

  await api(endpoint, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  window.location.href = '/app';
}

function init() {
  setMode(true);
  els.switchModeBtn.addEventListener('click', () => setMode(!state.registerMode));
  els.authForm.addEventListener('submit', (e) => {
    submitAuth(e).catch((err) => showToast(err.message));
  });
}

init();
