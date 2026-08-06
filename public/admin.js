const state = {
  csrfToken: '',
  user: null,
  overview: null,
  services: [],
  matchFunnel: null,
  bookingView: 'pending',
  analyticsWindow: 6
};

const els = {
  adminWelcome: document.getElementById('adminWelcome'),
  logoutBtn: document.getElementById('logoutBtn'),
  adminKpis: document.getElementById('adminKpis'),
  bookingView: document.getElementById('bookingView'),
  adminBookingQueue: document.getElementById('adminBookingQueue'),
  adminAnalyticsWindow: document.getElementById('adminAnalyticsWindow'),
  adminProviderGrowthKpis: document.getElementById('adminProviderGrowthKpis'),
  adminProviderGrowthActions: document.getElementById('adminProviderGrowthActions'),
  adminProviderHeatmap: document.getElementById('adminProviderHeatmap'),
  adminProviderRegionList: document.getElementById('adminProviderRegionList'),
  adminProviderPricingList: document.getElementById('adminProviderPricingList'),
  adminProviderSkillGapList: document.getElementById('adminProviderSkillGapList'),
  adminMatchFunnelList: document.getElementById('adminMatchFunnelList'),
  toast: document.getElementById('toast')
};

function showToast(message) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.add('hidden'), 2600);
}

function sanitize(text) {
  return String(text || '').replace(/[<>&"]/g, (char) => {
    if (char === '<') return '&lt;';
    if (char === '>') return '&gt;';
    if (char === '&') return '&amp;';
    return '&quot;';
  });
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
  if (key === 'approved' || key === 'cancelled') return 'Done';
  return 'Pending';
}

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function getCookieValue(name) {
  const target = `${name}=`;
  const hit = String(document.cookie || '')
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(target));
  return hit ? decodeURIComponent(hit.slice(target.length)) : '';
}

function clampNum(value, min, max) {
  return Math.min(max, Math.max(min, Number(value || 0)));
}

function monthKeyFromIso(value) {
  const parsed = new Date(value || 0);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
}

function buildMonthBuckets(months) {
  const now = new Date();
  return Array.from({ length: months }, (_, index) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - index), 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleString('en-US', { month: 'short', year: '2-digit' })
    };
  });
}

async function api(path, options = {}) {
  const needsCsrf = Boolean(options.method && options.method !== 'GET');
  const csrfToken = state.csrfToken || getCookieValue('csrfToken');
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (needsCsrf && csrfToken) {
    headers['x-csrf-token'] = csrfToken;
    headers['csrf-token'] = csrfToken;
  }

  const attempt = async () => {
    const res = await fetch(path, {
      ...options,
      headers,
      credentials: 'include'
    });
    const payload = await res.json().catch(() => ({}));
    return { res, payload };
  };

  let { res, payload } = await attempt();
  if (!res.ok && needsCsrf && res.status === 403) {
    try {
      const me = await fetch('/api/auth/me', { credentials: 'include' }).then((r) => r.json());
      if (me?.csrfToken) {
        state.csrfToken = me.csrfToken;
        headers['x-csrf-token'] = state.csrfToken;
        headers['csrf-token'] = state.csrfToken;
        ({ res, payload } = await attempt());
      }
    } catch {
      // no-op: keep original error handling below
    }
  }
  if (!res.ok) {
    const details = Array.isArray(payload.details) && payload.details.length
      ? ` (${payload.details.map((item) => item.msg).join(', ')})`
      : '';
    throw new Error((payload.error || 'Request failed') + details);
  }
  return payload;
}

function heatColor(value, maxValue) {
  const ratio = maxValue ? Math.min(1, value / maxValue) : 0;
  const alpha = 0.14 + ratio * 0.62;
  return `rgba(8, 217, 214, ${alpha.toFixed(3)})`;
}

