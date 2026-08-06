const state = {
  csrfToken: '',
  user: null,
  catalog: [],
  timeSlots: [],
  services: [],
  bookings: [],
  reviews: [],
  chartPayload: null,
  insightMode: 'economics',
  chartWindow: 6,
  goal: null,
  bundleSuggestions: [],
  providerRatings: [],
  benchmarks: null,
  matchFunnel: null,
  providerAnalytics: null,
  trustScores: [],
  trustCalibration: null,
  circles: [],
  receiptHistory: [],
  latestIntentPlan: null,
  ecofixOffer: null,
  calibration: null,
  methodology: [],
  latestReceipt: null,
  activeBundleKey: '',
  savedBundleKeys: new Set(),
  pendingBundleBooking: null,
  metrics: {},
  providerSortKey: 'score',
  providerReliabilityMin: 0,
  benchmarkView: 'executive',
  benchmarkScenario: 'observed',
  activeArchivedCircleId: ''
};

let filterRefreshTimer;
const chartInteractivity = new Map();
let chartTooltip;

const els = {
  welcomeText: document.getElementById('welcomeText'),
  adminLink: document.getElementById('adminLink'),
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
  prefScoreBadge: document.getElementById('prefScoreBadge'),
  prefSummary: document.getElementById('prefSummary'),
  savePrefsBtn: document.getElementById('savePrefsBtn'),
  bookingForm: document.getElementById('bookingForm'),
  bookingService: document.getElementById('bookingService'),
  bookingDate: document.getElementById('bookingDate'),
  bookingSlot: document.getElementById('bookingSlot'),
  bookingAddress: document.getElementById('bookingAddress'),
  bookingNotes: document.getElementById('bookingNotes'),
  bookingModeHint: document.getElementById('bookingModeHint'),
  bookingSubmitBtn: document.getElementById('bookingSubmitBtn'),
  bookingList: document.getElementById('bookingList'),
  reviewForm: document.getElementById('reviewForm'),
  reviewBooking: document.getElementById('reviewBooking'),
  reviewRating: document.getElementById('reviewRating'),
  reviewComment: document.getElementById('reviewComment'),
  reviewHistoryList: document.getElementById('reviewHistoryList'),
  metricSwipes: document.getElementById('metricSwipes'),
  metricBookings: document.getElementById('metricBookings'),
  metricCarbon: document.getElementById('metricCarbon'),
  metricSpend: document.getElementById('metricSpend'),
  metricRating: document.getElementById('metricRating'),
  insightMode: document.getElementById('insightMode'),
  chartWindow: document.getElementById('chartWindow'),
  demandChart: document.getElementById('demandChart'),
  sustainChart: document.getElementById('sustainChart'),
  categoryChart: document.getElementById('categoryChart'),
  spendChart: document.getElementById('spendChart'),
  matchFunnelList: document.getElementById('matchFunnelList'),
  bookingFlowDiagram: document.getElementById('bookingFlowDiagram'),
  providerRiskMatrix: document.getElementById('providerRiskMatrix'),
  carbonTreemap: document.getElementById('carbonTreemap'),
  goalForm: document.getElementById('goalForm'),
  goalCarbon: document.getElementById('goalCarbon'),
  goalSpend: document.getElementById('goalSpend'),
  goalProgressText: document.getElementById('goalProgressText'),
  bundleList: document.getElementById('bundleList'),
  providerRatings: document.getElementById('providerRatings'),
  providerSort: document.getElementById('providerSort'),
  providerReliabilityMin: document.getElementById('providerReliabilityMin'),
  providerReliabilityMinLabel: document.getElementById('providerReliabilityMinLabel'),
  outcomeBenchmarks: document.getElementById('outcomeBenchmarks'),
  benchmarkView: document.getElementById('benchmarkView'),
  benchmarkScenario: document.getElementById('benchmarkScenario'),
  providerGrowthKpis: document.getElementById('providerGrowthKpis'),
  providerGrowthActions: document.getElementById('providerGrowthActions'),
  providerHeatmap: document.getElementById('providerHeatmap'),
  providerRegionList: document.getElementById('providerRegionList'),
  providerPricingList: document.getElementById('providerPricingList'),
  providerSkillGapList: document.getElementById('providerSkillGapList'),
  circleForm: document.getElementById('circleForm'),
  circleTitle: document.getElementById('circleTitle'),
  circleObjective: document.getElementById('circleObjective'),
  circleDate: document.getElementById('circleDate'),
  circleList: document.getElementById('circleList'),
  archivedCircleList: document.getElementById('archivedCircleList'),
  intentPlannerForm: document.getElementById('intentPlannerForm'),
  intentInput: document.getElementById('intentInput'),
  intentPlanResult: document.getElementById('intentPlanResult'),
  impactReceipt: document.getElementById('impactReceipt'),
  receiptHistoryList: document.getElementById('receiptHistoryList'),
  deckCount: document.getElementById('deckCount'),
  swipeAssist: document.getElementById('swipeAssist'),
  swipeWorkspace: document.getElementById('swipeWorkspace'),
  toast: document.getElementById('toast')
};

const sectionNavLinks = Array.from(document.querySelectorAll('.section-nav-link'));
const sectionNavTargets = sectionNavLinks
  .map((link) => document.getElementById((link.getAttribute('href') || '').replace('#', '')))
  .filter(Boolean);
const INSIGHT_MINI_TARGETS = new Set([
  'visualAnalyticsPanel',
  'providerRatingsPanel',
  'outcomeBenchmarksPanel',
  'impactReceiptPanel'
]);
const PROVIDER_MODULE_TARGETS = new Set([
  'collaborationCirclesPanel'
]);

function normalizeNavTarget(targetId) {
  const id = String(targetId || '').trim();
  if (!id) {
    return 'insightCharts';
  }
  if (document.getElementById(id)) {
    return id;
  }
  return 'insightCharts';
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.add('hidden'), 2600);
}

function todayISO() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function shortText(value, max = 36) {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function clampNum(value, min, max) {
  return Math.min(max, Math.max(min, Number(value || 0)));
}

function pct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function sanitize(text) {
  return String(text || '').replace(/[<>&"]/g, (char) => {
    if (char === '<') return '&lt;';
    if (char === '>') return '&gt;';
    if (char === '&') return '&amp;';
    return '&quot;';
  });
}

function composeBookingNotes(address, notes) {
  const cleanAddress = String(address || '').trim().replace(/\s+/g, ' ');
  const cleanNotes = String(notes || '').trim();
  const parts = [];
  if (cleanAddress) {
    parts.push(`Address: ${cleanAddress}`);
  }
  if (cleanNotes) {
    parts.push(cleanNotes);
  }
  return parts.join(' | ').slice(0, 220);
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

function styleRangeFill() {
  const eco = clampNum(els.ecoPriority.value, 0, 100);
  const budget = clampNum(els.budgetCap.value, 20, 500);
  const budgetPct = ((budget - 20) / (500 - 20)) * 100;
  els.ecoPriority.style.setProperty('--fill', `${eco}%`);
  els.budgetCap.style.setProperty('--fill', `${budgetPct}%`);
}

function accentLabel(accent) {
  const names = {
    sunset: 'Sunset',
    mint: 'Mint',
    ocean: 'Ocean',
    ember: 'Ember'
  };
  return names[accent] || 'Custom';
}

function computePreferenceSignal() {
  const eco = clampNum(els.ecoPriority.value, 0, 100);
  const budget = clampNum(els.budgetCap.value, 20, 500);
  const urgency = Boolean(els.urgencyMode.checked);
  const paceScore = urgency ? 96 : 62;
  const budgetFit = clampNum(100 - Math.abs(budget - 170) / 2.2, 0, 100);
  const matchScore = Math.round(eco * 0.46 + budgetFit * 0.34 + paceScore * 0.2);

  let mode = 'Balanced';
  if (eco >= 85 && !urgency) mode = 'Eco Guardian';
  else if (budget <= 90) mode = 'Saver Mode';
  else if (urgency) mode = 'Rapid Dispatch';
  else if (eco >= 70) mode = 'Green Optimized';

  return {
    eco,
    budget,
    urgency,
    mode,
    matchScore
  };
}

function renderPreferenceSummary() {
  const signal = computePreferenceSignal();
  els.prefScoreBadge.textContent = `Match ${signal.matchScore}`;
  els.prefSummary.innerHTML = [
    `<span class="pref-chip">${signal.mode}</span>`,
    `<span class="pref-chip">Eco ${signal.eco}</span>`,
    `<span class="pref-chip">Budget ${money(signal.budget)}</span>`,
    `<span class="pref-chip">${signal.urgency ? 'Urgent Flow' : 'Planned Flow'}</span>`,
    `<span class="pref-chip">${accentLabel(els.accentTheme.value)} Theme</span>`
  ].join('');
}

function refreshPreferencePanelUI() {
  styleRangeFill();
  renderPreferenceSummary();
}

const htmlEntityDecoder = document.createElement('textarea');
function decodeEntities(text) {
  htmlEntityDecoder.innerHTML = String(text || '');
  return htmlEntityDecoder.value;
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (options.method && options.method !== 'GET' && state.csrfToken) {
    headers['x-csrf-token'] = state.csrfToken;
  }

  const res = await fetch(path, { ...options, headers, credentials: 'include' });
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
  renderPreferenceSummary();
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
  if (!state.catalog.length) {
    els.bookingService.innerHTML = '<option value="">No service available</option>';
    return;
  }

  els.bookingService.innerHTML = state.catalog
    .map((s) => `<option value="${s.id}">${shortText(s.title, 34)} - $${s.price}</option>`)
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

function renderBookingModeHint() {
  if (!els.bookingModeHint || !els.bookingSubmitBtn) {
    return;
  }

  const pending = state.pendingBundleBooking;
  if (!pending) {
    els.bookingModeHint.classList.add('hidden');
    els.bookingModeHint.textContent = '';
    els.bookingSubmitBtn.textContent = 'Confirm Booking';
    return;
  }

  els.bookingModeHint.innerHTML = `<strong>Bundle Booking:</strong> ${sanitize(pending.primaryServiceTitle)} + ${sanitize(
    pending.addOnServiceTitle
  )}`;
  els.bookingModeHint.classList.remove('hidden');
  els.bookingSubmitBtn.textContent = 'Confirm Bundle Booking';
}

function clearPendingBundleBooking() {
  state.pendingBundleBooking = null;
  renderBookingModeHint();
}

function parseBundleLabelFromBooking(booking) {
  const precomputed = String(booking?.bundleLabel || '').trim();
  if (precomputed) {
    return precomputed;
  }
  const raw = String(booking?.notes || '');
  const match = raw.match(/Bundle booking:\s*([^|]+)/i) || raw.match(/Bundle:\s*([^|]+)/i);
  return match ? match[1].trim() : '';
}

function parsePackageLabelFromBooking(booking) {
  const precomputed = String(booking?.packageLabel || '').trim();
  if (precomputed) {
    return precomputed;
  }
  const raw = String(booking?.notes || '');
  const match = raw.match(/Task package:\s*([^|]+)/i) || raw.match(/Package booking:\s*([^|]+)/i);
  return match ? match[1].trim() : '';
}

function parseAddressFromNotes(notes) {
  const raw = String(notes || '');
  const match = raw.match(/Address:\s*([^|]+)/i);
  return match ? match[1].trim() : '';
}

function bookingDisplayTitle(booking, fallback = '') {
  const packageLabel = parsePackageLabelFromBooking(booking);
  if (packageLabel) {
    return `Package Booking: ${packageLabel}`;
  }
  const bundleLabel = parseBundleLabelFromBooking(booking);
  if (bundleLabel) {
    return `Bundle Booking: ${bundleLabel}`;
  }
  return booking?.service?.title || getServiceTitle(booking?.serviceId) || fallback || 'Service';
}

function bundleLabelForReceipt(receipt) {
  const direct = String(receipt?.bundleLabel || '').trim();
  if (direct) {
    return direct;
  }
  const booking = state.bookings.find((item) => item.id === receipt?.bookingId);
  return parseBundleLabelFromBooking(booking);
}

function packageLabelForReceipt(receipt) {
  const direct = String(receipt?.packageLabel || '').trim();
  if (direct) {
    return direct;
  }
  const booking = state.bookings.find((item) => item.id === receipt?.bookingId);
  return parsePackageLabelFromBooking(booking);
}

function addressForReceipt(receipt) {
  const direct = String(receipt?.address || '').trim();
  if (direct) {
    return direct;
  }
  const booking = state.bookings.find((item) => item.id === receipt?.bookingId);
  if (!booking) {
    return '';
  }
  const fromBooking = String(booking?.address || '').trim();
  return fromBooking || parseAddressFromNotes(booking?.notes);
}

function populateReviewBookingOptions() {
  const reviewed = new Set(state.reviews.map((r) => r.bookingId));
  const pending = state.bookings.filter((b) => !reviewed.has(b.id));

  if (!pending.length) {
    els.reviewBooking.innerHTML = '<option value="">No booking pending review</option>';
    return;
  }

  els.reviewBooking.innerHTML = pending
    .map((b) => {
      const packageLabel = parsePackageLabelFromBooking(b);
      const bundleLabel = parseBundleLabelFromBooking(b);
      const title = packageLabel
        ? `Package: ${packageLabel}`
        : bundleLabel
          ? `Bundle: ${bundleLabel}`
          : b.service?.title || getServiceTitle(b.serviceId);
      return `<option value="${b.id}">${shortText(title, 24)} | ${b.scheduledDate} (${b.slot})</option>`;
    })
    .join('');
}

function renderBookings() {
  if (!state.bookings.length) {
    els.bookingList.innerHTML = '<p class="muted">No bookings yet. Swipe and book to start.</p>';
    return;
  }

  const reviewed = new Set(state.reviews.map((r) => r.bookingId));
  els.bookingList.innerHTML = state.bookings
    .map((b) => {
      const hasReview = reviewed.has(b.id);
      const title = bookingDisplayTitle(b);
      const statusKey = normalizeBookingStatus(b.statusKey || b.status);
      const statusLabel = bookingStatusLabel(statusKey);
      const canViewReceipt = b.paymentStatus === 'Paid' && statusKey === 'approved';
      return `
        <article class="booking-item${b.paymentStatus === 'Paid' ? ' paid' : ''}">
          <strong>${sanitize(title)}</strong>
          <small>${b.scheduledDate} | ${b.slot}</small>
          <small>Status: <span class="status-pill ${statusKey}">${sanitize(statusLabel)}</span> | Payment: ${sanitize(
            b.paymentStatus || '-'
          )}</small>
          <small>Locked price: $${b.priceLocked}</small>
          ${
            canViewReceipt
              ? `<button class="btn btn-ghost view-receipt" data-booking="${b.id}">View receipt</button>`
              : '<small>Receipt unlocks after admin approval + payment.</small>'
          }
          ${
            b.paymentStatus === 'Unpaid' && statusKey !== 'cancelled'
              ? `<button class="btn btn-like pay-booking" data-booking="${b.id}">Pay now</button>`
              : ''
          }
          ${b.paymentStatus === 'Unpaid' && statusKey === 'cancelled' ? '<small>Payment disabled for cancelled booking.</small>' : ''}
          <small>${hasReview ? 'Reviewed' : 'Pending review'}</small>
        </article>
      `;
    })
    .join('');

  document.querySelectorAll('.pay-booking').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.location.href = `/payment?bookingId=${btn.dataset.booking}`;
    });
  });

  document.querySelectorAll('.view-receipt').forEach((btn) => {
    btn.addEventListener('click', () => {
      focusImpactReceiptPanel('smooth');
      loadReceiptByBooking(btn.dataset.booking).catch((err) => showToast(err.message));
    });
  });
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
      <div><small>Eco Score</small><strong>${service.sustainabilityScore}/100</strong></div>
      <div><small>Rating</small><strong>${ratingText}</strong></div>
      <div><small>CO2 Saved</small><strong>${service.impact?.carbonSavedKg || 0}kg</strong></div>
      <div><small>Smart Match Score</small><strong>${service.ecoTwinScore || 0}</strong></div>
    </div>
    <footer>
      <small>${service.provider} | ${service.category} | Provider ${service.providerScore || '-'}</small>
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

  if (!visible.length) {
    els.emptyState.classList.remove('hidden');
    renderSwipeAssist();
    return;
  }

  els.emptyState.classList.add('hidden');
  for (let i = visible.length - 1; i >= 0; i -= 1) {
    els.cardStack.appendChild(renderCard(visible[i], i));
  }
  renderSwipeAssist();
}

