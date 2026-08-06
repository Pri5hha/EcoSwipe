const state = {
  csrfToken: '',
  user: null,
  catalog: [],
  timeSlots: [],
  services: [],
  bookings: [],
  reviews: [],
  chartPayload: null
};
let filterRefreshTimer;

const els = {
  welcomeText: document.getElementById('welcomeText'),
  logoutBtn: document.getElementById('logoutBtn'),
  cardStack: document.getElementById('cardStack'),
  emptyState: document.getElementById('emptyState'),
  skipBtn: document.getElementById('skipBtn'),
  likeBtn: document.getElementById('likeBtn'),
  superLikeBtn: document.getElementById('superLikeBtn'),
  ecoPriority: document.getElementById('ecoPriority'),
  ecoPriorityLabel: document.getElementById('ecoPriorityLabel'),
  budgetCap: document.getElementById('budgetCap'),
  budgetLabel: document.getElementById('budgetLabel'),
  urgencyMode: document.getElementById('urgencyMode'),
  accentTheme: document.getElementById('accentTheme'),
  savePrefsBtn: document.getElementById('savePrefsBtn'),
  bookingForm: document.getElementById('bookingForm'),
  bookingService: document.getElementById('bookingService'),
  bookingDate: document.getElementById('bookingDate'),
  bookingSlot: document.getElementById('bookingSlot'),
  bookingNotes: document.getElementById('bookingNotes'),
  bookingList: document.getElementById('bookingList'),
  reviewForm: document.getElementById('reviewForm'),
  reviewBooking: document.getElementById('reviewBooking'),
  reviewRating: document.getElementById('reviewRating'),
  reviewComment: document.getElementById('reviewComment'),
  metricSwipes: document.getElementById('metricSwipes'),
  metricBookings: document.getElementById('metricBookings'),
  metricCarbon: document.getElementById('metricCarbon'),
  metricSpend: document.getElementById('metricSpend'),
  metricRating: document.getElementById('metricRating'),
  ideasList: document.getElementById('ideasList'),
  demandChart: document.getElementById('demandChart'),
  sustainChart: document.getElementById('sustainChart'),
  categoryChart: document.getElementById('categoryChart'),
  spendChart: document.getElementById('spendChart'),
  deckCount: document.getElementById('deckCount'),
  toast: document.getElementById('toast')
};

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.add('hidden'), 2800);
}

function todayISO() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
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

function applyAccent(accent) {
  const themes = {
    sunset: ['#ff6b35', '#ff2e63', '#08d9d6'],
    mint: ['#58ff87', '#00d1aa', '#01b4ef'],
    ocean: ['#56b2ff', '#1f74ff', '#05d7cb'],
    ember: ['#ff9f1c', '#ff5d8f', '#f72585']
  };
  const [a, b, c] = themes[accent] || themes.sunset;
  document.documentElement.style.setProperty('--accent-a', a);
  document.documentElement.style.setProperty('--accent-b', b);
  document.documentElement.style.setProperty('--accent-c', c);

  if (state.chartPayload) {
    drawCharts(state.chartPayload);
  }
}

function getServiceTitle(serviceId) {
  return (
    state.catalog.find((s) => s.id === serviceId)?.title ||
    state.services.find((s) => s.id === serviceId)?.title ||
    state.bookings.find((b) => b.serviceId === serviceId)?.service?.title ||
    'Service'
  );
}

function populateBookingServiceOptions() {
  const selected = els.bookingService.value;
  if (state.catalog.length === 0) {
    els.bookingService.innerHTML = '<option value="">No service available</option>';
    return;
  }

  els.bookingService.innerHTML = state.catalog
    .map((s) => `<option value="${s.id}">${s.title} - $${s.price}</option>`)
    .join('');

  if (selected && state.catalog.some((s) => s.id === selected)) {
    els.bookingService.value = selected;
  }
}

function populateBookingSlotOptions() {
  const selected = els.bookingSlot.value;
  const slots = state.timeSlots.length ? state.timeSlots : ['9:00-10:00', '10:00-11:00', '11:00-12:00'];
  els.bookingSlot.innerHTML = slots.map((slot) => `<option value="${slot}">${slot}</option>`).join('');

  if (selected && slots.includes(selected)) {
    els.bookingSlot.value = selected;
  }
}

