const state = {
  csrfToken: '',
  user: null,
  bookings: [],
  payments: [],
  paymentMethods: ['card', 'upi', 'wallet']
};

const els = {
  welcomeText: document.getElementById('welcomeText'),
  logoutBtn: document.getElementById('logoutBtn'),
  paymentForm: document.getElementById('paymentForm'),
  bookingSelect: document.getElementById('bookingSelect'),
  amountDisplay: document.getElementById('amountDisplay'),
  paymentMethod: document.getElementById('paymentMethod'),
  payerName: document.getElementById('payerName'),
  cardNumber: document.getElementById('cardNumber'),
  paymentRows: document.getElementById('paymentRows'),
  toast: document.getElementById('toast')
};

function showToast(message) {
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

function formatDate(iso) {
  if (!iso) {
    return '-';
  }
  return new Date(iso).toLocaleString();
}

function renderMethods() {
  els.paymentMethod.innerHTML = state.paymentMethods
    .map((method) => `<option value="${method}">${method.toUpperCase()}</option>`)
    .join('');
}

function selectedBooking() {
  return state.bookings.find((booking) => booking.id === els.bookingSelect.value);
}

function renderBookingOptions() {
  const unpaid = state.bookings.filter((booking) => booking.paymentStatus !== 'Paid');

  if (unpaid.length === 0) {
    els.bookingSelect.innerHTML = '<option value="">No unpaid booking</option>';
    els.amountDisplay.value = '$0';
    return;
  }

  els.bookingSelect.innerHTML = unpaid
    .map(
      (booking) =>
        `<option value="${booking.id}">${booking.service.title} | ${booking.scheduledDate} ${booking.slot}</option>`
    )
    .join('');

  const first = unpaid[0];
  els.bookingSelect.value = first.id;
  els.amountDisplay.value = `$${first.priceLocked}`;
}

function renderPayments() {
  if (state.payments.length === 0) {
    els.paymentRows.innerHTML = '<tr><td colspan="6">No payments yet.</td></tr>';
    return;
  }

  els.paymentRows.innerHTML = state.payments
    .map(
      (payment) => `
      <tr>
        <td>${payment.transactionId}</td>
        <td>${payment.service.title}</td>
        <td>$${payment.amount}</td>
        <td>${payment.method.toUpperCase()}</td>
        <td>****${payment.cardLast4}</td>
        <td>${formatDate(payment.paidAt)}</td>
      </tr>
    `
    )
    .join('');
}

async function loadData() {
  const [bookingsData, paymentsData] = await Promise.all([api('/api/bookings'), api('/api/payments')]);
  state.bookings = bookingsData.bookings;
  state.payments = paymentsData.payments;
  renderBookingOptions();
  renderPayments();
}

function wireEvents() {
  els.bookingSelect.addEventListener('change', () => {
    const booking = selectedBooking();
    els.amountDisplay.value = booking ? `$${booking.priceLocked}` : '$0';
  });

  els.paymentForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const booking = selectedBooking();
    if (!booking) {
      showToast('No unpaid booking selected.');
      return;
    }

    const digits = els.cardNumber.value.replace(/\D/g, '');
    if (digits.length < 12) {
      showToast('Enter a valid payment number.');
      return;
    }

    try {
      await api('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          bookingId: booking.id,
          method: els.paymentMethod.value,
          payerName: els.payerName.value.trim(),
          cardNumber: els.cardNumber.value
        })
      });

      els.cardNumber.value = '';
      showToast('Payment successful. Booking is now paid.');
      await loadData();
    } catch (error) {
      showToast(error.message);
    }
  });

  els.logoutBtn.addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
      window.location.href = '/';
    } catch (error) {
      showToast(error.message);
    }
  });
}

async function init() {
  try {
    const me = await api('/api/auth/me');
    state.user = me.user;
    state.csrfToken = me.csrfToken;
    els.welcomeText.textContent = `${state.user.name}, payments`; 
  } catch {
    window.location.href = '/';
    return;
  }

  try {
    const meta = await api('/api/meta');
    state.paymentMethods = meta.paymentMethods || state.paymentMethods;
  } catch {
    // Fall back to defaults.
  }

  renderMethods();
  wireEvents();
  await loadData();
}

init();