function renderSwipeAssist() {
  if (!els.swipeAssist) {
    return;
  }

  const upcomingBooking = state.bookings[0] || null;
  const activeService = state.services[0] || null;
  const providerRows = Array.isArray(state.providerRatings) ? state.providerRatings : [];
  const activeProviderKey = String(activeService?.provider || '');
  const activeRankedProvider = activeProviderKey
    ? providerRows.find((item) => String(item.provider || '') === activeProviderKey) || null
    : null;
  const focusProvider = activeRankedProvider || providerRows[0] || null;
  const focusProviderKey = String(focusProvider?.provider || '');
  const comparisonProvider = focusProvider
    ? providerRows.find((item) => String(item.provider || '') !== focusProviderKey) || null
    : null;
  const trustByProvider = new Map((state.trustScores || []).map((item) => [String(item.provider || ''), item]));
  const focusProviderTrust = focusProvider ? trustByProvider.get(focusProviderKey) || null : null;
  const queueSample = state.services.slice(0, 6);
  const queuePipelineValue = queueSample.reduce((sum, service) => sum + Number(service.price || 0), 0);
  const queueSavingsPotential = queueSample.reduce((sum, service) => sum + Number(service.lifecycleSavings || 0), 0);
  const avgTicket = queueSample.length ? queuePipelineValue / queueSample.length : 0;
  const paidCount = state.bookings.filter((booking) => String(booking.paymentStatus || '').toLowerCase() === 'paid').length;
  const unpaidCount = Math.max(0, state.bookings.length - paidCount);
  const pendingCount = state.bookings.filter((booking) => normalizeBookingStatus(booking.statusKey || booking.status) === 'pending').length;
  const approvedCount = state.bookings.filter((booking) => normalizeBookingStatus(booking.statusKey || booking.status) === 'approved').length;
  const cancelledCount = state.bookings.filter((booking) => normalizeBookingStatus(booking.statusKey || booking.status) === 'cancelled').length;
  const providerName = focusProvider
    ? sanitize(focusProvider.provider)
    : activeProviderKey
      ? sanitize(activeProviderKey)
      : 'Provider data loading';
  const providerSignal = activeService
    ? `From current card: ${sanitize(activeService.title)} | ${sanitize(activeService.category)}`
    : focusProvider
      ? `Priority ${Number(focusProvider.demandWeightedPriority || focusProvider.reliabilityScore || 0).toFixed(1)}`
      : 'Signals will appear after activity.';
  const providerRank = focusProvider
    ? Math.max(
        1,
        providerRows.findIndex((item) => String(item.provider || '') === focusProviderKey) + 1
      )
    : 0;
  const providerReliability = clampNum(
    Number(focusProviderTrust?.reliabilityScore ?? focusProvider?.reliabilityScore ?? activeService?.providerScore ?? 0),
    0,
    100
  );
  const providerSustainability = clampNum(
    Number(focusProvider?.sustainability ?? activeService?.sustainabilityScore ?? 0),
    0,
    100
  );
  const providerCompletion = clampNum(Number(focusProviderTrust?.completionRate || 0), 0, 100);
  const providerResponse = Math.max(
    0,
    Number(focusProviderTrust?.responseTimeMin || Math.max(8, Math.round(Number(activeService?.etaMinutes || 30) * 0.35)))
  );
  const providerTrendDelta = Number(focusProviderTrust?.trendDelta || 0);
  const providerTrendLabel = providerTrendDelta > 0.7 ? 'Rising' : providerTrendDelta < -0.7 ? 'Cooling' : 'Stable';
  const providerTrendClass = providerTrendDelta > 0.7 ? 'trend-up' : providerTrendDelta < -0.7 ? 'trend-down' : 'trend-stable';
  const providerAdvantage = focusProvider && comparisonProvider
    ? Number((Number(focusProvider.score || 0) - Number(comparisonProvider.score || 0)).toFixed(1))
    : null;
  const providerRiskNote = focusProviderTrust?.riskFlags?.[0]
    ? sanitize(focusProviderTrust.riskFlags[0])
    : activeService
      ? `Deck fit ${Number(activeService.ecoTwinScore || 0)}`
      : 'Trust profile stable';
  const providerPulseCard = focusProvider || activeService
    ? `
      <div class="pulse-head">
        <small>Provider Command Center</small>
        <span class="pulse-rank">${providerRank ? `#${providerRank}` : 'Live'}</span>
      </div>
      <strong>${providerName}</strong>
      <div class="pulse-kpis">
        <span>Reliability <b>${providerReliability.toFixed(1)}</b></span>
        <span>SLA <b>${providerCompletion.toFixed(0)}%</b></span>
        <span>Response <b>${providerResponse.toFixed(0)}m</b></span>
        <span class="${providerTrendClass}">${providerTrendLabel} <b>${providerTrendDelta >= 0 ? '+' : ''}${providerTrendDelta.toFixed(1)}</b></span>
      </div>
      <div class="pulse-tracks">
        <label>Reliability</label><span><i style="width:${providerReliability}%"></i></span>
        <label>Sustainability</label><span><i style="width:${providerSustainability}%"></i></span>
      </div>
      <small>${
        providerAdvantage !== null
          ? `Lead vs #2: ${providerAdvantage >= 0 ? '+' : ''}${providerAdvantage.toFixed(1)} score`
          : providerSignal
      } | ${providerRiskNote}</small>
    `
    : `
      <small>Provider Command Center</small>
      <strong>${providerName}</strong>
      <small>${providerSignal}</small>
    `;
  const checkoutLine = `${paidCount} paid | ${unpaidCount} unpaid${upcomingBooking ? ` | Next status ${bookingStatusLabel(upcomingBooking.statusKey || upcomingBooking.status)}` : ''}`;

  els.swipeAssist.innerHTML = `
    <article class="swipe-assist-card">
      <small>Revenue Opportunity</small>
      <strong>${money(queuePipelineValue)} near-term pipeline</strong>
      <small>${
        queueSample.length
          ? `Avg ticket ${money(avgTicket)} | projected lifecycle savings ${money(queueSavingsPotential)}`
          : 'Add fresh swipes to populate your pipeline forecast.'
      }</small>
    </article>
    <article class="swipe-assist-card provider-command-card">
      ${providerPulseCard}
    </article>
    <article class="swipe-assist-card">
      <small>Checkout Pipeline</small>
      <strong>${approvedCount} approved | ${pendingCount} pending | ${cancelledCount} cancelled</strong>
      <small>${checkoutLine}</small>
    </article>
  `;

  renderSwipeWorkspace();
}

function renderSwipeWorkspace() {
  if (!els.swipeWorkspace) {
    return;
  }

  const latestReceipt = state.receiptHistory[0] || state.latestReceipt || null;
  const ecofixOffer = state.ecofixOffer || {};
  const activeCoupon = ecofixOffer.activeCoupon || null;
  const offerPreview = ecofixOffer.offer || { discountPct: 30, minDiscountPct: 10, maxDiscountPct: 40 };
  const leadBundle = state.bundleSuggestions[0] || null;
  const nextBundle = state.bundleSuggestions[1] || null;

  const leadBundleLine = leadBundle
    ? sanitize(`${leadBundle.primaryService} + ${leadBundle.addOnService}`)
    : 'No exclusive pair unlocked yet.';
  const leadBundleKey = leadBundle ? normalizeBundleKey(leadBundle, 0) : '';
  const leadBundleMetrics = leadBundle
    ? `${leadBundle.projectedCarbonSavedKg}kg CO2 savings + ${money(leadBundle.projectedCostSaved)} potential savings`
    : "Swipe and book to unlock today's pair.";
  const nextBundleLine = nextBundle
    ? `Also trending: ${sanitize(nextBundle.primaryService)} + ${sanitize(nextBundle.addOnService)}`
    : latestReceipt
      ? `Latest receipt: ${sanitize(
          packageLabelForReceipt(latestReceipt)
            ? `Package: ${packageLabelForReceipt(latestReceipt)}`
            : bundleLabelForReceipt(latestReceipt)
              ? `Bundle: ${bundleLabelForReceipt(latestReceipt)}`
              : latestReceipt.service?.title || getServiceTitle(latestReceipt.serviceId)
        )} | ${money(latestReceipt.moneySaved)} saved`
      : 'Play daily and keep swiping to surface more bundle pairs.';
  const offerTitle = activeCoupon
    ? `Coupon ${activeCoupon.code}`
    : offerPreview
      ? `Unlock ${offerPreview.discountPct}% today`
      : 'No coupon unlocked yet';
  const offerLine = activeCoupon
    ? `Expires in ${Number(activeCoupon.expiresInHours || 0).toFixed(1)}h | Range 10%-40%`
    : offerPreview
      ? `Unlock ${offerPreview.discountPct}% today by picking the best fixes in EcoFix.`
      : 'Offers are selective. Activity, completion, reviews, and eco-priority decide eligibility.';
  const offerFactorsLine = Array.isArray(ecofixOffer.factors) && ecofixOffer.factors.length
    ? ecofixOffer.factors.slice(0, 2).join(' | ')
    : '';
  const ecofixProgress = ecofixOffer.ecofix || null;
  const ecofixProgressLine = ecofixProgress?.playedToday
    ? `Today's EcoFix score: ${Number(ecofixProgress.todayScore || 0)} / ${Number(ecofixProgress.unlockScoreTarget || 60)}`
    : 'Play EcoFix today to become coupon-eligible.';

  const cardEcofix = `
    <article class="swipe-work-card ecofix-reward">
      <small>EcoFix Offers</small>
      <strong>${offerTitle}</strong>
      <small>${offerLine}</small>
      <small>${
        activeCoupon
          ? 'Use this coupon in Payments before expiry.'
          : ecofixOffer.offerEligible
            ? `Eligible now. Redeem ${offerPreview?.discountPct || 0}% for 24h and apply at checkout.`
            : 'Play EcoFix, pick high-impact fixes, and maintain good completion/review behavior to unlock.'
      }</small>
      <small>${sanitize(ecofixProgressLine)}</small>
      ${offerFactorsLine ? `<small>${sanitize(offerFactorsLine)}</small>` : ''}
      <div class="offer-actions">
        ${
          ecofixOffer.offerEligible && !activeCoupon
            ? '<button class="btn btn-like" type="button" data-offer-action="redeem-ecofix">Redeem Coupon</button>'
            : '<a class="btn btn-like" href="/ecofix">Play EcoFix</a>'
        }
        <a class="btn btn-ghost" href="/payment">Open Payments</a>
      </div>
    </article>
  `;
  const cardExclusive = `
    <article class="swipe-work-card offer-spotlight">
      <small>Today's Exclusive Service Pair</small>
      <strong>${leadBundleLine}</strong>
      <small>${leadBundleMetrics}</small>
      <small>${nextBundleLine}</small>
      ${
        leadBundle
          ? `<div class="offer-actions">
              <button class="btn btn-like" type="button" data-exclusive-action="book-primary" data-bundle-key="${leadBundleKey}">Book Primary</button>
              <button class="btn btn-like" type="button" data-exclusive-action="book-addon" data-bundle-key="${leadBundleKey}">Book Add-on</button>
              <button class="btn btn-ghost" type="button" data-exclusive-action="use-pair" data-bundle-key="${leadBundleKey}">Book Together</button>
            </div>`
          : ''
      }
    </article>
  `;
  els.swipeWorkspace.classList.add('split-layout');
  els.swipeWorkspace.innerHTML = `${cardEcofix}${cardExclusive}`;
}

async function loadMeta() {
  const data = await api('/api/meta');
  state.timeSlots = data.timeSlots || [];
  state.calibration = data.calibration || null;
  populateBookingSlotOptions();

  if (Array.isArray(data.insightWindows) && data.insightWindows.length) {
    els.chartWindow.innerHTML = data.insightWindows
      .map((m) => `<option value="${m}" ${m === state.chartWindow ? 'selected' : ''}>${m} months</option>`)
      .join('');
  }

  if (els.deckCount) {
    els.deckCount.textContent = `${data.serviceCount || 0} cards`;
  }
}

function buildFilterQuery() {
  return new URLSearchParams({
    ecoPriority: String(Number(els.ecoPriority.value)),
    budgetCap: String(Number(els.budgetCap.value)),
    urgencyMode: String(Boolean(els.urgencyMode.checked))
  }).toString();
}

async function loadServices() {
  const data = await api(`/api/services?${buildFilterQuery()}`);
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
  renderSwipeAssist();
  renderVisualAnalytics();
  await Promise.all([loadLatestReceipt(), loadReceiptHistory()]);
}

async function loadReviews() {
  const data = await api('/api/reviews');
  state.reviews = data.reviews.filter((r) => r.userId === state.user.id);
  renderBookings();
  populateReviewBookingOptions();
  renderReviewHistory();
  renderSwipeAssist();
}

function renderReviewHistory() {
  if (!state.reviews.length) {
    els.reviewHistoryList.innerHTML = '<p class="muted">No reviews submitted yet.</p>';
    return;
  }

  const ordered = state.reviews
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  els.reviewHistoryList.innerHTML = ordered
    .map((review) => {
      const title = getServiceTitle(review.serviceId);
      const when = review.createdAt ? new Date(review.createdAt).toLocaleDateString('en-US') : '-';
      return `
        <article class="booking-item">
          <strong>${sanitize(title)}</strong>
          <small>${'★'.repeat(Math.max(1, Number(review.rating || 0)))} (${review.rating}/5) | ${when}</small>
          <small>${sanitize(review.comment || 'No comment')}</small>
        </article>
      `;
    })
    .join('');
}
function getTopCard() {
  return els.cardStack.querySelector('.service-card.top');
}