function populateReviewBookingOptions() {
  const reviewed = new Set(state.reviews.map((r) => r.bookingId));
  const pending = state.bookings.filter((b) => !reviewed.has(b.id));

  if (pending.length === 0) {
    els.reviewBooking.innerHTML = '<option value="">No booking pending review</option>';
    return;
  }

  els.reviewBooking.innerHTML = pending
    .map((b) => `<option value="${b.id}">${b.service.title} | ${b.scheduledDate} (${b.slot})</option>`)
    .join('');
}

function renderBookings() {
  if (state.bookings.length === 0) {
    els.bookingList.innerHTML = '<p class="muted">No bookings yet. Swipe and book to start.</p>';
    return;
  }

  const reviewed = new Set(state.reviews.map((r) => r.bookingId));

  els.bookingList.innerHTML = state.bookings
    .map((b) => {
      const hasReview = reviewed.has(b.id);
      return `
        <article class="booking-item">
          <strong>${b.service.title}</strong>
          <small>${b.scheduledDate} | ${b.slot} | ${b.status}</small>
          <small>Locked price: $${b.priceLocked}</small>

          <small>${hasReview ? 'Reviewed' : 'Pending review'}</small>
        </article>
      `;
    })
    .join('');
}

function renderCard(service, index) {
  const card = document.createElement('article');
  card.className = `service-card depth-${Math.min(index, 3)}${index === 0 ? ' top' : ''}`;
  card.dataset.id = service.id;
  card.style.transform = `translateY(${index * 10}px) scale(${1 - index * 0.03})`;
  card.style.zIndex = String(100 - index);

  const ratingText = service.reviewCount > 0 ? `${service.avgRating}/5 (${service.reviewCount})` : 'New';

  card.innerHTML = `
    <div class="swipe-stamp skip">SKIP</div>
    <div class="swipe-stamp like">LIKE</div>
    <div class="swipe-stamp super">SUPER</div>
    <header>
      <h4>${service.title}</h4>
      <p>${service.description}</p>
      <div class="badges">${service.badges.map((b) => `<span class="badge">${b}</span>`).join('')}</div>
    </header>
    <div class="meta-grid">
      <div><small>Price</small><strong>$${service.price}</strong></div>
      <div><small>ETA</small><strong>${service.etaMinutes} min</strong></div>
      <div><small>Sustainability</small><strong>${service.sustainabilityScore}/100</strong></div>
      <div><small>Rating</small><strong>${ratingText}</strong></div>
      <div><small>Demand</small><strong>${service.demandIndex}</strong></div>
      <div><small>Match</small><strong>${service.personalizationScore}</strong></div>
    </div>
    <footer>
      <small>${service.provider} | ${service.category}</small>
    </footer>
  `;

  if (index === 0) {
    enableSwipe(card);
  }

  return card;
}

function renderStack() {
  els.cardStack.innerHTML = '';
  const visible = state.services.slice(0, 4);

  if (els.deckCount) {
    els.deckCount.textContent = `${state.services.length} cards`;
  }

  if (visible.length === 0) {
    els.emptyState.classList.remove('hidden');
    return;
  }

  els.emptyState.classList.add('hidden');
  for (let i = visible.length - 1; i >= 0; i -= 1) {
    els.cardStack.appendChild(renderCard(visible[i], i));
  }
}

async function loadMeta() {
  const data = await api('/api/meta');
  state.timeSlots = data.timeSlots || [];
  populateBookingSlotOptions();

  if (els.deckCount) {
    els.deckCount.textContent = `${data.serviceCount || 0} cards`;
  }
}

function buildFilterQuery() {
  const params = new URLSearchParams({
    ecoPriority: String(Number(els.ecoPriority.value)),
    budgetCap: String(Number(els.budgetCap.value)),
    urgencyMode: String(Boolean(els.urgencyMode.checked))
  });
  return params.toString();
}

async function loadServices() {
  const query = buildFilterQuery();
  const data = await api(`/api/services?${query}`);
  state.catalog = data.services;
  state.services = data.services;
  renderStack();
  populateBookingServiceOptions();
}

async function loadBookings() {
  const data = await api('/api/bookings');
  state.bookings = data.bookings;
  renderBookings();
  populateReviewBookingOptions();
}

async function loadReviews() {
  const data = await api('/api/reviews');
  state.reviews = data.reviews.filter((r) => r.userId === state.user.id);
  renderBookings();
  populateReviewBookingOptions();
}