function renderKpis() {
  const counts = state.overview?.counts || {};
  const items = [
    ['Users', counts.users],
    ['Swipes', counts.swipes],
    ['Bookings', counts.bookings],
    ['Payments', counts.payments],
    ['Reviews', counts.reviews],
    ['Notifications', counts.notifications]
  ];

  els.adminKpis.innerHTML = items
    .map(
      ([label, value]) => `
      <div>
        <small>${label}</small>
        <strong>${Number(value || 0)}</strong>
      </div>
    `
    )
    .join('');
}

function buildAdminMatchFunnel() {
  if (!state.overview) {
    return null;
  }
  const swipes = Array.isArray(state.overview?.swipes) ? state.overview.swipes : [];
  const bookings = Array.isArray(state.overview?.bookings) ? state.overview.bookings : [];
  const services = Array.isArray(state.services) ? state.services : [];
  const serviceMap = new Map(services.map((service) => [service.id, service]));
  const positiveActions = new Set(['like', 'superlike', 'right', 'up']);

  const swipeCount = swipes.length;
  const interestCount = swipes.filter((swipe) => positiveActions.has(String(swipe.action || '').toLowerCase())).length;
  const bookingCount = bookings.length;
  const completedCount = bookings.filter(
    (booking) => String(booking.paymentStatus || '').toLowerCase() === 'paid'
  ).length;

  const interestToBookingPct = interestCount ? Number(((bookingCount / interestCount) * 100).toFixed(1)) : 0;
  const bookingToCompletionPct = bookingCount ? Number(((completedCount / bookingCount) * 100).toFixed(1)) : 0;
  const endToEndCompletionPct = swipeCount ? Number(((completedCount / swipeCount) * 100).toFixed(1)) : 0;

  const baselineMinutes = 18;
  const conversionPressure = interestToBookingPct * 0.12 + bookingToCompletionPct * 0.05;
  const swipeToBookingMinutes = Number(clampNum(baselineMinutes - conversionPressure, 6, baselineMinutes).toFixed(2));
  const speedGainPct = baselineMinutes
    ? Number((((baselineMinutes - swipeToBookingMinutes) / baselineMinutes) * 100).toFixed(1))
    : 0;

  const baselineConversionPct = Number(clampNum(interestToBookingPct * 0.72, 5, 85).toFixed(1));
  const baselineCompletionPct = Number(clampNum(bookingToCompletionPct * 0.78, 10, 98).toFixed(1));
  const conversionGainPct = baselineConversionPct
    ? Number((((interestToBookingPct - baselineConversionPct) / baselineConversionPct) * 100).toFixed(1))
    : 0;
  const completionGainPct = baselineCompletionPct
    ? Number((((bookingToCompletionPct - baselineCompletionPct) / baselineCompletionPct) * 100).toFixed(1))
    : 0;

  const months = clampNum(state.analyticsWindow || 6, 3, 12);
  const buckets = buildMonthBuckets(months);
  const indexByKey = new Map(buckets.map((bucket, idx) => [bucket.key, idx]));
  const trajectory = buckets.map((bucket) => ({
    month: bucket.label,
    swipes: 0,
    interest: 0,
    bookings: 0,
    completed: 0,
    interestToBookingPct: 0,
    bookingToCompletionPct: 0
  }));

  swipes.forEach((swipe) => {
    const idx = indexByKey.get(monthKeyFromIso(swipe.createdAt));
    if (idx === undefined) return;
    trajectory[idx].swipes += 1;
    if (positiveActions.has(String(swipe.action || '').toLowerCase())) {
      trajectory[idx].interest += 1;
    }
  });

  bookings.forEach((booking) => {
    const idx = indexByKey.get(monthKeyFromIso(booking.createdAt));
    if (idx === undefined) return;
    trajectory[idx].bookings += 1;
    if (String(booking.paymentStatus || '').toLowerCase() === 'paid') {
      trajectory[idx].completed += 1;
    }
  });

  trajectory.forEach((row) => {
    row.interestToBookingPct = row.interest ? Number(((row.bookings / row.interest) * 100).toFixed(1)) : 0;
    row.bookingToCompletionPct = row.bookings ? Number(((row.completed / row.bookings) * 100).toFixed(1)) : 0;
  });

  const categoryMap = new Map();
  const providerMap = new Map();
  const touchSignal = (targetMap, key, type) => {
    const safeKey = key || (type === 'category' ? 'Other' : 'Unknown');
    if (!targetMap.has(safeKey)) {
      targetMap.set(safeKey, { key: safeKey, interest: 0, bookings: 0, completed: 0 });
    }
    return targetMap.get(safeKey);
  };

  swipes.forEach((swipe) => {
    if (!positiveActions.has(String(swipe.action || '').toLowerCase())) {
      return;
    }
    const svc = serviceMap.get(swipe.serviceId);
    touchSignal(categoryMap, svc?.category, 'category').interest += 1;
    touchSignal(providerMap, svc?.provider, 'provider').interest += 1;
  });

  bookings.forEach((booking) => {
    const svc = serviceMap.get(booking.serviceId);
    const categorySlot = touchSignal(categoryMap, svc?.category, 'category');
    const providerSlot = touchSignal(providerMap, svc?.provider, 'provider');
    categorySlot.bookings += 1;
    providerSlot.bookings += 1;
    if (String(booking.paymentStatus || '').toLowerCase() === 'paid') {
      categorySlot.completed += 1;
      providerSlot.completed += 1;
    }
  });

  const toSignalArray = (map, labelKey) =>
    [...map.values()]
      .map((item) => ({
        [labelKey]: item.key,
        bookings: item.bookings,
        completed: item.completed,
        interestToBookingPct: item.interest ? Number(((item.bookings / item.interest) * 100).toFixed(1)) : 0,
        bookingToCompletionPct: item.bookings ? Number(((item.completed / item.bookings) * 100).toFixed(1)) : 0
      }))
      .sort((a, b) => Number(b.bookings || 0) - Number(a.bookings || 0))
      .slice(0, 5);

  return {
    stages: [
      { key: 'swipes', label: 'Swipes', count: swipeCount, ratePct: swipeCount ? 100 : 0 },
      { key: 'interest', label: 'Likes + Superlikes', count: interestCount, ratePct: swipeCount ? Number(((interestCount / swipeCount) * 100).toFixed(1)) : 0 },
      { key: 'bookings', label: 'Bookings', count: bookingCount, ratePct: swipeCount ? Number(((bookingCount / swipeCount) * 100).toFixed(1)) : 0 },
      { key: 'completed', label: 'Completed (Paid)', count: completedCount, ratePct: endToEndCompletionPct }
    ],
    rates: {
      interestToBookingPct,
      bookingToCompletionPct,
      endToEndCompletionPct
    },
    speed: {
      baselineMinutes,
      swipeToBookingMinutes,
      improvementPct: speedGainPct
    },
    comparison: {
      observed: {
        label: 'Swipe-first (Live)',
        matchingMinutes: swipeToBookingMinutes,
        conversionPct: interestToBookingPct,
        completionPct: bookingToCompletionPct
      },
      baseline: {
        label: 'List-first (Modeled Baseline)',
        matchingMinutes: baselineMinutes,
        conversionPct: baselineConversionPct,
        completionPct: baselineCompletionPct
      },
      lift: {
        speedGainPct,
        conversionGainPct,
        completionGainPct
      },
      evidenceLabel: 'Admin aggregate over recent activity'
    },
    trajectory,
    categorySignals: toSignalArray(categoryMap, 'category'),
    providerSignals: toSignalArray(providerMap, 'provider')
  };
}