function throwCard(card, action) {
  if (!card) return;
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
  like.style.opacity = String(Math.min(Math.max(0, dx) / 130, 1));
  skip.style.opacity = String(Math.min(Math.max(0, -dx) / 130, 1));
  superLike.style.opacity = String(Math.min(Math.max(0, -dy - 25) / 120, 1));
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
    if (!dragging) return;
    dx = e.clientX - startX;
    dy = e.clientY - startY;
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 14}deg)`;
    applyStampOpacity(card, dx, dy);
  });

  card.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;

    let action = '';
    if (dy < -115) action = 'superlike';
    else if (dx > 130) action = 'like';
    else if (dx < -130) action = 'skip';

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

function chartCtx(canvas) {
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

function cssVars() {
  const styles = getComputedStyle(document.documentElement);
  return {
    text: styles.getPropertyValue('--text').trim() || '#f4f9ff',
    muted: styles.getPropertyValue('--muted').trim() || '#b4cae4',
    a: styles.getPropertyValue('--accent-a').trim() || '#ff6b35',
    b: styles.getPropertyValue('--accent-b').trim() || '#ff2e63',
    c: styles.getPropertyValue('--accent-c').trim() || '#08d9d6'
  };
}

const chartAnimationHandles = new Map();

function withAlpha(color, alpha) {
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  if (!color) return `rgba(255,255,255,${safeAlpha})`;
  if (color.startsWith('#')) {
    const clean = color.slice(1);
    const full = clean.length === 3 ? clean.split('').map((ch) => ch + ch).join('') : clean;
    const int = Number.parseInt(full, 16);
    if (Number.isNaN(int)) return color;
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
  }
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${safeAlpha})`);
  }
  if (color.startsWith('rgba(')) {
    const parts = color.slice(5, -1).split(',').map((part) => part.trim());
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${safeAlpha})`;
  }
  return color;
}

function formatCompact(value) {
  const num = Number(value || 0);
  if (Math.abs(num) >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (Math.abs(num) >= 1000) return `${(num / 1000).toFixed(1)}k`;
  if (Math.abs(num % 1) > 0.001) return num.toFixed(2);
  return String(Math.round(num));
}

function title(ctx, txt, vars) {
  ctx.fillStyle = vars.text;
  ctx.font = '700 13px Space Grotesk';
  ctx.fillText(txt, 14, 20);
}

function drawChartSurface(ctx, width, height, vars) {
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, 'rgba(8, 16, 40, 0.92)');
  bg.addColorStop(1, 'rgba(6, 12, 30, 0.96)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(width * 0.16, height * 0.08, 8, width * 0.16, height * 0.08, width * 0.86);
  glow.addColorStop(0, withAlpha(vars.c, 0.2));
  glow.addColorStop(0.45, withAlpha(vars.b, 0.08));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
}

function drawGrid(ctx, left, top, width, height, vars, lines = 4) {
  ctx.strokeStyle = withAlpha(vars.muted, 0.18);
  ctx.lineWidth = 1;
  for (let i = 0; i < lines; i += 1) {
    const y = top + (height / (lines - 1)) * i;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + width, y);
    ctx.stroke();
  }
}

function roundedBar(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function setChartPayload(canvas, payload) {
  chartInteractivity.set(canvas.id, payload);
}

function animateChart(canvas, render, duration = 560) {
  const previous = chartAnimationHandles.get(canvas.id);
  if (previous) {
    cancelAnimationFrame(previous);
  }

  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    render(eased);
    if (t < 1) {
      const next = requestAnimationFrame(step);
      chartAnimationHandles.set(canvas.id, next);
    }
  };
  const id = requestAnimationFrame(step);
  chartAnimationHandles.set(canvas.id, id);
}

function drawBar(canvas, labels, values, chartTitle, color) {
  const safeLabels = Array.isArray(labels) ? labels : [];
  const safeValues = Array.isArray(values) ? values : [];
  const max = Math.max(1, ...safeValues, 0);
  const palette = color || withAlpha(cssVars().a, 0.88);

  animateChart(canvas, (progress) => {
    const { ctx, width, height } = chartCtx(canvas);
    const vars = cssVars();
    drawChartSurface(ctx, width, height, vars);
    title(ctx, chartTitle, vars);

    const left = 20;
    const top = 32;
    const chartWidth = width - 34;
    const chartHeight = height - 62;
    const baseY = top + chartHeight;
    drawGrid(ctx, left, top, chartWidth, chartHeight, vars, 4);

    const gap = 8;
    const barWidth = Math.max(14, Math.min(58, (chartWidth - gap * (Math.max(safeValues.length, 1) - 1)) / Math.max(safeValues.length, 1)));
    const points = [];

    safeValues.forEach((raw, i) => {
      const value = Number(raw || 0) * progress;
      const x = left + i * (barWidth + gap);
      const barH = (Math.max(value, 0) / max) * chartHeight;
      const drawnBarH = Math.max(barH, 2);
      const y = baseY - drawnBarH;

      const barGradient = ctx.createLinearGradient(0, y, 0, baseY);
      barGradient.addColorStop(0, withAlpha(vars.c, 0.95));
      barGradient.addColorStop(1, withAlpha(palette, 0.68));
      ctx.fillStyle = barGradient;
      ctx.shadowBlur = 12;
      ctx.shadowColor = withAlpha(vars.c, 0.28);
      roundedBar(ctx, x, y, barWidth, drawnBarH, 8);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (progress > 0.82) {
        ctx.font = '600 10px Space Grotesk';
        const metric = formatCompact(raw);
        const metricW = ctx.measureText(metric).width;
        const metricX = clampNum(x + barWidth / 2, left + metricW / 2, left + chartWidth - metricW / 2);
        const isCenteredInBar = Number(raw || 0) > 0 && drawnBarH >= 18;

        ctx.textAlign = 'center';
        if (isCenteredInBar) {
          const metricY = y + drawnBarH / 2;
          ctx.textBaseline = 'middle';
          ctx.fillStyle = withAlpha('#ffffff', 0.96);
          ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
          ctx.shadowBlur = 3;
          ctx.fillText(metric, metricX, metricY);
          ctx.shadowBlur = 0;
        } else {
          const metricY = Math.max(top + 12, y - 6);
          ctx.textBaseline = 'alphabetic';
          ctx.fillStyle = 'rgba(5, 10, 24, 0.85)';
          ctx.fillText(metric, metricX, metricY + 1);
          ctx.fillStyle = withAlpha(vars.text, 0.96);
          ctx.fillText(metric, metricX, metricY);
        }
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      }

      ctx.fillStyle = withAlpha(vars.muted, 0.95);
      ctx.font = '500 10px Space Grotesk';
      const label = String(safeLabels[i] || `L${i + 1}`);
      const shortLabel = label.length > 9 ? `${label.slice(0, 8)}.` : label;
      const labelW = ctx.measureText(shortLabel).width;
      const labelX = clampNum(x + barWidth / 2 - labelW / 2, left, left + chartWidth - labelW);
      ctx.fillText(shortLabel, labelX, height - 8);

      points.push({ x: x + barWidth / 2, y: y + 4, label, value: Number(raw || 0) });
    });

    setChartPayload(canvas, { type: 'point', items: points });
  });
}

function drawLine(canvas, labels, values, chartTitle, color) {
  const safeLabels = Array.isArray(labels) ? labels : [];
  const safeValues = Array.isArray(values) ? values : [];
  const max = Math.max(1, ...safeValues);
  const min = Math.min(...safeValues, 0);

  animateChart(canvas, (progress) => {
    const { ctx, width, height } = chartCtx(canvas);
    const vars = cssVars();
    drawChartSurface(ctx, width, height, vars);
    title(ctx, chartTitle, vars);

    const left = 24;
    const top = 30;
    const w = width - 38;
    const h = height - 56;
    drawGrid(ctx, left, top, w, h, vars, 4);

    const points = [];
    ctx.beginPath();
    safeValues.forEach((raw, i) => {
      const value = min + (Number(raw || 0) - min) * progress;
      const x = left + (i / Math.max(safeValues.length - 1, 1)) * w;
      const y = top + (1 - (value - min) / Math.max(max - min, 1)) * h;
      const label = String(safeLabels[i] || `P${i + 1}`);
      points.push({ x, y, label, value: Number(raw || 0) });
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    const areaStart = points[0];
    const areaEnd = points[points.length - 1];
    if (areaStart && areaEnd) {
      const area = new Path2D();
      area.moveTo(areaStart.x, top + h);
      points.forEach((p, i) => {
        if (i === 0) area.lineTo(p.x, p.y);
        else area.lineTo(p.x, p.y);
      });
      area.lineTo(areaEnd.x, top + h);
      area.closePath();
      const areaGradient = ctx.createLinearGradient(0, top, 0, top + h);
      areaGradient.addColorStop(0, withAlpha(color, 0.28));
      areaGradient.addColorStop(1, withAlpha(color, 0.02));
      ctx.fillStyle = areaGradient;
      ctx.fill(area);
    }

    ctx.shadowColor = withAlpha(color, 0.48);
    ctx.shadowBlur = 14;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    points.forEach((p) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = withAlpha('#ffffff', 0.96);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.3, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = withAlpha(vars.muted, 0.95);
    ctx.font = '500 10px Space Grotesk';
    safeLabels.forEach((label, i) => {
      const x = left + (i / Math.max(safeLabels.length - 1, 1)) * w;
      const txt = String(label).length > 8 ? `${String(label).slice(0, 7)}.` : String(label);
      ctx.fillText(txt, x - 13, height - 8);
    });

    setChartPayload(canvas, { type: 'point', items: points });
  });
}

function drawDonut(canvas, labels, values, chartTitle) {
  const safeLabels = Array.isArray(labels) ? labels : [];
  const safeValues = Array.isArray(values) ? values : [];
  const total = safeValues.reduce((sum, v) => sum + Number(v || 0), 0);

  animateChart(canvas, (progress) => {
    const { ctx, width, height } = chartCtx(canvas);
    const vars = cssVars();
    drawChartSurface(ctx, width, height, vars);
    title(ctx, chartTitle, vars);

    const cx = width / 2;
    const cy = height / 2 + 10;
    const radius = Math.min(width, height) * 0.24;
    const ring = Math.max(16, radius * 0.34);
    const palette = [vars.a, vars.b, vars.c, '#ffd166', '#9df6b7', '#8ab4ff'];

    if (!total) {
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = ring;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = vars.muted;
      ctx.font = '600 12px Space Grotesk';
      ctx.fillText('No bookings yet', cx - 44, cy + 4);
      setChartPayload(canvas, { type: 'none', items: [] });
      return;
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = ring;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    let start = -Math.PI / 2;
    const segments = [];
    safeValues.forEach((raw, i) => {
      const value = Number(raw || 0);
      const angle = (value / total) * Math.PI * 2;
      const color = palette[i % palette.length];
      ctx.strokeStyle = withAlpha(color, 0.96);
      ctx.lineWidth = ring;
      ctx.lineCap = 'round';
      ctx.shadowColor = withAlpha(color, 0.4);
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, start, start + angle * progress);
      ctx.stroke();
      ctx.shadowBlur = 0;

      segments.push({
        start,
        end: start + angle,
        inner: radius - ring / 2,
        outer: radius + ring / 2,
        cx,
        cy,
        label: String(safeLabels[i] || `C${i + 1}`),
        value
      });
      start += angle;
    });

    ctx.fillStyle = withAlpha(vars.text, 0.95);
    ctx.font = '700 16px Space Grotesk';
    const totalLabel = formatCompact(total);
    ctx.fillText(totalLabel, cx - ctx.measureText(totalLabel).width / 2, cy + 4);
    ctx.fillStyle = withAlpha(vars.muted, 0.9);
    ctx.font = '500 10px Space Grotesk';
    ctx.fillText('Total Volume', cx - 28, cy + 20);

    safeLabels.slice(0, 4).forEach((label, i) => {
      const rowY = 34 + i * 14;
      const color = palette[i % palette.length];
      const value = Number(safeValues[i] || 0);
      const pct = total ? `${Math.round((value / total) * 100)}%` : '0%';
      ctx.fillStyle = withAlpha(color, 0.95);
      ctx.fillRect(14, rowY - 8, 8, 8);
      ctx.fillStyle = withAlpha(vars.muted, 0.95);
      ctx.fillText(`${String(label).slice(0, 11)} ${pct}`, 28, rowY);
    });

    setChartPayload(canvas, { type: 'donut', items: segments });
  });
}

function ensureTooltip() {
  if (chartTooltip) return;
  chartTooltip = document.createElement('div');
  chartTooltip.className = 'chart-tooltip hidden';
  document.body.appendChild(chartTooltip);
}

function hideTooltip() {
  if (chartTooltip) chartTooltip.classList.add('hidden');
}

function showTooltip(text, x, y) {
  ensureTooltip();
  chartTooltip.textContent = text;
  chartTooltip.style.left = `${x + 12}px`;
  chartTooltip.style.top = `${y + 12}px`;
  chartTooltip.classList.remove('hidden');
}

function findHover(canvas, event) {
  const payload = chartInteractivity.get(canvas.id);
  if (!payload || !payload.items.length) return null;

  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  if (payload.type === 'donut') {
    const seg = payload.items.find((item) => {
      const dx = x - item.cx;
      const dy = y - item.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < item.inner || dist > item.outer) return false;

      let ang = Math.atan2(dy, dx);
      if (ang < -Math.PI / 2) ang += Math.PI * 2;
      return ang >= item.start && ang <= item.end;
    });
    if (!seg) return null;
    return `${seg.label}: ${formatCompact(seg.value)}`;
  }

  let best = null;
  let bestDist = Number.POSITIVE_INFINITY;
  payload.items.forEach((item) => {
    const dx = item.x - x;
    const dy = item.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) {
      bestDist = dist;
      best = item;
    }
  });

  if (!best || bestDist > 34) return null;
  return `${best.label}: ${formatCompact(best.value)}`;
}

function wireChartHover() {
  [els.demandChart, els.sustainChart, els.categoryChart, els.spendChart].forEach((canvas) => {
    if (canvas.dataset.hoverBound === '1') return;
    canvas.dataset.hoverBound = '1';

    canvas.addEventListener('mousemove', (event) => {
      const text = findHover(canvas, event);
      if (!text) {
        canvas.style.cursor = 'default';
        hideTooltip();
        return;
      }
      canvas.style.cursor = 'crosshair';
      showTooltip(text, event.clientX, event.clientY);
    });

    canvas.addEventListener('mouseleave', () => {
      canvas.style.cursor = 'default';
      hideTooltip();
    });
  });
}

function arrayOr(values, len) {
  if (Array.isArray(values) && values.length) return values;
  return Array.from({ length: len }, () => 0);
}

function drawCharts(charts) {
  state.chartPayload = charts;
  const labels = charts.spendLabels || [];

  if (state.insightMode === 'carbon') {
    drawLine(els.demandChart, labels, arrayOr(charts.carbonData, labels.length), 'Monthly Carbon Saved (kg)', '#08d9d6');
    drawBar(els.sustainChart, charts.demandLabels || [], arrayOr(charts.sustainabilityData, (charts.demandLabels || []).length), 'Service Sustainability', 'rgba(255, 157, 102, 0.9)');
    drawDonut(els.categoryChart, charts.categoryLabels || [], arrayOr(charts.categoryData, (charts.categoryLabels || []).length), 'Booked Categories');
    drawLine(els.spendChart, labels, arrayOr(charts.timeSavedData, labels.length), 'Time Saved (minutes)', '#8ab4ff');
    return;
  }

  if (state.insightMode === 'lifestyle') {
    drawLine(els.demandChart, labels, arrayOr(charts.bookingCountData, labels.length), 'Bookings Per Month', '#ff8a5b');
    drawLine(els.sustainChart, labels, arrayOr(charts.repeatRateData, labels.length), 'Repeat Usage Rate (%)', '#59f5cf');
    drawBar(els.categoryChart, labels, arrayOr(charts.timeSavedData, labels.length), 'Time Saved (minutes)', 'rgba(143, 182, 255, 0.9)');
    drawLine(els.spendChart, labels, arrayOr(charts.carbonData, labels.length), 'Carbon Saved (kg)', '#f7d154');
    return;
  }

  if (state.insightMode === 'providers') {
    drawBar(els.demandChart, charts.providerLabels || [], arrayOr(charts.providerRevenueData, (charts.providerLabels || []).length), 'Provider Revenue ($)', 'rgba(255, 125, 193, 0.9)');
    drawLine(els.sustainChart, charts.providerLabels || [], arrayOr(charts.providerRatingData, (charts.providerLabels || []).length), 'Provider Sustainability Score', '#65f0d0');
    drawBar(els.categoryChart, charts.categoryLabels || [], arrayOr(charts.categoryRoiData, (charts.categoryLabels || []).length), 'Category ROI (%)', 'rgba(118, 190, 255, 0.9)');
    drawBar(els.spendChart, charts.providerLabels || [], arrayOr(charts.providerRatingData, (charts.providerLabels || []).length), 'Provider Performance', 'rgba(255, 205, 95, 0.9)');
    return;
  }

  drawLine(els.demandChart, labels, arrayOr(charts.spendData, labels.length), 'Monthly Spend ($)', '#8ab4ff');
  drawLine(els.sustainChart, labels, arrayOr(charts.savingsData, labels.length), 'Monthly Savings ($)', '#08d9d6');
  drawBar(els.categoryChart, charts.categoryLabels || [], arrayOr(charts.categoryRoiData, (charts.categoryLabels || []).length), 'Category ROI (%)', 'rgba(255, 122, 92, 0.9)');
  drawLine(els.spendChart, labels, arrayOr(charts.avgSpendData, labels.length), 'Average Ticket Size ($)', '#ffd166');
}

function renderMatchFunnel(funnel) {
  if (!els.matchFunnelList) {
    return;
  }
  if (!funnel || !Array.isArray(funnel.stages) || !funnel.stages.length) {
    els.matchFunnelList.innerHTML = '<p class="muted">No funnel activity yet.</p>';
    return;
  }

  const maxCount = Math.max(...funnel.stages.map((stage) => Number(stage.count || 0)), 1);
  const stageRows = funnel.stages
    .map((stage, index) => {
      const count = Number(stage.count || 0);
      const widthPct = clampNum((count / maxCount) * 100, 16, 100);
      const prev = index > 0 ? Number(funnel.stages[index - 1].count || 0) : count;
      const dropPct = index > 0 ? clampNum(((prev - count) / Math.max(prev, 1)) * 100, 0, 100) : 0;
      return `
        <article class="funnel-stage funnel-enter" style="--funnel-delay:${140 + index * 90}ms">
          <div class="funnel-stage-head">
            <strong>${sanitize(stage.label)}</strong>
            <span>${count}</span>
          </div>
          <div class="funnel-track"><span data-width="${widthPct}%"></span></div>
          <small>${Number(stage.ratePct || 0).toFixed(1)}% of swipe volume${
            index > 0 ? ` | ${dropPct.toFixed(1)}% drop` : ''
          }</small>
        </article>
      `;
    })
    .join('');

  const rates = funnel.rates || {};
  const speed = funnel.speed || {};
  const comparison = funnel.comparison || {};
  const observed = comparison.observed || {};
  const baseline = comparison.baseline || {};
  const lift = comparison.lift || {};
  const parseTrajectoryMonthTs = (label) => {
    const raw = String(label || '').trim();
    if (!raw) {
      return null;
    }
    const match = raw.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-/,]*([0-9]{2,4})/i);
    if (!match) {
      return null;
    }
    const monthMap = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dec: 11
    };
    const month = monthMap[String(match[1] || '').slice(0, 3).toLowerCase()];
    let year = Number(match[2] || 0);
    if (!Number.isFinite(year) || month === undefined) {
      return null;
    }
    if (year < 100) {
      year += 2000;
    }
    return Date.UTC(year, month, 1);
  };
  const trajectoryCutoffTs = Date.UTC(2026, 0, 1);
  const trajectory = (Array.isArray(funnel.trajectory) ? funnel.trajectory : []).filter((row) => {
    const ts = parseTrajectoryMonthTs(row?.month);
    return ts === null ? true : ts >= trajectoryCutoffTs;
  });
  const categorySignals = Array.isArray(funnel.categorySignals) ? funnel.categorySignals : [];
  const providerSignals = Array.isArray(funnel.providerSignals) ? funnel.providerSignals : [];

  const trajectoryRows = trajectory.length
    ? trajectory
        .map((row, index) => {
          const conv = Number(row.interestToBookingPct || 0);
          const comp = Number(row.bookingToCompletionPct || 0);
          return `
            <article class="funnel-trend-row funnel-enter" style="--funnel-delay:${280 + index * 70}ms">
              <div class="funnel-trend-head">
                <strong>${sanitize(row.month)}</strong>
                <small>${Number(row.bookings || 0)} bookings</small>
              </div>
              <div class="funnel-trend-bars">
                <span><b style="width:${clampNum(conv, 0, 100)}%"></b></span>
                <span><b style="width:${clampNum(comp, 0, 100)}%"></b></span>
              </div>
              <small>Conv ${conv.toFixed(1)}% | Completion ${comp.toFixed(1)}%</small>
            </article>
          `;
        })
        .join('')
    : '<p class="muted">No month-level funnel trend from Jan 2026 yet.</p>';

  const categoryRows = categorySignals.length
    ? categorySignals
        .map(
          (item) => `
            <article class="funnel-signal-item">
              <strong>${sanitize(item.category)}</strong>
              <small>${Number(item.bookings || 0)} bookings | ${Number(item.completed || 0)} completed</small>
              <small>Conv ${Number(item.interestToBookingPct || 0).toFixed(1)}% | Completion ${Number(
            item.bookingToCompletionPct || 0
          ).toFixed(1)}%</small>
            </article>
          `
        )
        .join('')
    : '<p class="muted">No category signals yet.</p>';

  const providerRows = providerSignals.length
    ? providerSignals
        .map(
          (item) => `
            <article class="funnel-signal-item">
              <strong>${sanitize(item.provider)}</strong>
              <small>${Number(item.bookings || 0)} bookings | ${Number(item.completed || 0)} completed</small>
              <small>Conv ${Number(item.interestToBookingPct || 0).toFixed(1)}% | Completion ${Number(
            item.bookingToCompletionPct || 0
          ).toFixed(1)}%</small>
            </article>
          `
        )
        .join('')
    : '<p class="muted">No provider signals yet.</p>';

  els.matchFunnelList.innerHTML = `
    <div class="funnel-kpis">
      <article class="funnel-kpi funnel-enter" style="--funnel-delay:0ms">
        <strong>${Number(rates.interestToBookingPct || 0).toFixed(1)}%</strong>
        <small>Interest to Booking</small>
      </article>
      <article class="funnel-kpi funnel-enter" style="--funnel-delay:70ms">
        <strong>${Number(rates.bookingToCompletionPct || 0).toFixed(1)}%</strong>
        <small>Booking to Completion</small>
      </article>
      <article class="funnel-kpi funnel-enter" style="--funnel-delay:140ms">
        <strong>${Number(speed.swipeToBookingMinutes || 0).toFixed(2)} min</strong>
        <small>Swipe to Booking</small>
      </article>
      <article class="funnel-kpi funnel-enter" style="--funnel-delay:210ms">
        <strong>${Number(speed.improvementPct || 0).toFixed(1)}%</strong>
        <small>Faster vs Baseline</small>
      </article>
    </div>
    <div class="funnel-stage-grid">${stageRows}</div>
    <details class="funnel-details">
      <summary>Mode Comparison</summary>
      <section class="funnel-subsection">
        <div class="funnel-compare-grid">
          <article class="funnel-compare-card funnel-enter" style="--funnel-delay:340ms">
            <strong>${sanitize(observed.label || 'Swipe-first')}</strong>
            <small>${Number(observed.matchingMinutes || 0).toFixed(2)} min match</small>
            <small>${Number(observed.conversionPct || 0).toFixed(1)}% conversion | ${Number(
    observed.completionPct || 0
  ).toFixed(1)}% completion</small>
          </article>
          <article class="funnel-compare-card funnel-enter" style="--funnel-delay:410ms">
            <strong>${sanitize(baseline.label || 'List-first baseline')}</strong>
            <small>${Number(baseline.matchingMinutes || 0).toFixed(2)} min match</small>
            <small>${Number(baseline.conversionPct || 0).toFixed(1)}% conversion | ${Number(
    baseline.completionPct || 0
  ).toFixed(1)}% completion</small>
          </article>
        </div>
        <small class="muted">${sanitize(comparison.evidenceLabel || 'Observed vs modeled baseline')} | Speed +${Number(
    lift.speedGainPct || 0
  ).toFixed(1)}% | Conversion +${Number(lift.conversionGainPct || 0).toFixed(1)}% | Completion +${Number(
    lift.completionGainPct || 0
  ).toFixed(1)}%</small>
      </section>
    </details>
    <details class="funnel-details">
      <summary>Monthly Trajectory</summary>
      <section class="funnel-subsection">
        <div class="funnel-trend-grid">${trajectoryRows}</div>
      </section>
    </details>
    <details class="funnel-details">
      <summary>Category and Provider Signals</summary>
      <section class="funnel-subsection">
        <div class="funnel-signal-grid">
          <div>
            <small class="muted">By Category</small>
            <div class="funnel-signal-list">${categoryRows}</div>
          </div>
          <div>
            <small class="muted">By Provider</small>
            <div class="funnel-signal-list">${providerRows}</div>
          </div>
        </div>
      </section>
    </details>
  `;

  const bars = els.matchFunnelList.querySelectorAll('.funnel-track span');
  requestAnimationFrame(() => {
    bars.forEach((bar, index) => {
      const target = bar.dataset.width || '0%';
      bar.style.width = '0%';
      setTimeout(() => {
        bar.style.width = target;
      }, 110 + index * 130);
    });
  });
}

function renderBookingFlowDiagram() {
  if (!els.bookingFlowDiagram) {
    return;
  }
  const stages = Array.isArray(state.matchFunnel?.stages) ? state.matchFunnel.stages : [];
  if (!stages.length) {
    els.bookingFlowDiagram.innerHTML = '<p class="muted">Flow appears after swipe and booking activity.</p>';
    return;
  }

  const maxCount = Math.max(1, ...stages.map((stage) => Number(stage.count || 0)));
  const firstCount = Number(stages[0]?.count || 0);
  const lastCount = Number(stages[stages.length - 1]?.count || 0);
  const endToEndRate = firstCount > 0 ? Number(((lastCount / firstCount) * 100).toFixed(1)) : 0;
  let biggestDrop = { amount: 0, from: '', to: '' };
  const stageMeta = stages.map((stage, index) => {
    const prev = index > 0 ? Number(stages[index - 1].count || 0) : Number(stage.count || 0);
    const count = Number(stage.count || 0);
    const retained = index > 0 ? (prev > 0 ? (count / prev) * 100 : 0) : 100;
    const drop = index > 0 ? Math.max(0, prev - count) : 0;
    if (drop > biggestDrop.amount) {
      biggestDrop = {
        amount: drop,
        from: String(stages[index - 1]?.label || ''),
        to: String(stage.label || '')
      };
    }
    return {
      index,
      label: String(stage.label || `Stage ${index + 1}`),
      count,
      retained: Number(retained.toFixed(1)),
      drop,
      volumePct: clampValue((count / maxCount) * 100, 8, 100)
    };
  });

  const stageCards = stageMeta
    .map((stage, index) => {
      const connector = index < stageMeta.length - 1
        ? `
          <div class="flow-connector" aria-hidden="true">
            <span></span>
            <small>${stageMeta[index + 1].retained.toFixed(1)}%</small>
          </div>
        `
        : '';
      return `
        <button type="button" class="flow-stage-card${index === 0 ? ' is-active' : ''}" data-flow-stage="${index}">
          <div class="flow-stage-head">
            <small>${sanitize(stage.label)}</small>
            <span>${index + 1}</span>
          </div>
          <strong>${stage.count}</strong>
          <div class="flow-meter"><i style="--w:${stage.volumePct}%"></i></div>
          <div class="flow-stage-meta">
            <small>${stage.retained.toFixed(1)}% retained</small>
            <small>${stage.drop > 0 ? `${stage.drop} drop-off` : 'No drop-off'}</small>
          </div>
        </button>
        ${connector}
      `;
    })
    .join('');

  els.bookingFlowDiagram.innerHTML = `
    <div class="flow-track-advanced">${stageCards}</div>
    <div class="flow-summary-row">
      <article class="flow-summary-card">
        <small>End-to-end completion</small>
        <strong>${endToEndRate.toFixed(1)}%</strong>
      </article>
      <article class="flow-summary-card">
        <small>Largest drop-off</small>
        <strong>${biggestDrop.amount > 0 ? `${sanitize(biggestDrop.from)} -> ${sanitize(biggestDrop.to)}` : 'No major drop'}</strong>
      </article>
      <article class="flow-summary-card flow-summary-focus" data-flow-focus>
        <small>Stage focus</small>
        <strong>${sanitize(stageMeta[0].label)}</strong>
        <small>${stageMeta[0].count} volume | ${stageMeta[0].retained.toFixed(1)}% retained</small>
      </article>
    </div>
  `;

  const stageButtons = Array.from(els.bookingFlowDiagram.querySelectorAll('[data-flow-stage]'));
  const focusCard = els.bookingFlowDiagram.querySelector('[data-flow-focus]');
  const activateStage = (idx) => {
    const safeIdx = clampValue(idx, 0, stageMeta.length - 1);
    const selected = stageMeta[safeIdx];
    stageButtons.forEach((btn) => btn.classList.toggle('is-active', Number(btn.dataset.flowStage) === safeIdx));
    if (focusCard) {
      focusCard.innerHTML = `
        <small>Stage focus</small>
        <strong>${sanitize(selected.label)}</strong>
        <small>${selected.count} volume | ${selected.retained.toFixed(1)}% retained${selected.drop > 0 ? ` | ${selected.drop} lost` : ''}</small>
      `;
    }
  };

  stageButtons.forEach((btn) => {
    const idx = Number(btn.dataset.flowStage || 0);
    btn.addEventListener('mouseenter', () => activateStage(idx));
    btn.addEventListener('focus', () => activateStage(idx));
    btn.addEventListener('click', () => activateStage(idx));
  });
}

function deconflictRiskPoints(points, chart) {
  const minDistance = 24;
  const padding = 10;
  const adjusted = points.map((point, index) => ({
    ...point,
    x: point.x,
    y: point.y,
    index
  }));

  const clampIntoChart = (dot) => {
    dot.x = clampValue(dot.x, chart.x + padding, chart.x + chart.w - padding);
    dot.y = clampValue(dot.y, chart.y + padding, chart.y + chart.h - padding);
  };

  for (let iter = 0; iter < 90; iter += 1) {
    let moved = false;
    for (let i = 0; i < adjusted.length; i += 1) {
      for (let j = i + 1; j < adjusted.length; j += 1) {
        const a = adjusted[i];
        const b = adjusted[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.001) {
          const angle = ((i + 1) * 17 + (j + 1) * 11) * 0.07;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          dist = 1;
        }
        if (dist < minDistance) {
          const push = (minDistance - dist) * 0.52;
          const ux = dx / dist;
          const uy = dy / dist;
          a.x -= ux * push;
          a.y -= uy * push;
          b.x += ux * push;
          b.y += uy * push;
          clampIntoChart(a);
          clampIntoChart(b);
          moved = true;
        }
      }
    }
    if (!moved) {
      break;
    }
  }

  return adjusted;
}

function renderProviderRiskMatrix() {
  if (!els.providerRiskMatrix) {
    return;
  }
  const providers = (state.providerRatings || []).slice(0, 8);
  if (!providers.length) {
    els.providerRiskMatrix.innerHTML = '<p class="muted">Risk matrix appears after provider activity.</p>';
    return;
  }

  const trustMap = new Map((state.trustScores || []).map((item) => [String(item.provider), item]));
  const maxRevenue = Math.max(1, ...providers.map((item) => Number(item.revenue || 0)));
  const rawPoints = providers.map((provider) => {
    const trust = trustMap.get(String(provider.provider));
    const reliability = clampValue(Number(trust?.reliabilityScore ?? provider.reliabilityScore ?? 0), 0, 100);
    const impact = clampValue((Number(provider.revenue || 0) / maxRevenue) * 100, 0, 100);
    const risk = Number(trust?.contextualRisk?.predictedFailurePct || Math.max(0, 100 - reliability));
    const band = trustTier(risk);
    const fill = band.includes('Low') ? '#13bf7e' : band.includes('Medium') ? '#ffb74d' : '#ff6b53';
    const chart = { x: 84, y: 32, w: 540, h: 262 };
    const baseX = chart.x + (reliability / 100) * chart.w;
    const baseY = chart.y + chart.h - (impact / 100) * chart.h;
    return {
      name: String(provider.provider || ''),
      reliability,
      impact,
      risk,
      fill,
      x: baseX,
      y: baseY
    };
  });
  const chart = { x: 84, y: 32, w: 540, h: 262 };
  const points = deconflictRiskPoints(rawPoints, chart);

  const svgPoints = points
    .map((point, index) => {
      const idx = index + 1;
      return `
        <g class="risk-point-group" data-risk-point="${idx}">
          <circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="9.6" fill="${point.fill}" class="risk-point">
            <title>${sanitize(`${point.name} | Reliability ${point.reliability.toFixed(1)} | Impact ${point.impact.toFixed(1)} | Risk ${point.risk.toFixed(1)}%`)}</title>
          </circle>
          <text x="${point.x.toFixed(1)}" y="${(point.y + 3).toFixed(1)}" class="risk-point-id" text-anchor="middle">${idx}</text>
        </g>
      `;
    })
    .join('');

  const legendRows = points
    .map((point, index) => {
      const idx = index + 1;
      return `
        <article class="risk-legend-item" data-risk-point="${idx}">
          <span class="risk-legend-chip" style="--chip:${point.fill}" data-risk-point="${idx}">${idx}</span>
          <div class="risk-legend-copy">
            <strong>${sanitize(point.name)}</strong>
            <small>Reliability ${point.reliability.toFixed(1)} | Impact ${point.impact.toFixed(1)} | Risk ${point.risk.toFixed(1)}%</small>
          </div>
        </article>
      `;
    })
    .join('');

  const midX = chart.x + chart.w / 2;
  const midY = chart.y + chart.h / 2;
  const priorityCount = points.filter((point) => point.reliability >= 50 && point.impact >= 50).length;
  els.providerRiskMatrix.innerHTML = `
    <div class="risk-matrix-wrap">
      <div class="risk-matrix-meta">
        <small>${points.length} providers plotted</small>
        <small>${priorityCount} in priority zone</small>
        <small>Hover or tap points for detail</small>
      </div>
      <svg viewBox="0 0 720 340" role="img" aria-label="Provider risk matrix">
        <rect x="${chart.x}" y="${chart.y}" width="${chart.w / 2}" height="${chart.h / 2}" class="risk-q q-low-impact"></rect>
        <rect x="${midX}" y="${chart.y}" width="${chart.w / 2}" height="${chart.h / 2}" class="risk-q q-high-impact"></rect>
        <rect x="${chart.x}" y="${midY}" width="${chart.w / 2}" height="${chart.h / 2}" class="risk-q q-low-risk"></rect>
        <rect x="${midX}" y="${midY}" width="${chart.w / 2}" height="${chart.h / 2}" class="risk-q q-top-zone"></rect>
        <line x1="${chart.x}" y1="${midY}" x2="${chart.x + chart.w}" y2="${midY}" class="risk-axis"></line>
        <line x1="${midX}" y1="${chart.y}" x2="${midX}" y2="${chart.y + chart.h}" class="risk-axis"></line>
        <line x1="${chart.x}" y1="${chart.y + chart.h}" x2="${chart.x + chart.w}" y2="${chart.y + chart.h}" class="risk-axis-strong"></line>
        <line x1="${chart.x}" y1="${chart.y}" x2="${chart.x}" y2="${chart.y + chart.h}" class="risk-axis-strong"></line>
        <text x="${chart.x}" y="${chart.y + chart.h + 20}" class="risk-axis-label">Low reliability</text>
        <text x="${chart.x + chart.w - 92}" y="${chart.y + chart.h + 20}" class="risk-axis-label">High reliability</text>
        <text x="${chart.x - 60}" y="${chart.y + 12}" class="risk-axis-label">High impact</text>
        <text x="${chart.x - 56}" y="${chart.y + chart.h}" class="risk-axis-label">Low impact</text>
        <text x="${midX + 10}" y="${chart.y + 16}" class="risk-zone-label">Priority Zone</text>
        ${svgPoints}
      </svg>
      <article class="risk-hover-card" data-risk-hover-card>
        <small>Provider Spotlight</small>
        <strong>${sanitize(points[0].name)}</strong>
        <small>Reliability ${points[0].reliability.toFixed(1)} | Impact ${points[0].impact.toFixed(1)} | Risk ${points[0].risk.toFixed(1)}%</small>
      </article>
      <div class="risk-matrix-legend">${legendRows}</div>
    </div>
  `;

  const pointGroups = Array.from(els.providerRiskMatrix.querySelectorAll('[data-risk-point]'));
  const hoverCard = els.providerRiskMatrix.querySelector('[data-risk-hover-card]');
  let pinned = 1;
  const activate = (idx, lock = false) => {
    const safe = clampValue(idx, 1, points.length);
    if (lock) {
      pinned = safe;
    }
    pointGroups.forEach((item) => item.classList.toggle('is-active', Number(item.dataset.riskPoint) === safe));
    if (hoverCard) {
      const point = points[safe - 1];
      hoverCard.innerHTML = `
        <small>Provider Spotlight</small>
        <strong>${sanitize(point.name)}</strong>
        <small>Reliability ${point.reliability.toFixed(1)} | Impact ${point.impact.toFixed(1)} | Risk ${point.risk.toFixed(1)}%</small>
      `;
    }
  };

  pointGroups.forEach((node) => {
    const idx = Number(node.dataset.riskPoint || 1);
    node.addEventListener('mouseenter', () => activate(idx, false));
    node.addEventListener('focus', () => activate(idx, false));
    node.addEventListener('click', () => activate(idx, true));
    node.addEventListener('mouseleave', () => activate(pinned, false));
  });
  activate(1, true);
}

function renderCarbonTreemap() {
  if (!els.carbonTreemap) {
    return;
  }

  const categoryMap = new Map();
  const sourceBookings = Array.isArray(state.bookings) ? state.bookings : [];
  sourceBookings.forEach((booking) => {
    const category = booking?.service?.category;
    const carbon = Number(booking?.service?.carbonSavedKg || 0);
    if (!category || carbon <= 0) {
      return;
    }
    categoryMap.set(category, Number(categoryMap.get(category) || 0) + carbon);
  });

  if (!categoryMap.size) {
    (state.services || []).forEach((service) => {
      const category = service?.category;
      const carbon = Number(service?.carbonSavedKg || 0);
      if (!category || carbon <= 0) {
        return;
      }
      categoryMap.set(category, Number(categoryMap.get(category) || 0) + carbon * 0.25);
    });
  }

  const entries = [...categoryMap.entries()]
    .map(([category, carbon]) => ({ category, carbon: Number(carbon.toFixed(2)) }))
    .sort((a, b) => b.carbon - a.carbon);
  const total = entries.reduce((sum, item) => sum + item.carbon, 0);
  if (!entries.length || total <= 0) {
    els.carbonTreemap.innerHTML = '<p class="muted">Carbon map appears after bookings are made.</p>';
    return;
  }

  const blocks = entries
    .map((item, index) => {
      const widthPct = Math.max(12, (item.carbon / total) * 100);
      return `
        <article class="treemap-block tone-${(index % 6) + 1}" style="--block:${widthPct}%">
          <small>${sanitize(item.category)}</small>
          <strong>${item.carbon.toFixed(2)}kg</strong>
        </article>
      `;
    })
    .join('');

  els.carbonTreemap.innerHTML = `
    <div class="treemap-strip">${blocks}</div>
    <small class="muted">Total estimated CO2 avoided: ${total.toFixed(2)}kg</small>
  `;
}

function renderVisualAnalytics() {
  renderBookingFlowDiagram();
  renderProviderRiskMatrix();
  renderCarbonTreemap();
}

function buildFallbackMatchFunnel(metrics = {}, benchmarks = {}) {
  const totalSwipes = Number(metrics.totalSwipes || 0);
  const bookings = Number(metrics.bookedCount || 0);

  const conversion = benchmarks?.conversion || {};
  const completion = benchmarks?.completion || {};
  const matchingTime = benchmarks?.matchingTime || {};

  let interest = 0;
  const swipeConversionPct = Number(conversion.swipeConversionPct || 0);
  if (bookings > 0 && swipeConversionPct > 0) {
    interest = Math.round(bookings / Math.max(swipeConversionPct / 100, 0.01));
  } else if (totalSwipes > 0) {
    interest = Math.round(totalSwipes * 0.38);
  }

  let completed = 0;
  const trustCompletionPct = Number(completion.trustCompletionPct || 0);
  if (bookings > 0 && trustCompletionPct > 0) {
    completed = Math.round((trustCompletionPct / 100) * bookings);
  } else if (bookings > 0) {
    completed = Math.round(bookings * 0.8);
  }

  interest = clampNum(interest, 0, Math.max(totalSwipes, interest));
  completed = clampNum(completed, 0, bookings);

  const swipeToInterestPct = totalSwipes ? (interest / totalSwipes) * 100 : 0;
  const interestToBookingPct = interest ? (bookings / interest) * 100 : 0;
  const bookingToCompletionPct = bookings ? (completed / bookings) * 100 : 0;
  const endToEndCompletionPct = totalSwipes ? (completed / totalSwipes) * 100 : 0;
  const now = new Date();
  const monthLabel = now.toLocaleString('en-US', { month: 'short', year: '2-digit' });

  return {
    stages: [
      { key: 'swipes', label: 'Swipes', count: totalSwipes, ratePct: totalSwipes ? 100 : 0 },
      { key: 'interest', label: 'Likes + Superlikes', count: interest, ratePct: swipeToInterestPct },
      { key: 'bookings', label: 'Bookings', count: bookings, ratePct: totalSwipes ? (bookings / totalSwipes) * 100 : 0 },
      { key: 'completed', label: 'Completed (Paid)', count: completed, ratePct: endToEndCompletionPct }
    ],
    rates: {
      swipeToInterestPct,
      interestToBookingPct,
      bookingToCompletionPct,
      endToEndCompletionPct
    },
    speed: {
      baselineMinutes: Number(matchingTime.baselineTimeMinutes || 0),
      swipeToBookingMinutes: Number(matchingTime.swipeTimeMinutes || 0),
      improvementPct: Number(matchingTime.improvementPct || 0)
    },
    comparison: {
      observed: {
        label: 'Swipe-first (Observed)',
        matchingMinutes: Number(matchingTime.swipeTimeMinutes || 0),
        conversionPct: Number(conversion.swipeConversionPct || interestToBookingPct || 0),
        completionPct: Number(completion.trustCompletionPct || bookingToCompletionPct || 0)
      },
      baseline: {
        label: 'List-first (Modeled Baseline)',
        matchingMinutes: Number(matchingTime.baselineTimeMinutes || 0),
        conversionPct: Number(conversion.baselineConversionPct || 0),
        completionPct: Number(completion.baselineCompletionPct || 0)
      },
      lift: {
        speedGainPct: Number(matchingTime.improvementPct || 0),
        conversionGainPct: Number(conversion.increasePct || 0),
        completionGainPct: Number(completion.improvementPct || 0)
      },
      evidenceLabel: 'Observed vs modeled baseline'
    },
    trajectory: [
      {
        month: monthLabel,
        swipes: totalSwipes,
        interest,
        bookings,
        completed,
        interestToBookingPct: Number(interestToBookingPct.toFixed(1)),
        bookingToCompletionPct: Number(bookingToCompletionPct.toFixed(1))
      }
    ],
    categorySignals: [],
    providerSignals: []
  };
}

function renderGoalProgress(metrics) {
  if (!els.goalProgressText) {
    return;
  }
  if (!state.goal) {
    els.goalProgressText.textContent = 'Set your goals to track progress.';
    return;
  }

  const progress = Number(metrics.goalProgressPct || 0);
  const streak = Number(metrics.streakMonths || 0);
  els.goalProgressText.innerHTML = `
    <div class="goal-progress"><span style="width:${Math.min(progress, 100)}%"></span></div>
    <small>${progress}% of monthly carbon goal, ${streak} month streak.</small>
  `;
}

function bundleStorageKey() {
  return `ecoswipe_bundle_pins_${state.user?.id || 'anon'}`;
}

function loadSavedBundles() {
  try {
    const raw = localStorage.getItem(bundleStorageKey());
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    state.savedBundleKeys = new Set(list.map((item) => String(item)));
  } catch {
    state.savedBundleKeys = new Set();
  }
}

function persistSavedBundles() {
  try {
    localStorage.setItem(bundleStorageKey(), JSON.stringify([...state.savedBundleKeys]));
  } catch {
    // ignore localStorage failures
  }
}

function normalizeBundleKey(item, index) {
  return String(item.key || `bundle-${index}-${item.primaryService}-${item.addOnService}`);
}

function findBundleByKey(bundleKey) {
  return state.bundleSuggestions.find((item, index) => normalizeBundleKey(item, index) === String(bundleKey));
}

function toggleBundleExpanded(bundleKey) {
  const key = String(bundleKey || '');
  state.activeBundleKey = state.activeBundleKey === key ? '' : key;
  renderBundleSuggestions();
}

function toggleSavedBundle(bundleKey) {
  const key = String(bundleKey || '');
  if (!key) {
    return;
  }
  if (state.savedBundleKeys.has(key)) {
    state.savedBundleKeys.delete(key);
    showToast('Bundle removed from saved list.');
  } else {
    state.savedBundleKeys.add(key);
    showToast('Bundle saved.');
  }
  persistSavedBundles();
  renderBundleSuggestions();
}

function applyBundleToBooking(bundleKey) {
  const bundle = findBundleByKey(bundleKey);
  if (!bundle) {
    showToast('Bundle unavailable.');
    return;
  }

  const primary = state.catalog.find((service) => service.title === bundle.primaryService);
  const addOn = state.catalog.find((service) => service.title === bundle.addOnService);
  if (!primary || !addOn) {
    showToast('Could not map bundle to a service in your current catalog.');
    return;
  }

  if (els.bookingService) {
    els.bookingService.value = primary.id;
  }

  if (els.bookingDate && bundle.suggestedDate) {
    const minDate = els.bookingDate.min || todayISO();
    els.bookingDate.value = bundle.suggestedDate >= minDate ? bundle.suggestedDate : minDate;
  }

  if (els.bookingSlot && bundle.suggestedSlot) {
    const existing = Array.from(els.bookingSlot.options).some((option) => option.value === bundle.suggestedSlot);
    if (!existing) {
      const option = document.createElement('option');
      option.value = bundle.suggestedSlot;
      option.textContent = bundle.suggestedSlot;
      els.bookingSlot.appendChild(option);
    }
    els.bookingSlot.value = bundle.suggestedSlot;
  }

  if (els.bookingNotes) {
    const detail = `Bundle: ${bundle.primaryService} + ${bundle.addOnService} | ${bundle.reason || 'Optimized pairing'}`;
    els.bookingNotes.value = detail.slice(0, 220);
  }
  state.pendingBundleBooking = {
    bundleKey: String(bundleKey),
    primaryServiceId: primary.id,
    addOnServiceId: addOn.id,
    primaryServiceTitle: bundle.primaryService,
    addOnServiceTitle: bundle.addOnService
  };
  renderBookingModeHint();

  const controlsPanel = document.querySelector('.controls-panel');
  if (controlsPanel) {
    controlsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  showToast('Bundle mode enabled. Confirm to book both services together.');
}

function applyExclusiveServiceToBooking(bundleKey, target = 'addon') {
  const bundle = findBundleByKey(bundleKey);
  if (!bundle) {
    showToast('Exclusive pair unavailable.');
    return;
  }

  const serviceTitle = target === 'primary' ? bundle.primaryService : bundle.addOnService;
  const service = state.catalog.find((item) => item.title === serviceTitle);
  if (!service) {
    showToast('Could not map this service to booking catalog.');
    return;
  }

  if (els.bookingService) {
    els.bookingService.value = service.id;
  }

  if (els.bookingDate && bundle.suggestedDate) {
    const minDate = els.bookingDate.min || todayISO();
    els.bookingDate.value = bundle.suggestedDate >= minDate ? bundle.suggestedDate : minDate;
  }

  if (els.bookingSlot && bundle.suggestedSlot) {
    const exists = Array.from(els.bookingSlot.options).some((option) => option.value === bundle.suggestedSlot);
    if (!exists) {
      const option = document.createElement('option');
      option.value = bundle.suggestedSlot;
      option.textContent = bundle.suggestedSlot;
      els.bookingSlot.appendChild(option);
    }
    els.bookingSlot.value = bundle.suggestedSlot;
  }

  if (els.bookingNotes) {
    const contextLabel = target === 'primary' ? 'Primary' : 'Add-on';
    const detail = `${contextLabel} from Today's Exclusive Pair: ${bundle.primaryService} + ${bundle.addOnService}`;
    els.bookingNotes.value = detail.slice(0, 220);
  }
  clearPendingBundleBooking();

  const controlsPanel = document.querySelector('.controls-panel');
  if (controlsPanel) {
    controlsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  showToast(`${service.title} added to Quick Booking.`);
}