function getTopCard() {
  return els.cardStack.querySelector('.service-card.top');
}

function throwCard(card, action) {
  if (!card) {
    return;
  }
  const transforms = {
    skip: 'translate(-520px, 60px) rotate(-24deg)',
    like: 'translate(520px, 60px) rotate(24deg)',
    superlike: 'translate(0px, -520px) rotate(0deg)'
  };
  card.style.transition = 'transform 0.35s ease, opacity 0.3s ease';
  card.style.transform = transforms[action];
  card.style.opacity = '0';
}

async function commitSwipe(serviceId, action) {
  await api('/api/swipes', {
    method: 'POST',
    body: JSON.stringify({ serviceId, action })
  });

  state.services = state.services.filter((s) => s.id !== serviceId);
  renderStack();

  if (action !== 'skip') {
    els.bookingService.value = serviceId;
    showToast('Swipe saved. Book it from the panel.');
  }

  await loadInsights();
}

function applyStampOpacity(card, dx, dy) {
  const like = card.querySelector('.swipe-stamp.like');
  const skip = card.querySelector('.swipe-stamp.skip');
  const superLike = card.querySelector('.swipe-stamp.super');

  const likeStrength = Math.max(0, dx) / 130;
  const skipStrength = Math.max(0, -dx) / 130;
  const superStrength = Math.max(0, -dy - 25) / 120;

  like.style.opacity = String(Math.min(likeStrength, 1));
  skip.style.opacity = String(Math.min(skipStrength, 1));
  superLike.style.opacity = String(Math.min(superStrength, 1));
}

