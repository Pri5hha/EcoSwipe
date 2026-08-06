const state = {
  csrfToken: '',
  user: null,
  bookings: [],
  payments: [],
  ecofixOffer: null,
  quote: null,
  paymentMethods: ['card', 'upi', 'wallet'],
  bookingMonth: 'all',
  paymentMonth: 'all'
};

const els = {
  welcomeText: document.getElementById('welcomeText'),
  logoutBtn: document.getElementById('logoutBtn'),
  paymentForm: document.getElementById('paymentForm'),
  bookingSelect: document.getElementById('bookingSelect'),
  payPackageToggleWrap: document.getElementById('packagePayToggleWrap'),
  payPackageToggle: document.getElementById('payPackageToggle'),
  packagePayHint: document.getElementById('packagePayHint'),
  amountDisplay: document.getElementById('amountDisplay'),
  couponCode: document.getElementById('couponCode'),
  couponStatus: document.getElementById('couponStatus'),
  paymentMethod: document.getElementById('paymentMethod'),
  payerName: document.getElementById('payerName'),
  cardNumber: document.getElementById('cardNumber'),
  bookingMonthFilter: document.getElementById('bookingMonthFilter'),
  paymentMonthFilter: document.getElementById('paymentMonthFilter'),
  bookingRows: document.getElementById('bookingRows'),
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

function monthKeyFromValue(value) {
  if (!value) {
    return '';
  }

  if (value.length >= 7 && value[4] === '-') {
    return value.slice(0, 7);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  return `${parsed.getFullYear()}-${month}`;
}

function formatMonthLabel(key) {
  if (!key || key === 'all') {
    return 'All months';
  }
  const [year, month] = key.split('-');
  const asDate = new Date(`${year}-${month}-01T00:00:00`);
  return asDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function requestedBookingId() {
  const params = new URLSearchParams(window.location.search || '');
  const id = String(params.get('bookingId') || '').trim();
  return id || '';
}

function requestedPackageId() {
  const params = new URLSearchParams(window.location.search || '');
  const id = String(params.get('packageId') || '')
    .trim()
    .toUpperCase();
  return id || '';
}

function bundleLabelFromNotes(notes) {
  const raw = String(notes || '');
  const match = raw.match(/Bundle booking:\s*([^|]+)/i) || raw.match(/Bundle:\s*([^|]+)/i);
  return match ? match[1].trim() : '';
}

function packageLabelFromNotes(notes) {
  const raw = String(notes || '');
  const match = raw.match(/Task package:\s*([^|]+)/i) || raw.match(/Package booking:\s*([^|]+)/i);
  return match ? match[1].trim() : '';
}

function packageIdFromNotes(notes) {
  const raw = String(notes || '');
  const match = raw.match(/Package ID:\s*([A-Z0-9-]+)/i);
  return match ? String(match[1]).trim().toUpperCase() : '';
}

function packageIdFromBooking(item) {
  const fromApi = String(item?.packageId || '')
    .trim()
    .toUpperCase();
  if (fromApi) {
    return fromApi;
  }
  return packageIdFromNotes(item?.notes);
}

function bookingDisplayLabel(item) {
  const packageLabel = String(item?.packageLabel || packageLabelFromNotes(item?.notes)).trim();
  if (packageLabel) {
    return `Package Booking: ${packageLabel}`;
  }
  const label = String(item?.bundleLabel || bundleLabelFromNotes(item?.notes)).trim();
  if (label) {
    return `Bundle Booking: ${label}`;
  }
  return item?.service?.title || 'Service';
}

function normalizeBookingStatus(status) {
  const value = String(status || '')
    .trim()
    .toLowerCase();
  if (['approved', 'accepted', 'completed'].includes(value)) return 'approved';
  if (['cancelled', 'canceled', 'rejected'].includes(value)) return 'cancelled';
  return 'pending';
}

function bookingStatusLabel(status) {
  const key = normalizeBookingStatus(status);
  if (key === 'approved') return 'Approved';
  if (key === 'cancelled') return 'Cancelled';
  return 'Pending';
}

function renderMethods() {
  els.paymentMethod.innerHTML = state.paymentMethods
    .map((method) => `<option value="${method}">${method.toUpperCase()}</option>`)
    .join('');
}

function selectedBooking() {
  return state.bookings.find((booking) => booking.id === els.bookingSelect.value);
}

function selectedPackageId() {
  const booking = selectedBooking();
  return booking ? packageIdFromBooking(booking) : '';
}

function updatePackagePayControls() {
  if (!els.payPackageToggleWrap || !els.payPackageToggle || !els.packagePayHint) {
    return;
  }
  const packageId = selectedPackageId();
  if (!packageId) {
    els.payPackageToggleWrap.classList.add('hidden');
    els.payPackageToggle.checked = false;
    els.packagePayHint.textContent = 'Pay all services in this package in one transaction flow.';
    return;
  }
  const unpaidInPackage = state.bookings.filter((booking) => {
    if (booking.paymentStatus === 'Paid') return false;
    if (normalizeBookingStatus(booking.statusKey || booking.status) === 'cancelled') return false;
    return packageIdFromBooking(booking) === packageId;
  });
  els.payPackageToggleWrap.classList.remove('hidden');
  els.payPackageToggle.checked = unpaidInPackage.length > 1;
  els.packagePayHint.textContent = `Package ${packageId}: ${unpaidInPackage.length} unpaid service${
    unpaidInPackage.length === 1 ? '' : 's'
  }`;
}

function setCouponStatus(message) {
  if (!els.couponStatus) return;
  els.couponStatus.textContent = message || '';
}

async function refreshQuote() {
  const booking = selectedBooking();
  if (!booking) {
    state.quote = null;
    els.amountDisplay.value = '$0';
    setCouponStatus('No unpaid booking selected.');
    return;
  }

  const couponCode = String(els.couponCode?.value || '')
    .trim()
    .toUpperCase();
  const packageId = selectedPackageId();
  const payAsPackage = Boolean(els.payPackageToggle?.checked && packageId);

  try {
    const params = new URLSearchParams(payAsPackage ? { packageId } : { bookingId: booking.id });
    if (couponCode) params.set('couponCode', couponCode);
    const data = await api(`${payAsPackage ? '/api/payments/package-quote' : '/api/payments/quote'}?${params.toString()}`);
    state.quote = data.quote || null;
    const payable = Number(state.quote?.payableAmount || booking.priceLocked || 0);
    els.amountDisplay.value = `$${payable.toFixed(2)}`;
    if (couponCode && Number(state.quote?.discountAmount || 0) > 0) {
      setCouponStatus(
        `Coupon ${state.quote.couponCode} applied: -$${Number(state.quote.discountAmount).toFixed(2)} (${Number(
          state.quote.discountPct || 0
        ).toFixed(1)}%)`
      );
    } else if (state.ecofixOffer?.activeCoupon) {
      const c = state.ecofixOffer.activeCoupon;
      setCouponStatus(`Active coupon available: ${c.code} (${c.discountPct}% off, expires in ${Number(c.expiresInHours || 0).toFixed(1)}h)`);
    } else {
      setCouponStatus('No coupon applied.');
    }
    if (payAsPackage && state.quote?.bookingCount) {
      setCouponStatus(`${els.couponStatus.textContent} | Package pay for ${state.quote.bookingCount} services`);
    }
  } catch (error) {
    state.quote = null;
    els.amountDisplay.value = `$${Number(booking.priceLocked || 0).toFixed(2)}`;
    setCouponStatus(error.message || 'Coupon could not be applied.');
  }
}

function renderMonthFilters() {
  const bookingMonths = [...new Set(state.bookings.map((booking) => monthKeyFromValue(booking.scheduledDate)).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a));
  const paymentMonths = [...new Set(state.payments.map((payment) => monthKeyFromValue(payment.paidAt)).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a));

  els.bookingMonthFilter.innerHTML = ['all', ...bookingMonths]
    .map((key) => `<option value="${key}">${formatMonthLabel(key)}</option>`)
    .join('');
  els.paymentMonthFilter.innerHTML = ['all', ...paymentMonths]
    .map((key) => `<option value="${key}">${formatMonthLabel(key)}</option>`)
    .join('');

  if (![...bookingMonths, 'all'].includes(state.bookingMonth)) {
    state.bookingMonth = 'all';
  }
  if (![...paymentMonths, 'all'].includes(state.paymentMonth)) {
    state.paymentMonth = 'all';
  }

  els.bookingMonthFilter.value = state.bookingMonth;
  els.paymentMonthFilter.value = state.paymentMonth;
}

function renderBookingOptions() {
  const unpaid = state.bookings.filter((booking) => {
    if (booking.paymentStatus === 'Paid') return false;
    return normalizeBookingStatus(booking.statusKey || booking.status) !== 'cancelled';
  });

  if (unpaid.length === 0) {
    els.bookingSelect.innerHTML = '<option value="">No unpaid booking</option>';
    els.amountDisplay.value = '$0';
    updatePackagePayControls();
    return;
  }

  els.bookingSelect.innerHTML = unpaid
    .map(
      (booking) =>
        `<option value="${booking.id}">${bookingDisplayLabel(booking)} | ${booking.scheduledDate} ${booking.slot}</option>`
    )
    .join('');

  const requestedId = requestedBookingId();
  const requestedPkg = requestedPackageId();
  const requestedPkgMatch = requestedPkg ? unpaid.find((item) => packageIdFromBooking(item) === requestedPkg) : null;
  const requestedMatch = requestedId ? unpaid.find((item) => item.id === requestedId) : null;
  const first = unpaid[0];
  els.bookingSelect.value = (requestedMatch || requestedPkgMatch || first).id;
  if (!els.couponCode.value && state.ecofixOffer?.activeCoupon?.code) {
    els.couponCode.value = String(state.ecofixOffer.activeCoupon.code).toUpperCase();
  }
  els.amountDisplay.value = `$${Number(first.priceLocked || 0).toFixed(2)}`;
  updatePackagePayControls();
}

function renderBookingHistory() {
  const filtered = state.bookings.filter((booking) => {
    if (state.bookingMonth === 'all') {
      return true;
    }
    return monthKeyFromValue(booking.scheduledDate) === state.bookingMonth;
  });

  if (filtered.length === 0) {
    els.bookingRows.innerHTML = '<tr><td colspan="5">No bookings in this month.</td></tr>';
    return;
  }

  els.bookingRows.innerHTML = filtered
    .map(
      (booking) => `
      <tr>
        <td>${bookingDisplayLabel(booking)}</td>
        <td>${booking.scheduledDate}</td>
        <td>${booking.slot}</td>
        <td>${booking.paymentStatus}</td>
        <td>$${booking.priceLocked}</td>
      </tr>
    `
    )
    .join('');
}

function renderPayments() {
  const filtered = state.payments.filter((payment) => {
    if (state.paymentMonth === 'all') {
      return true;
    }
    return monthKeyFromValue(payment.paidAt) === state.paymentMonth;
  });

  if (filtered.length === 0) {
    els.paymentRows.innerHTML = '<tr><td colspan="7">No payments in this month.</td></tr>';
    return;
  }

  els.paymentRows.innerHTML = filtered
    .map(
      (payment) => `
      <tr>
        <td>${payment.transactionId}</td>
        <td>${bookingDisplayLabel(payment)}</td>
        <td>$${payment.amount}${Number(payment.discountAmount || 0) > 0 ? `<br /><small>Offer ${payment.discountCode} (-$${Number(payment.discountAmount).toFixed(2)})</small>` : ''}</td>
        <td>${payment.method.toUpperCase()}</td>
        <td>****${payment.cardLast4}</td>
        <td>${formatDate(payment.paidAt)}</td>
        <td><a class="btn btn-ghost circle-inline-btn" href="/app?receiptBookingId=${payment.bookingId}#impactReceiptPanel">Receipt</a></td>
      </tr>
    `
    )
    .join('');
}

async function loadData() {
  const [bookingsData, paymentsData, offerData] = await Promise.all([
    api('/api/bookings'),
    api('/api/payments'),
    api('/api/offers/ecofix').catch(() => null)
  ]);
  state.bookings = bookingsData.bookings;
  state.payments = paymentsData.payments;
  state.ecofixOffer = offerData;
  renderMonthFilters();
  renderBookingOptions();
  renderBookingHistory();
  renderPayments();
  await refreshQuote();
}

function wireEvents() {
  els.bookingSelect.addEventListener('change', () => {
    updatePackagePayControls();
    refreshQuote().catch((error) => setCouponStatus(error.message));
  });

  if (els.payPackageToggle) {
    els.payPackageToggle.addEventListener('change', () => {
      refreshQuote().catch((error) => setCouponStatus(error.message));
    });
  }

  if (els.couponCode) {
    els.couponCode.addEventListener('input', () => {
      refreshQuote().catch((error) => setCouponStatus(error.message));
    });
  }

  els.bookingMonthFilter.addEventListener('change', () => {
    state.bookingMonth = els.bookingMonthFilter.value;
    renderBookingHistory();
  });

  els.paymentMonthFilter.addEventListener('change', () => {
    state.paymentMonth = els.paymentMonthFilter.value;
    renderPayments();
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
      const packageId = selectedPackageId();
      const payAsPackage = Boolean(els.payPackageToggle?.checked && packageId);
      if (payAsPackage) {
        const result = await api('/api/payments/package', {
          method: 'POST',
          body: JSON.stringify({
            packageId,
            method: els.paymentMethod.value,
            payerName: els.payerName.value.trim(),
            cardNumber: els.cardNumber.value,
            couponCode: String(els.couponCode.value || '')
              .trim()
              .toUpperCase()
          })
        });
        showToast(
          `Package paid: ${result.packagePayment?.bookingCount || 0} services | $${Number(
            result.packagePayment?.totalPaid || 0
          ).toFixed(2)}`
        );
      } else {
        await api('/api/payments', {
          method: 'POST',
          body: JSON.stringify({
            bookingId: booking.id,
            method: els.paymentMethod.value,
            payerName: els.payerName.value.trim(),
            cardNumber: els.cardNumber.value,
            couponCode: String(els.couponCode.value || '')
              .trim()
              .toUpperCase()
          })
        });
        showToast('Payment successful. Booking is now paid.');
      }

      els.cardNumber.value = '';
      els.couponCode.value = '';
      setCouponStatus('Payment completed.');
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