function renderBundleSuggestions() {
  if (!els.bundleList) {
    return;
  }
  if (!state.bundleSuggestions.length) {
    els.bundleList.innerHTML = '<p class="muted">No bundle suggestions yet.</p>';
    return;
  }

  els.bundleList.innerHTML = state.bundleSuggestions
    .map((item, index) => {
      const bundleKey = normalizeBundleKey(item, index);
      const expanded = state.activeBundleKey === bundleKey;
      const saved = state.savedBundleKeys.has(bundleKey);
      const exclusive = Boolean(item.isExclusiveToday);
      const offerLabel = sanitize(item.offerLabel || (exclusive ? 'Exclusive Pair of the Day' : 'Area Pair'));
      const areaLabel = item.suggestedRegion ? sanitize(item.suggestedRegion) : '';
      return `
        <article class="bundle-item bundle-interactive ${expanded ? 'expanded' : ''} ${exclusive ? 'bundle-exclusive' : 'bundle-area'}">
          <button class="bundle-toggle" type="button" data-bundle-action="toggle" data-bundle-key="${bundleKey}">
            <div class="bundle-chip-row">
              <span class="bundle-chip ${exclusive ? 'bundle-chip-exclusive' : 'bundle-chip-area'}">${offerLabel}</span>
              ${areaLabel ? `<span class="bundle-chip bundle-chip-region">${areaLabel}</span>` : ''}
            </div>
            <strong>${sanitize(item.primaryService)} + ${sanitize(item.addOnService)}</strong>
            <small>${sanitize(item.suggestedDate)} | ${sanitize(item.suggestedSlot)}</small>
            <small>${item.projectedCarbonSavedKg}kg CO2 and ${money(item.projectedCostSaved)} potential savings</small>
          </button>
          <div class="bundle-actions-row">
            <button class="btn btn-ghost circle-inline-btn" type="button" data-bundle-action="apply" data-bundle-key="${bundleKey}">Book Together</button>
            <button class="btn btn-ghost circle-inline-btn" type="button" data-bundle-action="save" data-bundle-key="${bundleKey}">${saved ? 'Unsave' : 'Save'}</button>
          </div>
          ${
            expanded
              ? `<div class="bundle-extra">
                  <small>${sanitize(item.reason || 'Optimized adjacency recommendation.')}</small>
                  <small>Projected carbon: ${item.projectedCarbonSavedKg}kg | Projected savings: ${money(item.projectedCostSaved)}</small>
                </div>`
              : ''
          }
        </article>
      `;
    })
    .join('');
}