function enableSwipe(card) {
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let dy = 0;
  let dragging = false;

  card.addEventListener('pointerdown', (e) => {
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    card.style.transition = 'none';
    card.setPointerCapture(e.pointerId);
  });

  card.addEventListener('pointermove', (e) => {
    if (!dragging) {
      return;
    }
    dx = e.clientX - startX;
    dy = e.clientY - startY;
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 14}deg)`;
    applyStampOpacity(card, dx, dy);
  });

  card.addEventListener('pointerup', () => {
    if (!dragging) {
      return;
    }
    dragging = false;

    let action = '';
    if (dy < -115) {
      action = 'superlike';
    } else if (dx > 130) {
      action = 'like';
    } else if (dx < -130) {
      action = 'skip';
    }

    if (!action) {
      card.style.transition = 'transform 0.22s ease';
      card.style.transform = 'translate(0px, 0px) rotate(0deg)';
      applyStampOpacity(card, 0, 0);
      return;
    }

    throwCard(card, action);
    setTimeout(() => {
      commitSwipe(card.dataset.id, action).catch((err) => showToast(err.message));
    }, 140);
  });
}

function actionSwipeFromButton(action) {
  const card = getTopCard();
  if (!card) {
    showToast('No cards left.');
    return;
  }
  throwCard(card, action);
  setTimeout(() => {
    commitSwipe(card.dataset.id, action).catch((err) => showToast(err.message));
  }, 140);
}

function getChartCtx(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = rect.width || canvas.width;
  const height = rect.height || canvas.height;
  canvas.width = width * dpr;
  canvas.height = height * dpr;

  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

function getVars() {
  const styles = getComputedStyle(document.documentElement);
  return {
    text: styles.getPropertyValue('--text').trim() || '#f4f9ff',
    muted: styles.getPropertyValue('--muted').trim() || '#b4cae4',
    a: styles.getPropertyValue('--accent-a').trim() || '#ff6b35',
    b: styles.getPropertyValue('--accent-b').trim() || '#ff2e63',
    c: styles.getPropertyValue('--accent-c').trim() || '#08d9d6'
  };
}

function drawTitle(ctx, title, vars) {
  ctx.fillStyle = vars.text;
  ctx.font = '600 13px Space Grotesk';
  ctx.fillText(title, 12, 18);
}

function drawRoundedBar(ctx, x, y, width, height, radius) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

function drawBarChart(canvas, labels, values, title, color) {
  const { ctx, width, height } = getChartCtx(canvas);
  const vars = getVars();
  drawTitle(ctx, title, vars);

  const max = Math.max(1, ...values);
  const baseY = height - 28;
  const chartHeight = height - 58;
  const barWidth = Math.max(16, (width - 36) / Math.max(values.length, 1) - 8);

  values.forEach((v, i) => {
    const x = 18 + i * (barWidth + 8);
    const barH = (v / max) * chartHeight;
    const y = baseY - barH;

    ctx.fillStyle = color;
    drawRoundedBar(ctx, x, y, barWidth, barH, 6);
    ctx.fill();

    ctx.fillStyle = vars.muted;
    ctx.font = '500 10px Space Grotesk';
    const shortLabel = labels[i].length > 8 ? `${labels[i].slice(0, 7)}.` : labels[i];
    ctx.fillText(shortLabel, x, height - 10);
  });
}

function drawLineChart(canvas, labels, values, title, color) {
  const { ctx, width, height } = getChartCtx(canvas);
  const vars = getVars();
  drawTitle(ctx, title, vars);

  const max = Math.max(1, ...values);
  const min = Math.min(...values, 0);
  const chartLeft = 24;
  const chartTop = 30;
  const chartWidth = width - 38;
  const chartHeight = height - 54;

  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const y = chartTop + (chartHeight / 3) * i;
    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(chartLeft + chartWidth, y);
    ctx.stroke();
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = chartLeft + (i / Math.max(values.length - 1, 1)) * chartWidth;
    const y = chartTop + (1 - (v - min) / Math.max(max - min, 1)) * chartHeight;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  ctx.fillStyle = vars.muted;
  ctx.font = '500 10px Space Grotesk';
  labels.forEach((label, i) => {
    const x = chartLeft + (i / Math.max(labels.length - 1, 1)) * chartWidth;
    const txt = label.length > 8 ? `${label.slice(0, 7)}.` : label;
    ctx.fillText(txt, x - 12, height - 8);
  });
}

function drawDonutChart(canvas, labels, values, title) {
  const { ctx, width, height } = getChartCtx(canvas);
  const vars = getVars();
  drawTitle(ctx, title, vars);

  const total = values.reduce((acc, v) => acc + v, 0);
  const cx = width / 2;
  const cy = height / 2 + 8;
  const radius = Math.min(width, height) * 0.24;
  const ring = Math.max(16, radius * 0.32);
  const palette = [vars.a, vars.b, vars.c, '#ffd166', '#9df6b7', '#8ab4ff'];

  if (!total) {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = ring;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = vars.muted;
    ctx.font = '600 12px Space Grotesk';
    ctx.fillText('No bookings yet', cx - 44, cy + 4);
    return;
  }

  let start = -Math.PI / 2;
  values.forEach((v, i) => {
    const angle = (v / total) * Math.PI * 2;
    ctx.strokeStyle = palette[i % palette.length];
    ctx.lineWidth = ring;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, start + angle);
    ctx.stroke();
    start += angle;
  });

  ctx.fillStyle = vars.muted;
  ctx.font = '500 10px Space Grotesk';
  labels.slice(0, 4).forEach((label, i) => {
    ctx.fillStyle = palette[i % palette.length];
    ctx.fillRect(14, 30 + i * 14, 8, 8);
    ctx.fillStyle = vars.muted;
    ctx.fillText(label, 28, 37 + i * 14);
  });
}

function drawCharts(charts) {
  state.chartPayload = charts;
  drawBarChart(els.demandChart, charts.demandLabels, charts.demandData, 'Demand Index', 'rgba(255, 107, 53, 0.8)');
  drawLineChart(els.sustainChart, charts.demandLabels, charts.sustainabilityData, 'Sustainability Score', '#08d9d6');
  drawDonutChart(els.categoryChart, charts.categoryLabels, charts.categoryData, 'Booked Categories');
  drawLineChart(els.spendChart, charts.spendLabels, charts.spendData, 'Monthly Spend Trend', '#8ab4ff');
}

async function loadInsights() {
  const { metrics, charts, businessIdeas } = await api('/api/insights');

  els.metricSwipes.textContent = String(metrics.totalSwipes);
  els.metricBookings.textContent = String(metrics.bookedCount);
  els.metricCarbon.textContent = `${metrics.totalCarbonSaved}kg`;
  els.metricSpend.textContent = `$${metrics.totalSpend}`;
  els.metricRating.textContent = String(metrics.avgRating || 0);

  els.ideasList.innerHTML = businessIdeas.map((idea) => `<li>${idea}</li>`).join('');

  drawCharts(charts);
}

function populatePreferences() {
  const prefs = state.user.preferences;
  els.ecoPriority.value = prefs.ecoPriority;
  els.budgetCap.value = prefs.budgetCap;
  els.urgencyMode.checked = prefs.urgencyMode;
  els.accentTheme.value = prefs.accent;
  els.ecoPriorityLabel.textContent = String(prefs.ecoPriority);
  els.budgetLabel.textContent = `$${prefs.budgetCap}`;
  applyAccent(prefs.accent);
}

async function bootSession() {
  try {
    const data = await api('/api/auth/me');
    state.user = data.user;
    state.csrfToken = data.csrfToken;
    els.welcomeText.textContent = `${state.user.name}, ready to swipe?`;
    populatePreferences();
  } catch {
    window.location.href = '/';
    throw new Error('Unauthorized');
  }
}

function wireEvents() {
  els.logoutBtn.addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
      window.location.href = '/';
    } catch (err) {
      showToast(err.message);
    }
  });

  els.skipBtn.addEventListener('click', () => actionSwipeFromButton('skip'));
  els.likeBtn.addEventListener('click', () => actionSwipeFromButton('like'));
  els.superLikeBtn.addEventListener('click', () => actionSwipeFromButton('superlike'));

  els.ecoPriority.addEventListener('input', () => {
    els.ecoPriorityLabel.textContent = els.ecoPriority.value;
    clearTimeout(filterRefreshTimer);
    filterRefreshTimer = setTimeout(() => {
      loadServices().catch((err) => showToast(err.message));
    }, 180);
  });

  els.budgetCap.addEventListener('input', () => {
    els.budgetLabel.textContent = `$${els.budgetCap.value}`;
    clearTimeout(filterRefreshTimer);
    filterRefreshTimer = setTimeout(() => {
      loadServices().catch((err) => showToast(err.message));
    }, 180);
  });

  els.urgencyMode.addEventListener('change', () => {
    loadServices().catch((err) => showToast(err.message));
  });

  els.accentTheme.addEventListener('change', () => {
    applyAccent(els.accentTheme.value);
  });

  els.savePrefsBtn.addEventListener('click', async () => {
    try {
      const payload = {
        ecoPriority: Number(els.ecoPriority.value),
        budgetCap: Number(els.budgetCap.value),
        urgencyMode: els.urgencyMode.checked,
        accent: els.accentTheme.value
      };
      const data = await api('/api/preferences', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      state.user.preferences = data.preferences;
      showToast('Preferences updated.');
      await Promise.all([loadServices(), loadInsights()]);
    } catch (err) {
      showToast(err.message);
    }
  });

  els.bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const serviceId = els.bookingService.value;
      if (!serviceId) {
        showToast('Select a service first.');
        return;
      }

      const date = els.bookingDate.value;
      if (!date || date < todayISO()) {
        showToast('Select today or a future date.');
        return;
      }

      await api('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          serviceId,
          scheduledDate: date,
          slot: els.bookingSlot.value,
          notes: els.bookingNotes.value.trim()
        })
      });

      els.bookingNotes.value = '';
      showToast(`Booking confirmed for ${getServiceTitle(serviceId)}.`);
      await loadBookings();
      await loadReviews();
      await loadInsights();
    } catch (err) {
      showToast(err.message);
    }
  });

  els.reviewForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const bookingId = els.reviewBooking.value;
      if (!bookingId) {
        showToast('No booking available for review.');
        return;
      }

      await api('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          bookingId,
          rating: Number(els.reviewRating.value),
          comment: els.reviewComment.value.trim()
        })
      });

      els.reviewComment.value = '';
      showToast('Review submitted.');
      await Promise.all([loadReviews(), loadServices(), loadInsights()]);
    } catch (err) {
      showToast(err.message);
    }
  });

  window.addEventListener('resize', () => {
    if (state.chartPayload) {
      drawCharts(state.chartPayload);
    }
  });
}

async function init() {
  els.bookingDate.min = todayISO();
  els.bookingDate.value = todayISO();

  await bootSession();
  await loadMeta();
  wireEvents();

  await Promise.all([loadServices(), loadBookings(), loadInsights()]);
  await loadReviews();
}

init().catch(() => {
  // Redirect handled in bootSession.
});