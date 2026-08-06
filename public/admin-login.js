const state = {
  csrfToken: ''
};

const els = {
  form: document.getElementById('adminLoginForm'),
  email: document.getElementById('adminEmailInput'),
  password: document.getElementById('adminPasswordInput'),
  toast: document.getElementById('toast')
};

function showToast(message) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.add('hidden'), 2800);
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (options.method && options.method !== 'GET' && state.csrfToken) {
    headers['x-csrf-token'] = state.csrfToken;
  }
  const res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include'
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || 'Request failed');
  }
  return payload;
}

async function ensureAdminSession() {
  const me = await api('/api/auth/me');
  state.csrfToken = me.csrfToken;
  if (me.user?.isAdmin) {
    window.location.href = '/admin';
    return true;
  }
  return false;
}

async function submitLogin(event) {
  event.preventDefault();
  await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: String(els.email.value || '').trim(),
      password: String(els.password.value || '')
    })
  });

  const me = await api('/api/auth/me');
  state.csrfToken = me.csrfToken;
  if (!me.user?.isAdmin) {
    await api('/api/auth/logout', { method: 'POST' });
    throw new Error('This account does not have admin access.');
  }
  window.location.href = '/admin';
}

async function init() {
  try {
    const redirected = await ensureAdminSession();
    if (redirected) return;
  } catch {
    // Not logged in yet; continue on login screen.
  }

  els.form.addEventListener('submit', (event) => {
    submitLogin(event).catch((err) => showToast(err.message));
  });
}

init();