function clampValue(value, min, max) {
  return Math.min(max, Math.max(min, Number(value || 0)));
}

function providerSortLabel(sortKey) {
  const labels = {
    score: 'Composite score',
    reliabilityScore: 'Reliability',
    revenue: 'Revenue',
    jobs: 'Jobs completed',
    carbonSavedKg: 'Carbon saved',
    sustainability: 'Sustainability'
  };
  return labels[sortKey] || 'Composite score';
}

function trustTierClass(label) {
  const key = String(label || '').toLowerCase();
  if (key.includes('low')) return 'trust-chip-low';
  if (key.includes('medium')) return 'trust-chip-medium';
  return 'trust-chip-high';
}

function renderProviderRatings() {
  if (!els.providerRatings) {
    return;
  }
  if (!state.providerRatings.length) {
    els.providerRatings.innerHTML = '<p class="muted">No provider ratings yet.</p>';
    return;
  }

  const sortKey = els.providerSort?.value || state.providerSortKey || 'score';
  const minReliability = clampValue(els.providerReliabilityMin?.value || state.providerReliabilityMin || 0, 0, 100);
  state.providerSortKey = sortKey;
  state.providerReliabilityMin = minReliability;

  if (els.providerReliabilityMinLabel) {
    els.providerReliabilityMinLabel.textContent = String(Math.round(minReliability));
  }

  const filtered = state.providerRatings
    .filter((provider) => Number(provider.reliabilityScore || 0) >= minReliability)
    .sort((a, b) => {
      const diff = Number(b[sortKey] || 0) - Number(a[sortKey] || 0);
      if (Math.abs(diff) > 0.001) {
        return diff;
      }
      return Number(b.score || 0) - Number(a.score || 0);
    });

  if (!filtered.length) {
    els.providerRatings.innerHTML = `<p class="muted">No providers above reliability threshold ${Math.round(minReliability)}.</p>`;
    return;
  }

  const maxRevenue = Math.max(1, ...filtered.map((provider) => Number(provider.revenue || 0)));
  const maxJobs = Math.max(1, ...filtered.map((provider) => Number(provider.jobs || 0)));
  const maxCarbon = Math.max(1, ...filtered.map((provider) => Number(provider.carbonSavedKg || 0)));
  const trustByProvider = new Map(
    (state.trustScores || [])
      .filter((item) => item && item.provider)
      .map((item) => [String(item.provider), item])
  );

  els.providerRatings.innerHTML = filtered
    .slice(0, 8)
    .map((provider, index) => {
      const score = clampValue(provider.score, 0, 100);
      const reliability = clampValue(provider.reliabilityScore, 0, 100);
      const sustainability = clampValue(provider.sustainability, 0, 100);
      const revenue = Number(provider.revenue || 0);
      const jobs = Number(provider.jobs || 0);
      const carbon = Number(provider.carbonSavedKg || 0);
      const revenuePct = clampValue((revenue / maxRevenue) * 100, 0, 100);
      const jobsPct = clampValue((jobs / maxJobs) * 100, 0, 100);
      const carbonPct = clampValue((carbon / maxCarbon) * 100, 0, 100);
      const trust = trustByProvider.get(String(provider.provider));
      const riskPct = Number(trust?.contextualRisk?.predictedFailurePct || Math.max(0, 100 - reliability));
      const trustBand = trustTier(riskPct);
      const trustClass = trustTierClass(trustBand);
      const trustReliability = Number(trust?.reliabilityScore || reliability);

      return `
        <article class="provider-item provider-rich" style="--delay:${index * 45}ms">
          <div class="provider-rich-head">
            <strong>#${index + 1} ${sanitize(provider.provider)}</strong>
            <div class="provider-badge-row">
              <span class="provider-rank-chip">${providerSortLabel(sortKey)}: ${Number(provider[sortKey] || 0).toFixed(1)}</span>
              <span class="provider-trust-chip ${trustClass}">${sanitize(trustBand)} Trust</span>
            </div>
          </div>
          <div class="provider-rich-kpis">
            <small>Score <b>${score.toFixed(1)}</b></small>
            <small>Reliability <b>${trustReliability.toFixed(1)}</b></small>
            <small>Sustainability <b>${sustainability.toFixed(1)}</b></small>
            <small>Failure Risk <b>${riskPct.toFixed(1)}%</b></small>
          </div>
          <div class="provider-metric-stack">
            <div class="provider-track"><small>Score</small><span><b style="width:${score}%"></b></span></div>
            <div class="provider-track"><small>Reliability</small><span><b style="width:${clampValue(trustReliability, 0, 100)}%"></b></span></div>
            <div class="provider-track"><small>Sustainability</small><span><b style="width:${sustainability}%"></b></span></div>
          </div>
          <div class="provider-rich-economics">
            <small>Revenue ${money(revenue)} <i style="--width:${revenuePct}%"></i></small>
            <small>Jobs ${jobs} <i style="--width:${jobsPct}%"></i></small>
            <small>CO2 ${carbon.toFixed(1)}kg <i style="--width:${carbonPct}%"></i></small>
          </div>
        </article>
      `;
    })
    .join('');
}

function benchmarkScenarioConfig(scenarioKey) {
  const map = {
    observed: {
      key: 'observed',
      label: 'Now',
      factor: 1,
      description: 'Uses your current app performance exactly as it is.'
    },
    stretch: {
      key: 'stretch',
      label: 'Best Case',
      factor: 1.25,
      description: 'Assumes stronger adoption and smoother operations.'
    },
    conservative: {
      key: 'conservative',
      label: 'Safe Estimate',
      factor: 0.8,
      description: 'Assumes slower improvement and cautious results.'
    }
  };
  return map[scenarioKey] || map.observed;
}

function computeScenarioBenchmarks(data, scenarioKey) {
  const scenario = benchmarkScenarioConfig(scenarioKey);
  const matching = data.matchingTime || {};
  const conversion = data.conversion || {};
  const completion = data.completion || {};
  const carbon = data.carbon || {};

  const baselineTime = Number(matching.baselineTimeMinutes || 0);
  const observedSwipeTime = Number(matching.swipeTimeMinutes || baselineTime || 0);
  const savedMinutes = Math.max(0, baselineTime - observedSwipeTime);
  const scenarioSwipeTime = Math.max(0.1, baselineTime - savedMinutes * scenario.factor);
  const matchingImprovementPct = baselineTime
    ? Number((((baselineTime - scenarioSwipeTime) / baselineTime) * 100).toFixed(1))
    : 0;

  const baselineConversion = Number(conversion.baselineConversionPct || 0);
  const observedConversion = Number(conversion.swipeConversionPct || baselineConversion || 0);
  const conversionLift = Math.max(0, observedConversion - baselineConversion);
  const scenarioConversion = Number((baselineConversion + conversionLift * scenario.factor).toFixed(1));
  const conversionIncreasePct = baselineConversion
    ? Number((((scenarioConversion - baselineConversion) / baselineConversion) * 100).toFixed(1))
    : 0;

  const baselineCompletion = Number(completion.baselineCompletionPct || 0);
  const observedCompletion = Number(completion.trustCompletionPct || baselineCompletion || 0);
  const completionLift = Math.max(0, observedCompletion - baselineCompletion);
  const scenarioCompletion = Number((baselineCompletion + completionLift * scenario.factor).toFixed(1));
  const completionImprovementPct = baselineCompletion
    ? Number((((scenarioCompletion - baselineCompletion) / baselineCompletion) * 100).toFixed(1))
    : 0;

  const traditionalCarbon = Number(carbon.traditionalCo2Kg || 0);
  const observedEcoCarbon = Number(carbon.ecoCo2Kg || traditionalCarbon || 0);
  const carbonSavings = Math.max(0, traditionalCarbon - observedEcoCarbon);
  const scenarioEcoCarbon = Number(Math.max(0, traditionalCarbon - carbonSavings * scenario.factor).toFixed(2));
  const carbonReductionPct = traditionalCarbon
    ? Number((((traditionalCarbon - scenarioEcoCarbon) / traditionalCarbon) * 100).toFixed(1))
    : 0;

  return {
    scenario,
    matching: {
      baselineTimeMinutes: Number(baselineTime.toFixed(1)),
      scenarioTimeMinutes: Number(scenarioSwipeTime.toFixed(1)),
      improvementPct: matchingImprovementPct,
      absoluteSavedMinutes: Number((baselineTime - scenarioSwipeTime).toFixed(1))
    },
    conversion: {
      baselinePct: Number(baselineConversion.toFixed(1)),
      scenarioPct: scenarioConversion,
      increasePct: conversionIncreasePct
    },
    completion: {
      baselinePct: Number(baselineCompletion.toFixed(1)),
      scenarioPct: scenarioCompletion,
      improvementPct: completionImprovementPct,
      avgReliabilityScore: Number(completion.avgReliabilityScore || 0)
    },
    carbon: {
      traditionalKg: Number(traditionalCarbon.toFixed(2)),
      ecoKg: scenarioEcoCarbon,
      reductionPct: carbonReductionPct,
      savedKg: Number((traditionalCarbon - scenarioEcoCarbon).toFixed(2))
    }
  };
}