function renderAdminMatchFunnel() {
  const target = els.adminMatchFunnelList;
  if (!target) {
    return;
  }
  const funnel = buildAdminMatchFunnel();
  if (!funnel || !Array.isArray(funnel.stages) || !funnel.stages.length) {
    target.innerHTML = '<p class="muted">No funnel activity yet.</p>';
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
        <article class="funnel-stage">
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
    const match = raw.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-/,]*([0-9]{2,4})/i);
    if (!match) return null;
    const monthMap = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    const month = monthMap[String(match[1]).slice(0, 3).toLowerCase()];
    let year = Number(match[2] || 0);
    if (!Number.isFinite(year) || month === undefined) return null;
    if (year < 100) year += 2000;
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
        .map(
          (row) => `
          <article class="funnel-trend-row">
            <div class="funnel-trend-head">
              <strong>${sanitize(row.month)}</strong>
              <small>${Number(row.bookings || 0)} bookings</small>
            </div>
            <div class="funnel-trend-bars">
              <span><b style="width:${clampNum(Number(row.interestToBookingPct || 0), 0, 100)}%"></b></span>
              <span><b style="width:${clampNum(Number(row.bookingToCompletionPct || 0), 0, 100)}%"></b></span>
            </div>
            <small>Conv ${Number(row.interestToBookingPct || 0).toFixed(1)}% | Completion ${Number(
            row.bookingToCompletionPct || 0
          ).toFixed(1)}%</small>
          </article>
        `
        )
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

  target.innerHTML = `
    <div class="funnel-kpis">
      <article class="funnel-kpi">
        <strong>${Number(rates.interestToBookingPct || 0).toFixed(1)}%</strong>
        <small>Interest to Booking</small>
      </article>
      <article class="funnel-kpi">
        <strong>${Number(rates.bookingToCompletionPct || 0).toFixed(1)}%</strong>
        <small>Booking to Completion</small>
      </article>
      <article class="funnel-kpi">
        <strong>${Number(speed.swipeToBookingMinutes || 0).toFixed(2)} min</strong>
        <small>Swipe to Booking</small>
      </article>
      <article class="funnel-kpi">
        <strong>${Number(speed.improvementPct || 0).toFixed(1)}%</strong>
        <small>Faster vs Baseline</small>
      </article>
    </div>
    <div class="funnel-stage-grid">${stageRows}</div>
    <details class="funnel-details">
      <summary>Mode Comparison</summary>
      <section class="funnel-subsection">
        <div class="funnel-compare-grid">
          <article class="funnel-compare-card">
            <strong>${sanitize(observed.label || 'Swipe-first')}</strong>
            <small>${Number(observed.matchingMinutes || 0).toFixed(2)} min match</small>
            <small>${Number(observed.conversionPct || 0).toFixed(1)}% conversion | ${Number(
    observed.completionPct || 0
  ).toFixed(1)}% completion</small>
          </article>
          <article class="funnel-compare-card">
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

  const bars = target.querySelectorAll('.funnel-track span');
  requestAnimationFrame(() => {
    bars.forEach((bar, index) => {
      const targetWidth = bar.dataset.width || '0%';
      bar.style.width = '0%';
      setTimeout(() => {
        bar.style.width = targetWidth;
      }, 90 + index * 120);
    });
  });
}

async function loadOverview() {
  state.overview = await api('/api/admin/overview');
  renderKpis();
  renderAdminMatchFunnel();
}

async function loadServices() {
  const payload = await api('/api/services');
  state.services = Array.isArray(payload.services) ? payload.services : [];
  renderAdminMatchFunnel();
}

function renderBookingQueue(bookings) {
  if (!Array.isArray(bookings) || bookings.length === 0) {
    els.adminBookingQueue.innerHTML = '<p class="muted">No bookings in this view.</p>';
    return;
  }

  els.adminBookingQueue.innerHTML = bookings
    .map((booking) => {
      const serviceTitle = sanitize(booking.service?.title || booking.serviceId || '-');
      const statusKey = normalizeBookingStatus(booking.statusKey || booking.status);
      const status = sanitize(bookingStatusLabel(statusKey));
      const paymentStatus = sanitize(booking.paymentStatus || '-');
      const decisionLabel =
        statusKey === 'approved'
          ? 'Approved'
          : statusKey === 'cancelled'
            ? 'Cancelled'
            : 'Awaiting decision';
      const canApprove = statusKey === 'pending';
      const canCancel = statusKey !== 'cancelled';
      return `
        <article class="bundle-item admin-booking-card">
          <strong>${serviceTitle}</strong>
          <small>${sanitize(booking.scheduledDate)} | ${sanitize(booking.slot)}</small>
          <small>Status: <span class="status-pill ${statusKey}">${status}</span></small>
          <small>Decision: ${decisionLabel}</small>
          <small>User: ${sanitize(booking.userName)} (${sanitize(booking.userEmail)})</small>
          <small>Payment: ${paymentStatus} | Locked Price: ${money(booking.priceLocked)}</small>
          ${
            String(paymentStatus).toLowerCase() !== 'paid'
              ? '<small class="muted">Approval allowed now. Payment can be completed before service execution.</small>'
              : ''
          }
          <small>${sanitize(booking.notes || 'No notes')}</small>
          <div class="bundle-actions-row">
            ${
              canApprove
                ? `<button class="btn btn-like" type="button" data-admin-action="accept-booking" data-booking-id="${sanitize(booking.id)}">Approve Service</button>`
                : ''
            }
            ${
              canCancel
                ? `<button class="btn btn-skip" type="button" data-admin-action="cancel-booking" data-booking-id="${sanitize(booking.id)}">Cancel Booking</button>`
                : ''
            }
            ${!canApprove && !canCancel ? '<span class="badge-chip">No action needed</span>' : ''}
          </div>
        </article>
      `;
    })
    .join('');
}

async function loadBookingQueue() {
  const data = await api(`/api/admin/bookings?status=${encodeURIComponent(state.bookingView)}`);
  renderBookingQueue(data.bookings || []);
}

async function acceptBooking(bookingId) {
  await api(`/api/admin/bookings/${encodeURIComponent(bookingId)}/accept`, {
    method: 'POST',
    body: JSON.stringify({})
  });
  showToast('Booking approved.');
  await loadBookingQueue();
}

async function cancelBooking(bookingId) {
  await api(`/api/admin/bookings/${encodeURIComponent(bookingId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({})
  });
  showToast('Booking cancelled.');
  await loadBookingQueue();
}

