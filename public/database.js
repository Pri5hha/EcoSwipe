const state = {
  csrfToken: '',
  overview: null
};

const els = {
  logoutBtn: document.getElementById('logoutBtn'),
  kpiGrid: document.getElementById('kpiGrid'),
  usersRows: document.getElementById('usersRows'),
  swipesRows: document.getElementById('swipesRows'),
  bookingsRows: document.getElementById('bookingsRows'),
  reviewsRows: document.getElementById('reviewsRows'),
  paymentsRows: document.getElementById('paymentsRows'),
  toast: document.getElementById('toast')
};

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.add('hidden'), 2800);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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

function renderCounts(counts) {
  const keys = ['users', 'swipes', 'bookings', 'reviews', 'payments', 'catalogServices'];
  const labels = {
    users: 'Users',
    swipes: 'Swipes',
    bookings: 'Bookings',
    reviews: 'Reviews',
    payments: 'Payments',
    catalogServices: 'Service Cards'
  };

  els.kpiGrid.innerHTML = keys
    .map(
      (key) => `
      <div>
        <small>${labels[key]}</small>
        <strong>${counts[key] ?? 0}</strong>
      </div>
    `
    )
    .join('');
}

function renderOverview(data) {
  renderCounts(data.counts || {});

  els.usersRows.innerHTML = (data.users || [])
    .map(
      (row) => `
      <tr>
        <td>${escapeHtml(row.id)}</td>
        <td>${escapeHtml(row.name)}</td>
        <td>${escapeHtml(row.email)}</td>
        <td>${escapeHtml(row.createdAt)}</td>
        <td>${escapeHtml(row.accent)}</td>
      </tr>
    `
    )
    .join('');

  els.swipesRows.innerHTML = (data.swipes || [])
    .map(
      (row) => `
      <tr>
        <td>${escapeHtml(row.id)}</td>
        <td>${escapeHtml(row.userId)}</td>
        <td>${escapeHtml(row.serviceId)}</td>
        <td>${escapeHtml(row.action)}</td>
        <td>${escapeHtml(row.createdAt)}</td>
      </tr>
    `
    )
    .join('');

  els.bookingsRows.innerHTML = (data.bookings || [])
    .map(
      (row) => `
      <tr>
        <td>${escapeHtml(row.id)}</td>
        <td>${escapeHtml(row.userId)}</td>
        <td>${escapeHtml(row.serviceId)}</td>
        <td>${escapeHtml(row.scheduledDate)}</td>
        <td>${escapeHtml(row.slot)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.paymentStatus)}</td>
      </tr>
    `
    )
    .join('');

  els.reviewsRows.innerHTML = (data.reviews || [])
    .map(
      (row) => `
      <tr>
        <td>${escapeHtml(row.id)}</td>
        <td>${escapeHtml(row.userId)}</td>
        <td>${escapeHtml(row.bookingId)}</td>
        <td>${escapeHtml(row.serviceId)}</td>
        <td>${escapeHtml(row.rating)}</td>
        <td>${escapeHtml(row.comment)}</td>
      </tr>
    `
    )
    .join('');

  els.paymentsRows.innerHTML = (data.payments || [])
    .map(
      (row) => `
      <tr>
        <td>${escapeHtml(row.id)}</td>
        <td>${escapeHtml(row.userId)}</td>
        <td>${escapeHtml(row.bookingId)}</td>
        <td>$${escapeHtml(row.amount)}</td>
        <td>${escapeHtml(row.method)}</td>
        <td>${escapeHtml(row.transactionId)}</td>
        <td>${escapeHtml(row.paidAt)}</td>
      </tr>
    `
    )
    .join('');
}

async function init() {
  try {
    const me = await api('/api/auth/me');
    state.csrfToken = me.csrfToken;
  } catch {
    window.location.href = '/';
    return;
  }

  try {
    state.overview = await api('/api/admin/overview');
    renderOverview(state.overview);
  } catch (error) {
    showToast(error.message);
  }

  els.logoutBtn.addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
      window.location.href = '/';
    } catch (error) {
      showToast(error.message);
    }
  });
}

init();