function renderOutcomeBenchmarks() {
  const data = state.benchmarks;
  if (!els.outcomeBenchmarks) {
    return;
  }
  if (!data) {
    els.outcomeBenchmarks.innerHTML = '<p class="muted">No report card data available yet.</p>';
    return;
  }

  const rawView = els.benchmarkView?.value || state.benchmarkView || 'executive';
  const view = rawView === 'diagnostic' ? 'diagnostic' : 'executive';
  const scenarioKey = els.benchmarkScenario?.value || state.benchmarkScenario || 'observed';
  state.benchmarkView = view;
  state.benchmarkScenario = scenarioKey;

  const model = computeScenarioBenchmarks(data, scenarioKey);
  const gradeForScore = (score) => {
    const s = clampValue(Number(score || 0), 0, 100);
    if (s >= 90) return 'A+';
    if (s >= 85) return 'A';
    if (s >= 80) return 'A-';
    if (s >= 75) return 'B+';
    if (s >= 70) return 'B';
    if (s >= 65) return 'B-';
    if (s >= 60) return 'C+';
    if (s >= 55) return 'C';
    if (s >= 50) return 'C-';
    return 'D';
  };
  const gradeTone = (score) => {
    if (score >= 82) return 'excellent';
    if (score >= 68) return 'good';
    if (score >= 55) return 'moderate';
    return 'risk';
  };

  const matchingScore = clampValue(50 + Number(model.matching.improvementPct || 0) * 2, 0, 100);
  const conversionScore = clampValue(Number(model.conversion.scenarioPct || 0), 0, 100);
  const completionScore = clampValue(Number(model.completion.scenarioPct || 0), 0, 100);
  const carbonScore = clampValue(45 + Number(model.carbon.reductionPct || 0) * 1.1, 0, 100);
  const overallScore = Number(
    (matchingScore * 0.3 + conversionScore * 0.25 + completionScore * 0.25 + carbonScore * 0.2).toFixed(1)
  );
  const overallGrade = gradeForScore(overallScore);
  const overallTone = gradeTone(overallScore);

  const reportRows = [
    {
      title: 'Matching Speed',
      score: matchingScore,
      grade: gradeForScore(matchingScore),
      note: `${model.matching.scenarioTimeMinutes} min vs ${model.matching.baselineTimeMinutes} min baseline`
    },
    {
      title: 'Conversion',
      score: conversionScore,
      grade: gradeForScore(conversionScore),
      note: `${model.conversion.scenarioPct}% swipe-to-book vs ${model.conversion.baselinePct}% baseline`
    },
    {
      title: 'Completion',
      score: completionScore,
      grade: gradeForScore(completionScore),
      note: `${model.completion.scenarioPct}% completion | reliability ${model.completion.avgReliabilityScore.toFixed(1)}`
    },
    {
      title: 'Carbon Impact',
      score: carbonScore,
      grade: gradeForScore(carbonScore),
      note: `${model.carbon.savedKg.toFixed(2)}kg avoided (${model.carbon.reductionPct}% reduction)`
    }
  ];

  const subjectRows = reportRows
    .map(
      (row) => `
        <article class="report-subject-card">
          <div class="report-subject-head">
            <h5>${row.title}</h5>
            <span class="report-grade-chip">${row.grade}</span>
          </div>
          <small>${row.note}</small>
          <div class="report-meter"><b style="width:${clampValue(row.score, 0, 100)}%"></b></div>
          <small class="report-score-label">${row.score.toFixed(1)}/100</small>
        </article>
      `
    )
    .join('');

  const comment =
    overallScore >= 82
      ? 'Excellent momentum. Keep driving completion consistency and scale paid conversions.'
      : overallScore >= 68
        ? 'Strong foundation. Next step is improving conversion speed and reducing drop-off.'
        : 'Core metrics are active, but consistency needs improvement before scaling aggressively.';

  let diagnosticStrip = '';
  if (view === 'diagnostic') {
    const bookingsPer100Swipes = model.conversion.scenarioPct;
    const completedPer100Swipes = Number(((bookingsPer100Swipes * model.completion.scenarioPct) / 100).toFixed(1));
    const timeSavedPer100Swipes = Number((model.matching.absoluteSavedMinutes * bookingsPer100Swipes).toFixed(1));
    const baseBookingCount = Number(state.metrics.bookedCount || 0);
    const carbonSavedPerBooking = baseBookingCount ? Number((model.carbon.savedKg / baseBookingCount).toFixed(2)) : 0;
    const projectedCarbonSavedPer100 = Number((carbonSavedPerBooking * bookingsPer100Swipes).toFixed(2));

    diagnosticStrip = `
      <div class="report-diagnostic-strip">
        <small><strong>${bookingsPer100Swipes.toFixed(1)}</strong> bookings / 100 swipes</small>
        <small><strong>${completedPer100Swipes.toFixed(1)}</strong> completions / 100 swipes</small>
        <small><strong>${timeSavedPer100Swipes.toFixed(1)} min</strong> saved / 100 swipes</small>
        <small><strong>${projectedCarbonSavedPer100.toFixed(2)}kg</strong> CO2 avoided / 100 swipes</small>
      </div>
    `;
  }

  els.outcomeBenchmarks.innerHTML = `
    <section class="report-card-shell">
      <header class="report-card-head">
        <div class="report-head-copy">
          <small>Performance Report Card</small>
          <strong>${model.scenario.label} Mode</strong>
          <p>${model.scenario.description}</p>
        </div>
        <aside class="report-overall report-overall-${overallTone}">
          <small>Overall Grade</small>
          <strong>${overallGrade}</strong>
          <span>${overallScore.toFixed(1)}/100</span>
        </aside>
      </header>
      <div class="report-subject-grid">
        ${subjectRows}
      </div>
      ${diagnosticStrip}
      <div class="report-comment">
        <strong>Quick Summary</strong>
        <p>${comment}</p>
      </div>
    </section>
  `;
}