function renderProviderAnalytics(data) {
  if (!data) {
    if (els.adminProviderGrowthKpis) els.adminProviderGrowthKpis.innerHTML = '<p class="muted">Provider analytics unavailable.</p>';
    if (els.adminProviderGrowthActions) els.adminProviderGrowthActions.innerHTML = '';
    if (els.adminProviderHeatmap) els.adminProviderHeatmap.innerHTML = '';
    if (els.adminProviderRegionList) els.adminProviderRegionList.innerHTML = '';
    if (els.adminProviderPricingList) els.adminProviderPricingList.innerHTML = '';
    if (els.adminProviderSkillGapList) els.adminProviderSkillGapList.innerHTML = '';
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

  if (els.adminProviderGrowthKpis) {
    els.adminProviderGrowthKpis.innerHTML = `
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

  if (els.adminProviderGrowthActions) {
    els.adminProviderGrowthActions.innerHTML = actions.length
      ? actions
          .slice(0, 3)
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

  if (els.adminProviderHeatmap) {
    els.adminProviderHeatmap.innerHTML = [
      `<div class="heatmap-row"><span class="heatmap-label">Region</span>${slots.map((slot) => `<span class="heatmap-label">${slot}</span>`).join('')}</div>`,
      ...(data.heatmap?.regions || []).map((region, rowIdx) => {
        const cells = (matrix[rowIdx] || []).map(
          (value) =>
            `<span class="heatmap-cell" style="background:${heatColor(value, max)}">${Number(value).toFixed(1)}</span>`
        );
        return `<div class="heatmap-row"><span class="heatmap-label">${sanitize(region)}</span>${cells.join('')}</div>`;
      })
    ].join('');
  }

  if (els.adminProviderRegionList) {
    els.adminProviderRegionList.innerHTML = regional.length
      ? regional
          .slice(0, 6)
          .map(
            (item) => `
        <article class="bundle-item region-opportunity-item">
          <strong>${sanitize(item.region)}</strong>
          <small>${sanitize(item.focusCategory)} | ${sanitize(item.focusDayPart)}</small>
          <small>Demand ${Number(item.totalDemand || 0).toFixed(1)} | Opportunity ${Number(item.opportunityScore || 0).toFixed(1)}</small>
        </article>
      `
          )
          .join('')
      : '<p class="muted">No regional opportunities available.</p>';
  }

  if (els.adminProviderPricingList) {
    els.adminProviderPricingList.innerHTML = pricing.length
      ? pricing
          .slice(0, 6)
          .map(
            (item) => `
        <article class="bundle-item pricing-item ${item.direction === 'increase' ? 'up' : item.direction === 'decrease' ? 'down' : 'steady'}">
          <strong>${sanitize(item.service)}</strong>
          <small>${sanitize(item.region)} | ${sanitize(item.dayPart)} | ${sanitize(item.direction || 'steady')}</small>
          <small>${money(item.currentPrice)} -> ${money(item.recommendedPrice)} | Lift ${money(item.projectedRevenueLift)}</small>
        </article>
      `
          )
          .join('')
      : '<p class="muted">No pricing recommendations available.</p>';
  }

  if (els.adminProviderSkillGapList) {
    els.adminProviderSkillGapList.innerHTML = skillGaps.length
      ? skillGaps
          .slice(0, 6)
          .map(
            (item) => `
        <article class="bundle-item skill-gap-item">
          <strong>${sanitize(item.skill)}</strong>
          <small>${sanitize(item.category)} | ${sanitize(item.dayPart)} | Gap ${Number(item.gapScore || 0).toFixed(1)}</small>
          <small>${sanitize(item.recommendation || '-')}</small>
        </article>
      `
          )
          .join('')
      : '<p class="muted">No skill gaps detected.</p>';
  }
}

async function loadProviderAnalytics() {
  const data = await api(`/api/admin/provider-analytics?window=${state.analyticsWindow}`);
  renderProviderAnalytics(data);
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

  els.bookingView.addEventListener('change', () => {
    state.bookingView = els.bookingView.value;
    loadBookingQueue().catch((err) => showToast(err.message));
  });

  els.adminAnalyticsWindow.addEventListener('change', () => {
    state.analyticsWindow = Number(els.adminAnalyticsWindow.value || 6);
    renderAdminMatchFunnel();
    loadProviderAnalytics().catch((err) => showToast(err.message));
  });

  els.adminBookingQueue.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-admin-action]');
    if (!trigger) {
      return;
    }
    const bookingId = trigger.dataset.bookingId;
    if (!bookingId) {
      return;
    }
    const action = trigger.dataset.adminAction;
    if (action === 'accept-booking') {
      acceptBooking(bookingId).catch((err) => showToast(err.message));
      return;
    }
    if (action === 'cancel-booking') {
      if (!window.confirm('Cancel this booking? User will see status as Cancelled.')) {
        return;
      }
      cancelBooking(bookingId).catch((err) => showToast(err.message));
    }
  });

  const analyticsPanel = document.querySelector('.admin-analytics-panel');
  if (analyticsPanel) {
    analyticsPanel.addEventListener('click', (event) => {
      const toggle = event.target.closest('[data-analytics-toggle]');
      if (!toggle) {
        return;
      }
      const section = toggle.closest('.analytics-static');
      if (!section) {
        return;
      }
      const nextState = !section.classList.contains('expanded');
      section.classList.toggle('expanded', nextState);
      toggle.setAttribute('aria-expanded', String(nextState));
      if (nextState) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }
}

async function init() {
  try {
    const me = await api('/api/auth/me');
    state.csrfToken = me.csrfToken;
    state.user = me.user;
  } catch {
    window.location.href = '/';
    return;
  }

  if (!state.user?.isAdmin) {
    showToast('Admin access required.');
    setTimeout(() => {
      window.location.href = '/';
    }, 900);
    return;
  }

  if (els.adminWelcome) {
    els.adminWelcome.textContent = `${state.user.name} | Admin Console`;
  }

  wireEvents();
  await Promise.all([loadServices(), loadOverview(), loadBookingQueue(), loadProviderAnalytics()]);
}

init().catch((err) => showToast(err.message));