function formatReceiptDate(value) {
  if (!value) {
    return '-';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    if (String(value).length >= 10) {
      return String(value);
    }
    return '-';
  }
  return parsed.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function receiptSerial(receipt) {
  const raw = String(receipt?.bookingId || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!raw) {
    return `ECO-${String(Date.now()).slice(-8)}`;
  }
  return `ECO-${raw.slice(0, 10)}`;
}

function buildImpactBillMarkup(receipt, options = {}) {
  const includeActions = options.includeActions !== false;
  const resolvedPackageLabel = packageLabelForReceipt(receipt);
  const resolvedBundleLabel = bundleLabelForReceipt(receipt);
  const title = sanitize(
    resolvedPackageLabel
      ? `Package Booking: ${resolvedPackageLabel}`
      : resolvedBundleLabel
        ? `Bundle Booking: ${resolvedBundleLabel}`
        : receipt.service?.title || getServiceTitle(receipt.serviceId)
  );
  const bundleItems = String(resolvedBundleLabel || '')
    .split('+')
    .map((item) => item.trim())
    .filter(Boolean);
  const offer = receipt.offer || null;
  const issuedAt = formatReceiptDate(receipt.createdAt || receipt.scheduledDate || new Date().toISOString());
  const visitOn = receipt.scheduledDate ? `${sanitize(receipt.scheduledDate)}${receipt.slot ? ` | ${sanitize(receipt.slot)}` : ''}` : '-';
  const serviceAddress = sanitize(addressForReceipt(receipt) || '-');
  const paidNow = Number(receipt.booking?.paidNow || 0);
  const baseAmount = Number(receipt.booking?.baseAmount || paidNow || 0);
  const discountAmount = Number(receipt.booking?.discountAmount || offer?.discountAmount || 0);
  const discountPct = Number(receipt.booking?.discountPct || offer?.discountPct || 0);
  const couponCode = sanitize(receipt.booking?.couponCode || offer?.code || '');
  const opsCarbon = Number(receipt.breakdown?.ecoOperationsKg || receipt.serviceCarbonKg || 0);
  const transportCarbon = Number(receipt.breakdown?.ecoTransportKg || 0);
  const baselineCarbon = Number(receipt.baseline?.traditionalCarbonKg || 0);

  return `
    <article class="impact-bill" data-receipt-booking="${sanitize(receipt.bookingId || '')}">
      <header class="impact-bill-head">
        <div>
          <p class="impact-bill-brand">EcoSwipe Service Bill</p>
          <small class="impact-bill-tag">Classic Receipt + Sustainability Ledger</small>
        </div>
        <span class="impact-bill-stamp">PAID</span>
      </header>

      <div class="impact-bill-meta">
        <small>Receipt No: <strong>${sanitize(receiptSerial(receipt))}</strong></small>
        <small>Booking ID: <strong>${sanitize(receipt.bookingId || '-')}</strong></small>
        <small>Issued: <strong>${sanitize(issuedAt)}</strong></small>
        <small>Visit Slot: <strong>${visitOn}</strong></small>
        <small>Service Address: <strong>${serviceAddress}</strong></small>
      </div>

      <div class="impact-bill-rule"></div>

      <div class="impact-bill-line impact-bill-line-head">
        <span>Description</span>
        <span>Amount</span>
      </div>
      <div class="impact-bill-line">
        <span>${title}</span>
        <span>${money(baseAmount)}</span>
      </div>
      ${
        bundleItems.length > 1
          ? `<div class="impact-bill-line">
              <span>Includes: ${sanitize(bundleItems.join(', '))}</span>
              <span>Bundle</span>
            </div>`
          : ''
      }
      ${
        discountAmount > 0
          ? `<div class="impact-bill-line">
              <span>Offer Applied ${couponCode ? `(${couponCode})` : ''}</span>
              <span>-${money(discountAmount)}${discountPct > 0 ? ` (${discountPct.toFixed(1)}%)` : ''}</span>
            </div>`
          : ''
      }
      <div class="impact-bill-line">
        <span>Platform Fee</span>
        <span>$0.00</span>
      </div>
      <div class="impact-bill-line">
        <span>Taxes</span>
        <span>Included</span>
      </div>

      <div class="impact-bill-rule"></div>

      <div class="impact-bill-total">
        <span>Total Paid</span>
        <strong>${money(paidNow)}</strong>
      </div>

      <div class="impact-bill-impact">
        <div>
          <small>CO2 Avoided</small>
          <strong>${Number(receipt.carbonSavedKg || 0).toFixed(2)} kg</strong>
        </div>
        <div>
          <small>Estimated Savings</small>
          <strong>${money(receipt.moneySaved)}</strong>
        </div>
        <div>
          <small>Time Saved</small>
          <strong>${Number(receipt.timeSavedMinutes || 0)} min</strong>
        </div>
      </div>

      <div class="impact-bill-impact-secondary">
        <small>Eco Ops: ${opsCarbon.toFixed(2)}kg | Eco Transport: ${transportCarbon.toFixed(2)}kg | Traditional: ${baselineCarbon.toFixed(2)}kg</small>
      </div>

      <div class="impact-bill-footer">
        <small>Thank you for choosing low-impact services with EcoSwipe.</small>
        <small>Come back soon for your next service.</small>
      </div>

      ${
        includeActions
          ? `<div class="impact-bill-actions">
        <button class="btn" type="button" data-receipt-action="download" data-receipt-booking="${sanitize(receipt.bookingId || '')}">Download Bill</button>
        <button class="btn btn-ghost" type="button" data-receipt-action="print" data-receipt-booking="${sanitize(receipt.bookingId || '')}">Print Bill</button>
      </div>`
          : ''
      }
    </article>
  `;
}

function buildBillDocument(receipt, options = {}) {
  const autoPrint = Boolean(options.autoPrint);
  const body = buildImpactBillMarkup(receipt, { includeActions: false });
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>EcoSwipe Bill ${sanitize(receipt.bookingId || '')}</title>
  <style>
    :root {
      --ink: #141a2a;
      --paper: #f8f2e6;
      --paperLine: #dfd4bf;
      --accent: #15616d;
      --stamp: #b00020;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      background: #ece8df;
      color: var(--ink);
      font-family: "Courier New", Courier, monospace;
    }
    .impact-bill {
      max-width: 760px;
      margin: 0 auto;
      background: var(--paper);
      border: 2px solid #b8a88c;
      border-radius: 12px;
      padding: 18px;
      box-shadow: 0 14px 32px rgba(0, 0, 0, 0.1);
    }
    .impact-bill-head { display: flex; justify-content: space-between; align-items: start; gap: 14px; }
    .impact-bill-brand { margin: 0; font-size: 1.35rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    .impact-bill-tag { display: inline-block; color: #374151; margin-top: 4px; }
    .impact-bill-stamp {
      border: 2px solid var(--stamp);
      color: var(--stamp);
      padding: 4px 10px;
      border-radius: 999px;
      font-weight: 700;
      letter-spacing: 0.11em;
      transform: rotate(-7deg);
    }
    .impact-bill-meta { margin-top: 12px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 14px; }
    .impact-bill-meta small { color: #111827; }
    .impact-bill-rule { border-top: 1px dashed #7f8b9a; margin: 12px 0; }
    .impact-bill-line,
    .impact-bill-total { display: grid; grid-template-columns: 1fr auto; gap: 8px; padding: 5px 0; }
    .impact-bill-line-head { text-transform: uppercase; font-weight: 700; color: #1f2937; font-size: 0.86rem; }
    .impact-bill-total { font-size: 1.1rem; font-weight: 700; color: var(--accent); }
    .impact-bill-impact {
      margin-top: 10px;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }
    .impact-bill-impact > div {
      border: 1px solid var(--paperLine);
      border-radius: 8px;
      background: #fefbf4;
      padding: 8px;
      display: grid;
      gap: 3px;
    }
    .impact-bill-impact-secondary {
      margin-top: 8px;
      border: 1px dashed var(--paperLine);
      border-radius: 8px;
      padding: 8px;
      background: #f9f7f1;
    }
    .impact-bill-footer {
      margin-top: 12px;
      border-top: 1px solid var(--paperLine);
      padding-top: 10px;
      display: grid;
      gap: 3px;
      color: #374151;
      font-size: 0.83rem;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .impact-bill { box-shadow: none; border: 1px solid #222; border-radius: 0; max-width: none; }
    }
  </style>
</head>
<body>
  ${body}
  ${
    autoPrint
      ? `<script>
      window.addEventListener('load', function () {
        setTimeout(function () {
          window.print();
        }, 120);
      });
    <\/script>`
      : ''
  }
</body>
</html>`;
}

function downloadReceiptBill(receipt) {
  if (!receipt) {
    showToast('Open a receipt first.');
    return;
  }

  const html = buildBillDocument(receipt);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const bookingId = sanitize(receipt.bookingId || 'bill').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
  const a = document.createElement('a');
  a.href = url;
  a.download = `ecoswipe-bill-${bookingId || 'receipt'}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
  showToast('Bill downloaded.');
}

function printReceiptBill(receipt) {
  if (!receipt) {
    showToast('Open a receipt first.');
    return;
  }
  const opened = window.open('', '_blank', 'width=940,height=880');
  if (!opened) {
    showToast('Please allow pop-ups to print the bill.');
    return;
  }
  opened.document.open();
  opened.document.write(buildBillDocument(receipt, { autoPrint: true }));
  opened.document.close();
  opened.focus();
}

function findReceiptByBookingId(bookingId) {
  if (!bookingId) {
    return null;
  }
  if (state.latestReceipt?.bookingId === bookingId) {
    return state.latestReceipt;
  }
  return state.receiptHistory.find((item) => item.bookingId === bookingId) || null;
}

function renderReceipt(receipt) {
  if (!receipt) {
    els.impactReceipt.innerHTML = '<p class="muted">Receipt unlocks only after admin approval and payment.</p>';
    return;
  }

  const currentId = receipt.bookingId || '';
  const isRecent = state.receiptHistory.length > 0 && state.receiptHistory[0].bookingId === currentId;
  const recentTag = isRecent
    ? '<div class="receipt-recent-tag"><small>Recent purchase</small></div>'
    : '';
  els.impactReceipt.innerHTML = `${recentTag}${buildImpactBillMarkup(receipt)}`;
}

function renderReceiptHistory() {
  if (!state.receiptHistory.length) {
    els.receiptHistoryList.innerHTML = '<p class="muted">No receipts yet.</p>';
    return;
  }

  els.receiptHistoryList.innerHTML = state.receiptHistory
    .map((receipt) => {
      const resolvedPackageLabel = packageLabelForReceipt(receipt);
      const resolvedBundleLabel = bundleLabelForReceipt(receipt);
      const title = sanitize(
        resolvedPackageLabel
          ? `Package Booking: ${resolvedPackageLabel}`
          : resolvedBundleLabel
            ? `Bundle Booking: ${resolvedBundleLabel}`
            : receipt.service?.title || getServiceTitle(receipt.serviceId)
      );
      const when = receipt.scheduledDate || '-';
      return `
        <article class="bundle-item">
          <strong>${title}</strong>
          <small>${when}${receipt.slot ? ` | ${receipt.slot}` : ''} | ${receipt.carbonSavedKg}kg CO2 saved</small>
          <small>${money(receipt.moneySaved)} saved | ${receipt.timeSavedMinutes} min saved</small>
          <div class="receipt-history-actions">
            <button class="btn btn-ghost" type="button" data-receipt-open="${receipt.bookingId}">Open Receipt</button>
            <button class="btn btn-ghost" type="button" data-receipt-download="${receipt.bookingId}">Download Bill</button>
          </div>
        </article>
      `;
    })
    .join('');
}

function focusImpactReceiptPanel(behavior = 'smooth') {
  const panel = document.getElementById('impactReceiptPanel');
  if (!panel) {
    return;
  }

  activateNavFeature('impactReceiptPanel', {
    updateHash: true,
    scroll: false
  });
  panel.scrollIntoView({ behavior, block: 'start' });

  panel.classList.add('receipt-focus');
  clearTimeout(focusImpactReceiptPanel.timer);
  focusImpactReceiptPanel.timer = setTimeout(() => {
    panel.classList.remove('receipt-focus');
  }, 1200);
}

async function loadReceiptByBooking(bookingId, silent = false) {
  if (!bookingId) {
    return;
  }
  const data = await api(`/api/bookings/${encodeURIComponent(bookingId)}/receipt`);
  state.latestReceipt = data.receipt || null;
  if (state.latestReceipt && !state.latestReceipt.bundleLabel) {
    state.latestReceipt.bundleLabel = bundleLabelForReceipt(state.latestReceipt);
  }
  if (state.latestReceipt && !state.latestReceipt.packageLabel) {
    state.latestReceipt.packageLabel = packageLabelForReceipt(state.latestReceipt);
  }
  renderReceipt(state.latestReceipt);
  if (state.latestReceipt && !silent) {
    focusImpactReceiptPanel('smooth');
    setTimeout(() => focusImpactReceiptPanel('auto'), 220);
    showToast('Impact receipt updated.');
  }
}

async function loadReceiptHistory() {
  const data = await api('/api/receipts?limit=160');
  state.receiptHistory = Array.isArray(data.receipts) ? data.receipts : [];
  renderReceiptHistory();
  if (!state.receiptHistory.length) {
    state.latestReceipt = null;
    renderReceipt(null);
  }
  if (!state.latestReceipt && state.receiptHistory.length) {
    state.latestReceipt = state.receiptHistory[0];
    renderReceipt(state.latestReceipt);
  }
  renderSwipeAssist();
}

async function loadLatestReceipt() {
  const newestPaidBooking = state.bookings.find(
    (booking) =>
      String(booking.paymentStatus || '').toLowerCase() === 'paid' &&
      normalizeBookingStatus(booking.statusKey || booking.status) === 'approved'
  );
  if (!newestPaidBooking) {
    state.latestReceipt = null;
    renderReceipt(null);
    return;
  }

  const newestBookingId = newestPaidBooking.id;
  const currentBookingId = state.latestReceipt?.bookingId;
  if (newestBookingId && newestBookingId !== currentBookingId) {
    try {
      await loadReceiptByBooking(newestBookingId, true);
      return;
    } catch {
      if (!state.latestReceipt) {
        renderReceipt(null);
      }
      return;
    }
  }

  renderReceipt(state.latestReceipt);
}

function requestedReceiptBookingId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('receiptBookingId') || '';
}

function heatColor(value, maxValue) {
  const ratio = maxValue ? Math.min(1, value / maxValue) : 0;
  const alpha = 0.14 + ratio * 0.62;
  return `rgba(8, 217, 214, ${alpha.toFixed(3)})`;
}

function renderProviderAnalyticsSuite() {
  const data = state.providerAnalytics;
  if (!data) {
    if (els.providerGrowthKpis) els.providerGrowthKpis.innerHTML = '<p class="muted">Provider analytics unavailable.</p>';
    if (els.providerGrowthActions) els.providerGrowthActions.innerHTML = '';
    if (els.providerHeatmap) els.providerHeatmap.innerHTML = '';
    if (els.providerRegionList) els.providerRegionList.innerHTML = '';
    if (els.providerPricingList) els.providerPricingList.innerHTML = '';
    if (els.providerSkillGapList) els.providerSkillGapList.innerHTML = '';
    return;
  }

  const matrix = data.heatmap?.matrix || [];
  const matrixFlat = matrix.flat();
  const max = Math.max(1, ...matrixFlat);
  const slots = data.heatmap?.slots || [];
  const kpis = data.businessKpis || {};
  const actions = Array.isArray(data.growthActions) ? data.growthActions : [];
  const regional = Array.isArray(data.regionalOpportunities) ? data.regionalOpportunities : [];
  const pricing = Array.isArray(data.pricingRecommendations) ? data.pricingRecommendations : [];
  const skillGaps = Array.isArray(data.skillGaps) ? data.skillGaps : [];

  if (els.providerGrowthKpis) {
    els.providerGrowthKpis.innerHTML = `
      <article class="growth-kpi">
        <small>Demand Pulse</small>
        <strong>${Number(kpis.demandPulse || 0).toFixed(1)}</strong>
        <small>Cross-region market demand intensity.</small>
      </article>
      <article class="growth-kpi">
        <small>Top Growth Zone</small>
        <strong>${sanitize(kpis.topRegion || '-')}</strong>
        <small>Best daypart: ${sanitize(kpis.topDayPart || '-')}</small>
      </article>
      <article class="growth-kpi">
        <small>Projected Upside</small>
        <strong>${money(kpis.projectedMonthlyUpside || 0)}</strong>
        <small>Top category: ${sanitize(kpis.topOpportunityCategory || '-')}</small>
      </article>
    `;
  }

  if (els.providerGrowthActions) {
    els.providerGrowthActions.innerHTML = actions.length
      ? actions
          .slice(0, 2)
          .map(
            (item) => `
      <article class="growth-action-item">
        <div class="growth-action-head">
          <strong>${sanitize(item.title || 'Growth Action')}</strong>
          <span class="growth-action-badge">${sanitize((item.actionType || 'action').toUpperCase())}</span>
        </div>
        <small>${sanitize(item.impact || 'Opportunity detected')}</small>
      </article>
    `
          )
          .join('')
      : '<p class="muted">No growth actions available right now.</p>';
  }

  if (els.providerHeatmap) {
    els.providerHeatmap.innerHTML = [
      `<div class="heatmap-row"><span class="heatmap-label">Region</span>${slots.map((slot) => `<span class="heatmap-label">${slot}</span>`).join('')}</div>`,
      ...(data.heatmap?.regions || []).map((region, rowIdx) => {
        const cells = (matrix[rowIdx] || []).map(
          (value) =>
            `<span class="heatmap-cell" style="background:${heatColor(value, max)}">${Number(value).toFixed(1)}</span>`
        );
        return `<div class="heatmap-row"><span class="heatmap-label">${region}</span>${cells.join('')}</div>`;
      })
    ].join('');
  }

  if (els.providerRegionList) {
    const maxRegionDemand = Math.max(1, ...regional.map((item) => Number(item.totalDemand || 0)));
    els.providerRegionList.innerHTML = regional.length
      ? regional.slice(0, 3).map((item) => {
          const width = clampNum((Number(item.totalDemand || 0) / maxRegionDemand) * 100, 6, 100);
          return `
            <article class="bundle-item region-opportunity-item">
              <strong>${sanitize(item.region)}</strong>
              <small>Peak slot: ${sanitize(item.bestSlot)} | Demand ${Number(item.totalDemand || 0).toFixed(1)}</small>
              <div class="region-opportunity-track"><span style="width:${width}%"></span></div>
            </article>
          `;
        }).join('')
      : '<p class="muted">No regional opportunities yet.</p>';
  }

  if (els.providerPricingList) {
    els.providerPricingList.innerHTML = pricing.length
      ? pricing.slice(0, 3).map((item) => {
          const delta = Number(item.deltaPercent || 0);
          const trendClass = delta >= 0 ? 'up' : 'down';
          const monthlyLift = Number(item.expectedMonthlyRevenueLift || 0);
          return `
            <article class="bundle-item pricing-item ${trendClass}">
              <div class="pricing-head">
                <strong>${sanitize(item.title)}</strong>
                <span class="pricing-delta ${trendClass}">${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%</span>
              </div>
              <small>${money(item.currentPrice)} -> ${money(item.suggestedPrice)} | Confidence ${Number(item.confidence || 0).toFixed(1)}%</small>
              <small>Projected monthly lift: ${monthlyLift >= 0 ? '+' : ''}${money(monthlyLift)} | Volume ${Number(item.monthlyBookings || 0).toFixed(1)}/mo</small>
              <small>${sanitize(item.reason || '')}</small>
            </article>
          `;
        }).join('')
      : '<p class="muted">No pricing recommendations yet.</p>';
  }

  if (els.providerSkillGapList) {
    els.providerSkillGapList.innerHTML = skillGaps.length
      ? skillGaps.slice(0, 3).map((item) => `
          <article class="bundle-item skill-gap-item">
            <strong>${sanitize(item.category)}</strong>
            <small>Opportunity ${Number(item.opportunityScore || 0).toFixed(1)} | Growth ${pct(item.demandGrowthPct)}</small>
            <small>Unmet demand index ${Number(item.unmetDemandIndex || 0).toFixed(1)}</small>
            <small>Priority skills: ${sanitize((item.recommendedSkills || []).slice(0, 3).join(', '))}</small>
          </article>
        `).join('')
      : '<p class="muted">No skill gaps detected.</p>';
  }
}

function renderTrustCalibration() {
  // Intentionally no-op: trust panel simplified for better usability.
}

function trustTier(riskPct) {
  const risk = Number(riskPct || 0);
  if (risk <= 15) return 'Low Risk';
  if (risk <= 28) return 'Medium Risk';
  return 'High Risk';
}

function renderTrustSummary() {
  // Trust UI is merged into Provider Scorecard.
}

function safeDate(value) {
  const parsed = new Date(value || '');
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function weekStartMonday(dateInput) {
  const date = safeDate(dateInput) || new Date();
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay();
  const shift = day === 0 ? 6 : day - 1;
  copy.setDate(copy.getDate() - shift);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function weekKey(dateInput) {
  const monday = weekStartMonday(dateInput);
  return monday.toISOString().slice(0, 10);
}

function weekLabel(dateInput) {
  const monday = weekStartMonday(dateInput);
  return `Week of ${monday.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}`;
}

function circleReferenceDate(circle) {
  return safeDate(circle.targetDate) || safeDate(circle.updatedAt) || safeDate(circle.createdAt) || new Date();
}

function isCircleActiveThisWeek(circle) {
  if (circle.status !== 'active') {
    return false;
  }
  return weekKey(circleReferenceDate(circle)) === weekKey(new Date());
}

function renderActiveCircleCard(circle) {
  const safeTitle = sanitize(decodeEntities(circle.title));
  const safeObjective = sanitize(decodeEntities(circle.objective || 'No objective'));
  const safeProviders = (circle.providers || [])
    .slice(0, 4)
    .map((name) => sanitize(decodeEntities(name)))
    .join(', ');
  const messages = (circle.messages || [])
    .slice(-4)
    .map(
      (msg) =>
        `<small><strong>${sanitize(decodeEntities(msg.senderName))}:</strong> ${sanitize(
          decodeEntities(msg.message)
        )}</small>`
    )
    .join('');
  const packageServiceCount = Array.isArray(circle.services) ? circle.services.length : 0;
  const packageBudget = Number(circle.budgetEstimate || 0);

  return `
    <article class="circle-card" data-circle-id="${circle.id}">
      <strong>${safeTitle}</strong>
      <small>${safeObjective} | Target ${circle.targetDate}</small>
      <small>Providers: ${safeProviders || 'To be assigned'}</small>
      <small>Package: ${packageServiceCount} services${packageBudget > 0 ? ` | Est ${money(packageBudget)}` : ''}</small>
      <div class="bundle-list">${messages || '<small class="muted">No messages yet.</small>'}</div>
      <input class="circle-message-input" type="text" maxlength="320" placeholder="Send coordination update..." />
      <button class="btn" data-action="send-message" data-circle-id="${circle.id}">Send Message</button>
      <button class="btn btn-like" data-action="book-circle-package" data-circle-id="${circle.id}">Book Package + Pay</button>
      <button class="btn btn-ghost" data-action="archive-circle" data-circle-id="${circle.id}">Archive Circle</button>
    </article>
  `;
}

function renderCircles() {
  const ordered = state.circles
    .slice()
    .sort((a, b) => circleReferenceDate(b).getTime() - circleReferenceDate(a).getTime());
  const activeCircles = ordered.filter((circle) => circle.status === 'active');
  const archivedCircles = ordered.filter((circle) => circle.status !== 'active');

  if (!activeCircles.length) {
    els.circleList.innerHTML = '<p class="muted">No active circles right now. Generate a plan to start package orchestration.</p>';
  } else {
    els.circleList.innerHTML = activeCircles.map((circle) => renderActiveCircleCard(circle)).join('');
  }

  if (!els.archivedCircleList) {
    return;
  }
  if (!archivedCircles.length) {
    els.archivedCircleList.innerHTML = '<p class="muted">No archived circles yet.</p>';
    return;
  }
  els.archivedCircleList.innerHTML = archivedCircles
    .slice(0, 24)
    .map((circle) => {
      const isOpen = state.activeArchivedCircleId === circle.id;
      const safeTitle = sanitize(decodeEntities(circle.title || 'Circle'));
      const target = sanitize(circle.targetDate || '-');
      const serviceCount = Array.isArray(circle.services) ? circle.services.length : 0;
      const providers = Array.isArray(circle.providers) ? circle.providers.length : 0;
      const objective = sanitize(decodeEntities(circle.objective || 'No objective'));
      const providerNames = (Array.isArray(circle.providers) ? circle.providers : [])
        .slice(0, 6)
        .map((provider) => sanitize(decodeEntities(provider)))
        .join(', ');
      const serviceNames = (Array.isArray(circle.services) ? circle.services : [])
        .slice(0, 6)
        .map((service) => {
          if (typeof service === 'string') {
            return sanitize(getServiceTitle(service));
          }
          if (service && typeof service === 'object') {
            return sanitize(service.title || getServiceTitle(service.serviceId || service.id));
          }
          return 'Service';
        })
        .join(', ');
      const timelineCount = Array.isArray(circle.timeline) ? circle.timeline.length : 0;
      const updatesCount = Array.isArray(circle.messages) ? circle.messages.length : 0;
      const updatedAt = safeDate(circle.updatedAt || circle.createdAt);
      const updatedLabel = updatedAt
        ? updatedAt.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '-';
      return `
        <article class="bundle-item">
          <strong>${safeTitle}</strong>
          <small>Target ${target}</small>
          <small>${serviceCount} services | ${providers} providers</small>
          <button class="btn btn-ghost" type="button" data-action="toggle-archived-circle" data-circle-id="${circle.id}">
            ${isOpen ? 'Hide Details' : 'View Details'}
          </button>
          ${
            isOpen
              ? `
            <div class="bundle-extra">
              <small><strong>Objective:</strong> ${objective}</small>
              <small><strong>Services:</strong> ${serviceNames || '-'}</small>
              <small><strong>Providers:</strong> ${providerNames || '-'}</small>
              <small><strong>Timeline Steps:</strong> ${timelineCount} | <strong>Updates:</strong> ${updatesCount}</small>
              <small><strong>Last Updated:</strong> ${sanitize(updatedLabel)}</small>
            </div>
          `
              : ''
          }
        </article>
      `;
    })
    .join('');
}

function renderIntentPlan() {
  const plan = state.latestIntentPlan;
  if (!plan) {
    els.intentPlanResult.textContent = 'Plan output will appear here.';
    return;
  }

  els.intentPlanResult.innerHTML = `
    <article class="bundle-item">
      <strong>Budget ${money(plan.budget.lower)} - ${money(plan.budget.upper)}</strong>
      <small>${plan.taskBreakdown.length} tasks | Suggested providers: ${plan.recommendedProviders.map((p) => sanitize(p.provider)).join(', ')}</small>
      ${plan.taskBreakdown
        .map((task) => `<small>${task.order}. ${sanitize(task.title)} | ${money(task.estimatedCost)} | ${task.estimatedMinutes} min</small>`)
        .join('')}
      <div class="offer-actions">
        <button class="btn" id="createCircleFromPlanBtn" type="button">Create Circle</button>
        <button class="btn btn-like" id="bookPlanPackageBtn" type="button">Book Package + Pay</button>
      </div>
    </article>
  `;
}

async function loadProviderAnalyticsSuite() {
  const data = await api(`/api/provider/analytics?window=${state.chartWindow}`);
  state.providerAnalytics = data;
  renderProviderAnalyticsSuite();
}

async function loadTrustScores() {
  const data = await api('/api/providers/trust');
  state.trustScores = data.trust || [];
  state.trustCalibration = data.calibration || null;
  // Trust is merged into Provider Scorecard cards.
  renderProviderRatings();
  renderVisualAnalytics();
}

async function loadCircles() {
  const data = await api('/api/circles?status=all');
  state.circles = data.circles || [];
  if (!state.circles.some((circle) => circle.id === state.activeArchivedCircleId)) {
    state.activeArchivedCircleId = '';
  }
  renderCircles();
}

async function loadAdvancedModules() {
  const results = await Promise.allSettled([loadTrustScores(), loadCircles()]);
  if (results.some((item) => item.status === 'rejected')) {
    showToast('Some advanced modules could not load right now.');
  }
}

async function runIntentPlanner() {
  const intent = els.intentInput.value.trim();
  if (intent.length < 8) {
    showToast('Describe the task with more detail.');
    return;
  }
  const data = await api('/api/planner/intent-plan', {
    method: 'POST',
    body: JSON.stringify({ intent })
  });
  state.latestIntentPlan = data.plan;
  renderIntentPlan();
}

async function loadGoal() {
  if (!els.goalCarbon || !els.goalSpend) {
    return;
  }
  const data = await api('/api/goals');
  state.goal = data.goal;
  els.goalCarbon.value = String(Math.round(state.goal.monthlyCarbonGoal));
  els.goalSpend.value = String(Math.round(state.goal.monthlySpendGoal));
}

async function loadBundleSuggestions() {
  const data = await api('/api/suggestions/bundles');
  state.bundleSuggestions = data.suggestions || [];
  renderBundleSuggestions();
  renderSwipeAssist();
}

async function loadEcofixOffer() {
  try {
    const data = await api('/api/offers/ecofix');
    state.ecofixOffer = data || null;
  } catch {
    state.ecofixOffer = null;
  }
  renderSwipeAssist();
}

async function loadInsights() {
  const data = await api(`/api/insights?window=${state.chartWindow}`);
  const { metrics, charts, matchFunnel, providerRatings, bundleSuggestions, methodology, goal, benchmarks } = data;

  els.metricSwipes.textContent = String(metrics.totalSwipes);
  els.metricBookings.textContent = String(metrics.bookedCount);
  els.metricCarbon.textContent = `${metrics.totalCarbonSaved}kg`;
  els.metricSpend.textContent = `$${metrics.totalSpend}`;
  els.metricRating.textContent = `${metrics.avgRating || 0} | Life ${metrics.lifestyleIndex}`;

  state.metrics = metrics || {};
  state.goal = goal || state.goal;
  state.providerRatings = providerRatings || [];
  state.bundleSuggestions = bundleSuggestions || [];
  state.benchmarks = benchmarks || null;
  state.matchFunnel = matchFunnel || buildFallbackMatchFunnel(metrics, benchmarks);
  state.methodology = methodology || [];

  drawCharts(charts);
  renderMatchFunnel(state.matchFunnel);
  renderBundleSuggestions();
  renderProviderRatings();
  renderVisualAnalytics();
  renderOutcomeBenchmarks();
  renderSwipeAssist();
  if (els.goalProgressText) {
    renderGoalProgress(metrics);
  }
}

function setActiveSectionLink(targetId) {
  sectionNavLinks.forEach((link) => {
    const linkId = (link.getAttribute('href') || '').replace('#', '');
    if (linkId === targetId) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

function activateNavFeature(targetId, options = {}) {
  const settings = {
    updateHash: true,
    scroll: true,
    behavior: 'smooth',
    ...options
  };
  const selectedId = normalizeNavTarget(targetId);
  const insightSection = document.getElementById('insightCharts');
  const providerSection = document.getElementById('providerIntelligence');
  const showInsightCharts = selectedId === 'insightCharts' || INSIGHT_MINI_TARGETS.has(selectedId);
  const showProviderSuite = PROVIDER_MODULE_TARGETS.has(selectedId);

  if (insightSection) {
    insightSection.classList.toggle('nav-hidden', !showInsightCharts);
    insightSection.classList.toggle('focus-charts', selectedId === 'insightCharts');
    insightSection.classList.toggle('focus-mini', INSIGHT_MINI_TARGETS.has(selectedId));
    insightSection.querySelectorAll('.mini-panel').forEach((panel) => {
      panel.classList.remove('nav-active-panel');
    });
    if (INSIGHT_MINI_TARGETS.has(selectedId)) {
      const targetPanel = document.getElementById(selectedId);
      if (targetPanel) {
        targetPanel.classList.add('nav-active-panel');
      }
    }
  }

  if (providerSection) {
    providerSection.classList.toggle('nav-hidden', !showProviderSuite);
    providerSection.classList.toggle('focus-module', showProviderSuite);
    providerSection.querySelectorAll('.advanced-grid > article').forEach((panel) => {
      panel.classList.remove('nav-active-panel');
    });
    if (showProviderSuite) {
      const targetPanel = document.getElementById(selectedId);
      if (targetPanel) {
        targetPanel.classList.add('nav-active-panel');
      }
    }
  }

  setActiveSectionLink(selectedId);

  if (settings.updateHash) {
    const nextHash = `#${selectedId}`;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', `/app${nextHash}`);
    }
  }

  if (settings.scroll) {
    const anchorId = showProviderSuite ? 'providerIntelligence' : 'insightCharts';
    const anchor = document.getElementById(anchorId);
    if (anchor) {
      anchor.scrollIntoView({ behavior: settings.behavior, block: 'start' });
    }
  }

  return selectedId;
}

function wireSectionNavigation() {
  if (!sectionNavLinks.length || !sectionNavTargets.length) {
    return;
  }

  sectionNavLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const targetId = (link.getAttribute('href') || '').replace('#', '');
      activateNavFeature(targetId, {
        updateHash: true,
        scroll: true,
        behavior: 'smooth'
      });
    });
  });

  const initialTarget = normalizeNavTarget(window.location.hash.replace('#', '') || 'insightCharts');
  activateNavFeature(initialTarget, {
    updateHash: Boolean(window.location.hash),
    scroll: false,
    behavior: 'auto'
  });
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
  refreshPreferencePanelUI();
}

async function bootSession() {
  try {
    const data = await api('/api/auth/me');
    state.user = data.user;
    state.csrfToken = data.csrfToken;
    els.welcomeText.textContent = `${state.user.name}, ready to swipe?`;
    if (els.adminLink) {
      els.adminLink.classList.toggle('hidden', !Boolean(state.user?.isAdmin));
    }
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
    refreshPreferencePanelUI();
    clearTimeout(filterRefreshTimer);
    filterRefreshTimer = setTimeout(() => {
      loadServices().catch((err) => showToast(err.message));
    }, 180);
  });

  els.budgetCap.addEventListener('input', () => {
    els.budgetLabel.textContent = `$${els.budgetCap.value}`;
    refreshPreferencePanelUI();
    clearTimeout(filterRefreshTimer);
    filterRefreshTimer = setTimeout(() => {
      loadServices().catch((err) => showToast(err.message));
    }, 180);
  });

  els.urgencyMode.addEventListener('change', () => {
    refreshPreferencePanelUI();
    loadServices().catch((err) => showToast(err.message));
  });

  els.accentTheme.addEventListener('change', () => {
    applyAccent(els.accentTheme.value);
    refreshPreferencePanelUI();
  });

  if (els.bookingService) {
    els.bookingService.addEventListener('change', () => {
      if (!state.pendingBundleBooking) {
        return;
      }
      clearPendingBundleBooking();
      showToast('Bundle mode cleared. Single-service booking selected.');
    });
  }

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

  els.bookingForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const date = els.bookingDate.value;
      if (!date || date < todayISO()) {
        showToast('Select today or a future date.');
        return;
      }
      const address = String(els.bookingAddress?.value || '').trim();
      if (!address || address.length < 6) {
        showToast('Enter a valid service address.');
        return;
      }
      const notes = composeBookingNotes(address, els.bookingNotes.value.trim());
      if (state.pendingBundleBooking) {
        const pending = state.pendingBundleBooking;
        await api('/api/bookings/bundle', {
          method: 'POST',
          body: JSON.stringify({
            primaryServiceId: pending.primaryServiceId,
            addOnServiceId: pending.addOnServiceId,
            scheduledDate: date,
            slot: els.bookingSlot.value,
            notes
          })
        });
        clearPendingBundleBooking();
        showToast(
          `Bundle booking created: ${pending.primaryServiceTitle} + ${pending.addOnServiceTitle}. Receipt unlocks after admin approval + payment.`
        );
      } else {
        const serviceId = els.bookingService.value;
        if (!serviceId) {
          showToast('Select a service first.');
          return;
        }
        const data = await api('/api/bookings', {
          method: 'POST',
          body: JSON.stringify({
            serviceId,
            scheduledDate: date,
            slot: els.bookingSlot.value,
            notes
          })
        });
        if (data.bundleHint?.message) showToast(data.bundleHint.message);
        else showToast(`Booking confirmed for ${getServiceTitle(serviceId)}. Receipt unlocks after admin approval + payment.`);
      }
      if (els.bookingAddress) {
        els.bookingAddress.value = '';
      }
      els.bookingNotes.value = '';
      await Promise.all([loadBookings(), loadReviews(), loadInsights(), loadAdvancedModules()]);
    } catch (err) {
      showToast(err.message);
    }
  });

  els.reviewForm.addEventListener('submit', async (event) => {
    event.preventDefault();
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
      await Promise.all([loadReviews(), loadServices(), loadInsights(), loadTrustScores()]);
    } catch (err) {
      showToast(err.message);
    }
  });

  els.insightMode.addEventListener('change', () => {
    state.insightMode = els.insightMode.value;
    if (state.chartPayload) drawCharts(state.chartPayload);
  });

  els.chartWindow.addEventListener('change', () => {
    state.chartWindow = Number(els.chartWindow.value);
    Promise.all([loadInsights()]).catch((err) =>
      showToast(err.message)
    );
  });

  if (els.providerSort) {
    els.providerSort.value = state.providerSortKey;
    els.providerSort.addEventListener('change', () => {
      state.providerSortKey = els.providerSort.value;
      renderProviderRatings();
    });
  }

  if (els.providerReliabilityMin) {
    els.providerReliabilityMin.value = String(state.providerReliabilityMin);
    if (els.providerReliabilityMinLabel) {
      els.providerReliabilityMinLabel.textContent = String(state.providerReliabilityMin);
    }
    els.providerReliabilityMin.addEventListener('input', () => {
      state.providerReliabilityMin = clampValue(els.providerReliabilityMin.value, 0, 100);
      if (els.providerReliabilityMinLabel) {
        els.providerReliabilityMinLabel.textContent = String(Math.round(state.providerReliabilityMin));
      }
      renderProviderRatings();
    });
  }

  if (els.benchmarkView) {
    els.benchmarkView.value = state.benchmarkView;
    els.benchmarkView.addEventListener('change', () => {
      state.benchmarkView = els.benchmarkView.value;
      renderOutcomeBenchmarks();
    });
  }

  if (els.benchmarkScenario) {
    els.benchmarkScenario.value = state.benchmarkScenario;
    els.benchmarkScenario.addEventListener('change', () => {
      state.benchmarkScenario = els.benchmarkScenario.value;
      renderOutcomeBenchmarks();
    });
  }

  if (els.goalForm && els.goalCarbon && els.goalSpend) {
    els.goalForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const data = await api('/api/goals', {
          method: 'PUT',
          body: JSON.stringify({
            monthlyCarbonGoal: Number(els.goalCarbon.value),
            monthlySpendGoal: Number(els.goalSpend.value)
          })
        });
        state.goal = data.goal;
        showToast('Goals updated.');
        await loadInsights();
      } catch (err) {
        showToast(err.message);
      }
    });
  }

  if (els.circleForm && els.circleTitle && els.circleObjective && els.circleDate) {
    els.circleForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const payload = {
          title: els.circleTitle.value.trim(),
          objective: els.circleObjective.value.trim(),
          targetDate: els.circleDate.value,
          services: [],
          providers: [],
          budgetEstimate: 0
        };
        await api('/api/circles', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        els.circleTitle.value = '';
        els.circleObjective.value = '';
        showToast('Circle created.');
        await loadCircles();
      } catch (err) {
        showToast(err.message);
      }
    });
  }

  els.circleList.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) {
      return;
    }
    const action = button.dataset.action;
    const circleId = button.dataset.circleId;
    try {
      if (action === 'send-message') {
        const card = button.closest('.circle-card');
        const input = card?.querySelector('.circle-message-input');
        const message = input?.value.trim();
        if (!message) {
          showToast('Type a message first.');
          return;
        }
        await api(`/api/circles/${circleId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ message })
        });
      } else if (action === 'archive-circle') {
        await api(`/api/circles/${circleId}/archive`, {
          method: 'POST',
          body: JSON.stringify({})
        });
      } else if (action === 'book-circle-package') {
        const response = await api(`/api/circles/${circleId}/book-package`, {
          method: 'POST',
          body: JSON.stringify({})
        });
        showToast(
          `Package ready: ${response.package?.serviceCount || 0} services | Total ${money(response.package?.totalAmount || 0)}`
        );
        await loadBookings();
        const firstBookingId = response.package?.bookingIds?.[0];
        const packageId = response.package?.packageId || '';
        window.location.href = firstBookingId
          ? `/payment?bookingId=${encodeURIComponent(firstBookingId)}${packageId ? `&packageId=${encodeURIComponent(packageId)}` : ''}`
          : '/payment';
        return;
      }
      await loadCircles();
    } catch (err) {
      showToast(err.message);
    }
  });

  if (els.archivedCircleList) {
    els.archivedCircleList.addEventListener('click', (event) => {
      const toggleBtn = event.target.closest('button[data-action="toggle-archived-circle"]');
      if (!toggleBtn) {
        return;
      }
      const circleId = String(toggleBtn.dataset.circleId || '');
      if (!circleId) {
        return;
      }
      state.activeArchivedCircleId = state.activeArchivedCircleId === circleId ? '' : circleId;
      renderCircles();
    });
  }

  els.intentPlannerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    runIntentPlanner().catch((err) => showToast(err.message));
  });

  els.intentPlanResult.addEventListener('click', async (event) => {
    const btn = event.target.closest('#createCircleFromPlanBtn');
    const packageBtn = event.target.closest('#bookPlanPackageBtn');
    if ((!btn && !packageBtn) || !state.latestIntentPlan) {
      return;
    }
    try {
      const plan = state.latestIntentPlan;
      if (btn) {
        await api('/api/circles', {
          method: 'POST',
          body: JSON.stringify({
            title: plan.suggestedCircle.title,
            objective: plan.intent,
            targetDate: plan.suggestedCircle.targetDate,
            services: plan.suggestedCircle.services,
            providers: plan.suggestedCircle.providers,
            budgetEstimate: plan.budget.baseline
          })
        });
        showToast('Circle created from planner output.');
        await loadCircles();
        return;
      }

      const packageResponse = await api('/api/planner/book-package', {
        method: 'POST',
        body: JSON.stringify({
          title: plan.suggestedCircle.title,
          objective: plan.intent,
          targetDate: plan.suggestedCircle.targetDate,
          slot: state.timeSlots[0] || '9:00-10:00',
          serviceIds: (plan.suggestedCircle.services || []).slice(0, 8)
        })
      });
      showToast(
        `Task package booked: ${packageResponse.package?.serviceCount || 0} services | ${money(
          packageResponse.package?.totalAmount || 0
        )}`
      );
      await loadBookings();
      const firstBookingId = packageResponse.package?.bookingIds?.[0];
      const packageId = packageResponse.package?.packageId || '';
      window.location.href = firstBookingId
        ? `/payment?bookingId=${encodeURIComponent(firstBookingId)}${packageId ? `&packageId=${encodeURIComponent(packageId)}` : ''}`
        : '/payment';
    } catch (err) {
      showToast(err.message);
    }
  });

  els.receiptHistoryList.addEventListener('click', (event) => {
    const openBtn = event.target.closest('[data-receipt-open]');
    if (openBtn) {
      focusImpactReceiptPanel('smooth');
      loadReceiptByBooking(openBtn.dataset.receiptOpen).catch((err) => showToast(err.message));
      return;
    }

    const downloadBtn = event.target.closest('[data-receipt-download]');
    if (downloadBtn) {
      const bookingId = downloadBtn.dataset.receiptDownload;
      const receipt = findReceiptByBookingId(bookingId);
      if (receipt) {
        downloadReceiptBill(receipt);
        return;
      }
      loadReceiptByBooking(bookingId, true)
        .then(() => {
          downloadReceiptBill(state.latestReceipt);
        })
        .catch((err) => showToast(err.message));
    }
  });

  els.impactReceipt.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-receipt-action]');
    if (!trigger) {
      return;
    }
    const action = trigger.dataset.receiptAction;
    const bookingId = trigger.dataset.receiptBooking;
    const receipt = findReceiptByBookingId(bookingId) || state.latestReceipt;
    if (action === 'download') {
      downloadReceiptBill(receipt);
      return;
    }
    if (action === 'print') {
      printReceiptBill(receipt);
    }
  });

  if (els.bundleList) {
    els.bundleList.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-bundle-action]');
      if (!trigger) {
        return;
      }
      const action = trigger.dataset.bundleAction;
      const bundleKey = trigger.dataset.bundleKey;
      if (action === 'toggle') {
        toggleBundleExpanded(bundleKey);
        return;
      }
      if (action === 'apply') {
        applyBundleToBooking(bundleKey);
        return;
      }
      if (action === 'save') {
        toggleSavedBundle(bundleKey);
      }
    });
  }

  if (els.swipeWorkspace) {
    els.swipeWorkspace.addEventListener('click', (event) => {
      const offerTrigger = event.target.closest('[data-offer-action]');
      if (offerTrigger) {
        const action = String(offerTrigger.dataset.offerAction || '');
        if (action === 'redeem-ecofix') {
          api('/api/offers/ecofix/redeem', {
            method: 'POST',
            body: JSON.stringify({})
          })
            .then((data) => {
              showToast(`Coupon redeemed: ${data.coupon?.code || 'EcoFix offer'} (${data.coupon?.discountPct || 0}% off)`);
              return loadEcofixOffer();
            })
            .catch((err) => showToast(err.message));
        }
        return;
      }

      const trigger = event.target.closest('[data-exclusive-action]');
      if (!trigger) {
        return;
      }
      const action = String(trigger.dataset.exclusiveAction || '');
      const bundleKey = String(trigger.dataset.bundleKey || '');
      if (!bundleKey) {
        showToast('No exclusive pair selected.');
        return;
      }
      if (action === 'book-primary') {
        applyExclusiveServiceToBooking(bundleKey, 'primary');
        return;
      }
      if (action === 'book-addon') {
        applyExclusiveServiceToBooking(bundleKey, 'addon');
        return;
      }
      if (action === 'use-pair') {
        applyBundleToBooking(bundleKey);
      }
    });
  }

  window.addEventListener('resize', () => {
    if (state.chartPayload) drawCharts(state.chartPayload);
  });
}

async function init() {
  els.bookingDate.min = todayISO();
  els.bookingDate.value = todayISO();
  renderBookingModeHint();
  if (els.circleDate) {
    els.circleDate.min = todayISO();
    els.circleDate.value = todayISO();
  }
  ensureTooltip();

  await bootSession();
  loadSavedBundles();
  await loadMeta();
  wireEvents();
  wireSectionNavigation();
  wireChartHover();

  await Promise.all([
    loadServices(),
    loadBookings(),
    loadInsights(),
    loadAdvancedModules(),
    loadEcofixOffer()
  ]);
  await loadReviews();
  const bookingIdFromQuery = requestedReceiptBookingId();
  if (bookingIdFromQuery) {
    await loadReceiptByBooking(bookingIdFromQuery, true).catch(() => {});
    focusImpactReceiptPanel('auto');
  }
  renderReceipt(state.latestReceipt);
  renderIntentPlan();
}

init().catch(() => {
  // Redirect handled in bootSession.
});

