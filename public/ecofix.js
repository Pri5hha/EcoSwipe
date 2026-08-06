const { useEffect, useMemo, useRef, useState } = React;

const TOKEN_LIMIT = 3;
const BUDGET_LIMIT = 500;
const ANALYSIS_SECONDS = 60;
const FAST_SECONDS = 30;
const LOCAL_KEY = 'ecofix_local_db_v2';
const TZ = 'Asia/Kolkata';
const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday'
};

const DATA = window.ECOFIX_DATA || {
  scenarios: {},
  providers: [],
  providerTagMap: {},
  scenarioTagMap: {},
  newUser: (id, name) => ({ user_id: id, name, neighbourhood_id: 'Chennai', current_streak: 0 }),
  seedUsers: () => ({})
};

function istNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
}

function dateKey(d = istNow()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseKey(key) {
  const [y, m, d] = String(key || '').split('-').map(Number);
  return y && m && d ? new Date(Date.UTC(y, m - 1, d)) : null;
}

function prevKey(key, days = 1) {
  const d = parseKey(key) || parseKey(dateKey());
  d.setUTCDate(d.getUTCDate() - days);
  return dateKey(new Date(d.getTime()));
}

function diffDays(from, to) {
  const a = parseKey(from);
  const b = parseKey(to);
  return a && b ? Math.round((b - a) / 86400000) : 0;
}

function weekKey(key) {
  const d = parseKey(key);
  if (!d) {
    return '0-W0';
  }
  const c = new Date(d.getTime());
  const wd = c.getUTCDay() || 7;
  c.setUTCDate(c.getUTCDate() + 4 - wd);
  const ys = new Date(Date.UTC(c.getUTCFullYear(), 0, 1));
  const wn = Math.ceil((((c - ys) / 86400000) + 1) / 7);
  return `${c.getUTCFullYear()}-W${String(wn).padStart(2, '0')}`;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, Number(v || 0)));
}

function money(v) {
  return `Rs ${Number(v || 0).toFixed(0)}`;
}

function scoreN(v) {
  return Number(Number(v || 0).toFixed(2));
}

function todayDayKey() {
  const d = istNow();
  const js = d.getDay();
  return DAY_KEYS[js === 0 ? 6 : js - 1];
}

function cx(...tokens) {
  return tokens.filter(Boolean).join(' ');
}

function readCookie(name) {
  const safeName = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|; )${safeName}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

function localDbLoad() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) {
      return { puzzles: {}, users: {}, daily_scores: {} };
    }
    const parsed = JSON.parse(raw);
    return {
      puzzles: parsed.puzzles || {},
      users: parsed.users || {},
      daily_scores: parsed.daily_scores || {}
    };
  } catch {
    return { puzzles: {}, users: {}, daily_scores: {} };
  }
}

class EcoFixStore {
  constructor() {
    this.mode = 'local';
    this.local = localDbLoad();
    this.firebaseDb = null;
    this.providers = [...DATA.providers];
    this.config = null;
  }

  saveLocal() {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(this.local));
  }

  async init() {
    try {
      const r = await fetch('/api/ecofix/config', { credentials: 'include' });
      this.config = r.ok ? await r.json() : null;
    } catch {
      this.config = null;
    }

    if (this.config?.configured && window.firebase) {
      try {
        if (!firebase.apps.length) {
          firebase.initializeApp(this.config.firebase);
        }
        this.firebaseDb = firebase.database();
        this.mode = 'firebase';
      } catch {
        this.mode = 'local';
        this.firebaseDb = null;
      }
    }

    await this.seed();
    await this.pullProviders();
    return this.mode;
  }

  async pullProviders() {
    try {
      const r = await fetch('/api/ecofix/providers', { credentials: 'include' });
      if (!r.ok) {
        return;
      }
      const payload = await r.json();
      const remote = payload.providers || [];
      const map = new Map(this.providers.map((p) => [p.provider, { ...p }]));

      remote.forEach((provider) => {
        const existing = map.get(provider.provider) || {
          id: `p_${Math.random().toString(36).slice(2, 8)}`,
          provider: provider.provider,
          area: provider.area || 'Chennai',
          ecoScore: 80,
          tags: []
        };
        const tags = (provider.categories || []).flatMap((cat) => DATA.providerTagMap[cat] || []);
        map.set(provider.provider, {
          ...existing,
          area: provider.area || existing.area,
          ecoScore: Number(provider.ecoScore || existing.ecoScore),
          tags: [...new Set([...(existing.tags || []), ...tags])]
        });
      });

      this.providers = [...map.values()];
    } catch {
      // keep local providers
    }
  }

  async seed() {
    const today = dateKey();
    const puzzles = DATA.scenarios;
    const users = DATA.seedUsers(today);

    if (this.mode === 'firebase' && this.firebaseDb) {
      const pRef = this.firebaseDb.ref('puzzles');
      const pSnap = await pRef.once('value');
      if (!pSnap.exists()) {
        await pRef.set(puzzles);
      }
      const uRef = this.firebaseDb.ref('users');
      const uSnap = await uRef.once('value');
      if (!uSnap.exists()) {
        await uRef.set(users);
      }
      return;
    }

    if (!Object.keys(this.local.puzzles).length) {
      this.local.puzzles = puzzles;
    }
    if (!Object.keys(this.local.users).length) {
      this.local.users = users;
    }
    this.saveLocal();
  }

  async authUser() {
    try {
      const r = await fetch('/api/auth/me', { credentials: 'include' });
      if (!r.ok) {
        return null;
      }
      const payload = await r.json();
      return payload.user || null;
    } catch {
      return null;
    }
  }

  async offerStatus() {
    try {
      const r = await fetch('/api/offers/ecofix', { credentials: 'include' });
      if (!r.ok) {
        return null;
      }
      return await r.json();
    } catch {
      return null;
    }
  }

  async redeemOffer() {
    const csrfToken = readCookie('csrfToken');
    if (!csrfToken) {
      return { ok: false, error: 'Session token missing. Re-login and retry.' };
    }
    try {
      const r = await fetch('/api/offers/ecofix/redeem', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken
        },
        body: JSON.stringify({})
      });
      const payload = await r.json().catch(() => ({}));
      if (!r.ok) {
        return { ok: false, error: payload.error || 'Could not redeem coupon.' };
      }
      return { ok: true, payload };
    } catch {
      return { ok: false, error: 'Could not connect to coupon service.' };
    }
  }

  async reportSession(payload) {
    const csrfToken = readCookie('csrfToken');
    if (!csrfToken) {
      return null;
    }
    try {
      const r = await fetch('/api/ecofix/session', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken
        },
        body: JSON.stringify(payload)
      });
      if (!r.ok) {
        return null;
      }
      return await r.json();
    } catch {
      return null;
    }
  }

  async listUsers() {
    if (this.mode === 'firebase' && this.firebaseDb) {
      const snap = await this.firebaseDb.ref('users').once('value');
      const values = snap.val() || {};
      return Object.keys(values).map((id) => ({ id, name: values[id].name || id }));
    }
    return Object.keys(this.local.users).map((id) => ({ id, name: this.local.users[id].name || id }));
  }

  async puzzle(day) {
    if (this.mode === 'firebase' && this.firebaseDb) {
      const snap = await this.firebaseDb.ref(`puzzles/${day}`).once('value');
      return snap.val();
    }
    return this.local.puzzles[day];
  }

  async user(id, fallbackName = 'EcoFix Player') {
    if (this.mode === 'firebase' && this.firebaseDb) {
      const ref = this.firebaseDb.ref(`users/${id}`);
      const snap = await ref.once('value');
      if (snap.exists()) {
        return { user_id: id, ...snap.val() };
      }
      const newUser = DATA.newUser(id, fallbackName);
      await ref.set(newUser);
      return newUser;
    }

    if (!this.local.users[id]) {
      this.local.users[id] = DATA.newUser(id, fallbackName);
      this.saveLocal();
    }
    return this.local.users[id];
  }

  async saveUser(id, userData) {
    if (this.mode === 'firebase' && this.firebaseDb) {
      await this.firebaseDb.ref(`users/${id}`).set(userData);
      return;
    }
    this.local.users[id] = { ...userData };
    this.saveLocal();
  }

  async dailyScore(day, userId) {
    if (this.mode === 'firebase' && this.firebaseDb) {
      const snap = await this.firebaseDb.ref(`daily_scores/${day}/${userId}`).once('value');
      return snap.val();
    }
    return this.local.daily_scores?.[day]?.[userId] || null;
  }

  async saveDaily(day, userId, payload) {
    if (this.mode === 'firebase' && this.firebaseDb) {
      await this.firebaseDb.ref(`daily_scores/${day}/${userId}`).set(payload);
      return;
    }
    if (!this.local.daily_scores[day]) {
      this.local.daily_scores[day] = {};
    }
    this.local.daily_scores[day][userId] = payload;
    this.saveLocal();
  }
}

function evalSelection(puzzle, fixes, streak, selectionSec) {
  const byId = new Map(fixes.map((f) => [f.id, f]));
  const impactMap = new Map(
    fixes.map((f) => [f.id, Number(f.impact || 0) * (1 - Number(f.hidden_penalty_factor || 0))])
  );

  fixes.forEach((fix) => {
    if (fix.unlock_multiplier && byId.has(fix.unlock_multiplier)) {
      impactMap.set(fix.unlock_multiplier, (impactMap.get(fix.unlock_multiplier) || 0) * 1.25);
    }
  });

  const spent = fixes.reduce((sum, fix) => sum + Number(fix.cost || 0), 0);
  const totalImpact = [...impactMap.values()].reduce((sum, val) => sum + val, 0);

  const base = spent > 0 ? (totalImpact / spent) * 100 : totalImpact * 10;
  const root = fixes.some((f) => f.is_root_cause) ? base * 0.2 : 0;
  const speed = selectionSec <= FAST_SECONDS ? base * 0.1 : 0;
  const streakBonus = base * (Math.max(0, streak) * 0.05);

  const resourceSummary = fixes.reduce(
    (acc, fix) => {
      const key = fix.resource_type || 'carbon';
      acc[key] = scoreN((acc[key] || 0) + (impactMap.get(fix.id) || 0));
      return acc;
    },
    { water: 0, carbon: 0, waste: 0 }
  );

  const carbonEquivalent = scoreN(resourceSummary.carbon + resourceSummary.water * 0.045 + resourceSummary.waste * 0.65);
  const [primaryResource, primaryValue] =
    Object.entries(resourceSummary).sort((a, b) => b[1] - a[1])[0] || ['carbon', 0];

  return {
    selectedFixIds: fixes.map((f) => f.id),
    totalSpent: scoreN(spent),
    totalImpact: scoreN(totalImpact),
    baseScore: Math.round(base),
    rootBonus: Math.round(root),
    speedBonus: Math.round(speed),
    streakBonus: Math.round(streakBonus),
    streakDays: streak,
    finalScore: Math.round(base + root + speed + streakBonus),
    resourceSummary,
    carbonEquivalent,
    primaryResource,
    primaryValue: Math.round(primaryValue),
    penalties: fixes
      .filter((f) => f.hidden_penalty)
      .map((f) => `${f.name}: ${f.hidden_penalty}`)
  };
}

function combos3(arr) {
  const out = [];
  for (let i = 0; i < arr.length; i += 1) {
    for (let j = i + 1; j < arr.length; j += 1) {
      for (let k = j + 1; k < arr.length; k += 1) {
        out.push([arr[i], arr[j], arr[k]]);
      }
    }
  }
  return out;
}

function bestCombo(puzzle, streak) {
  let best = null;
  combos3(puzzle.fix_options || []).forEach((combo) => {
    const cost = combo.reduce((sum, item) => sum + Number(item.cost || 0), 0);
    if (cost > BUDGET_LIMIT) {
      return;
    }
    const score = evalSelection(puzzle, combo, streak, 18);
    if (!best || score.finalScore > best.score.finalScore) {
      best = { combo, score };
    }
  });
  return best;
}

function normalizeOptimal(rawOptimal, puzzle) {
  if (!rawOptimal) {
    return null;
  }

  if (Array.isArray(rawOptimal.combo)) {
    return rawOptimal;
  }

  const byId = new Map((puzzle?.fix_options || []).map((fix) => [fix.id, fix]));
  const fixIds = Array.isArray(rawOptimal.fixIds) ? rawOptimal.fixIds : [];
  const combo = fixIds.map((id) => byId.get(id)).filter(Boolean);

  return {
    ...rawOptimal,
    fixIds,
    combo
  };
}

function nextStreak(profile, day) {
  if (!profile.last_played_date) {
    return 1;
  }
  const d = diffDays(profile.last_played_date, day);
  if (d <= 0) {
    return Number(profile.current_streak || 0);
  }
  return d === 1 ? Number(profile.current_streak || 0) + 1 : 1;
}

function canFreeze(profile, day) {
  if (!profile?.last_played_date) {
    return false;
  }
  const d = diffDays(profile.last_played_date, day);
  return d > 1 && profile.streak_freeze_week !== weekKey(day);
}

function applyFreeze(profile, day) {
  return {
    ...profile,
    last_played_date: prevKey(day, 1),
    streak_freeze_week: weekKey(day)
  };
}

function recProviders(puzzle, neighbourhoodId, providers) {
  const byRank = (a, b) =>
    (b.area === neighbourhoodId) - (a.area === neighbourhoodId) || Number(b.ecoScore || 0) - Number(a.ecoScore || 0);

  if (!puzzle) {
    return providers.slice().sort(byRank).slice(0, 3);
  }

  const tags = DATA.scenarioTagMap[puzzle.scenario_type] || ['plumbers'];
  const matched = providers.filter((p) => (p.tags || []).some((tag) => tags.includes(tag))).sort(byRank);
  const fallback = providers.slice().sort(byRank);

  const merged = [...matched, ...fallback];
  const unique = [];
  const seen = new Set();

  merged.forEach((provider) => {
    const key = provider.id || provider.provider;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(provider);
    }
  });

  return unique.slice(0, 3);
}

function summaryText(result) {
  if (result.primaryResource === 'water') {
    return `Your fixes save ${result.primaryValue}L of water per day.`;
  }
  if (result.primaryResource === 'waste') {
    return `Your fixes reduce ${result.primaryValue} waste-units per day.`;
  }
  return `Your fixes avoid ${result.primaryValue}kg CO2e per day.`;
}

function EcoFixApp() {
  const storeRef = useRef(null);
  const selectStartRef = useRef(0);

  const [mode, setMode] = useState('local');
  const [users, setUsers] = useState([]);
  const [userId, setUserId] = useState('');
  const [profile, setProfile] = useState(null);
  const [puzzle, setPuzzle] = useState(null);
  const [phase, setPhase] = useState('analysis');
  const [analysis, setAnalysis] = useState(ANALYSIS_SECONDS);
  const [selectSec, setSelectSec] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [result, setResult] = useState(null);
  const [optimal, setOptimal] = useState(null);
  const [providers, setProviders] = useState([]);
  const [offerStatus, setOfferStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [scoreAnim, setScoreAnim] = useState(0);
  const [activeDay, setActiveDay] = useState(todayDayKey());
  const [diagramOpen, setDiagramOpen] = useState(false);

  const day = dateKey();

  const selectedFixes = useMemo(() => {
    if (!puzzle) {
      return [];
    }
    const map = new Map((puzzle.fix_options || []).map((f) => [f.id, f]));
    return selectedIds.map((id) => map.get(id)).filter(Boolean);
  }, [selectedIds, puzzle]);

  const spent = selectedFixes.reduce((sum, item) => sum + Number(item.cost || 0), 0);
  const budgetLeft = Math.max(0, BUDGET_LIMIT - spent);
  const tokensLeft = TOKEN_LIMIT - selectedIds.length;
  const analysisPct = clamp((analysis / ANALYSIS_SECONDS) * 100, 0, 100);

  const showToast = (message) => {
    setToast(message);
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => setToast(''), 2200);
  };

  useEffect(() => {
    let off = false;

    (async () => {
      const store = new EcoFixStore();
      storeRef.current = store;

      const storeMode = await store.init();
      if (off) {
        return;
      }

      setMode(storeMode === 'firebase' ? 'Firebase' : 'Local fallback');

      const auth = await store.authUser();
      const list = await store.listUsers();
      const initial = auth?.id || list[0]?.id || 'mock_user_1';

      const queryDay = new URLSearchParams(window.location.search).get('demoDay');
      const configDay = store.config?.demoDayOverride;
      const forced = (queryDay || configDay || '').toLowerCase();
      setActiveDay(DAY_KEYS.includes(forced) ? forced : todayDayKey());

      setUsers(list.length ? list : [{ id: initial, name: auth?.name || 'EcoFix Player' }]);
      setUserId(initial);
      setLoading(false);
    })();

    return () => {
      off = true;
    };
  }, []);

  useEffect(() => {
    if (!storeRef.current || !userId) {
      return;
    }

    let off = false;

    (async () => {
      setLoading(true);

      const store = storeRef.current;
      const user = await store.user(userId, users.find((u) => u.id === userId)?.name || 'EcoFix Player');
      const selectedDay = activeDay || todayDayKey();
      const fromStore = await store.puzzle(selectedDay);
      const fallbackPuzzle = fromStore || DATA.scenarios[selectedDay] || DATA.scenarios.monday;
      const daily = await store.dailyScore(day, userId);

      if (off) {
        return;
      }

      setProfile(user);
      setPuzzle(fallbackPuzzle);
      setProviders(recProviders(fallbackPuzzle, user.neighbourhood_id, store.providers));
      const offerSnapshot = await store.offerStatus();
      if (!off) {
        setOfferStatus(offerSnapshot);
      }
      setSelectedIds([]);
      setSelectSec(0);
      setAnalysis(ANALYSIS_SECONDS);

      if (daily) {
        setResult(daily.result);
        setOptimal(normalizeOptimal(daily.optimal, fallbackPuzzle));
        setPhase('results');
      } else {
        setResult(null);
        setOptimal(bestCombo(fallbackPuzzle, nextStreak(user, day)));
        setPhase('analysis');
      }

      setLoading(false);
    })();

    return () => {
      off = true;
    };
  }, [userId, users, activeDay, day]);

  useEffect(() => {
    if (phase !== 'analysis') {
      return;
    }

    if (analysis <= 0) {
      setPhase('select');
      selectStartRef.current = Date.now();
      return;
    }

    const t = setTimeout(() => setAnalysis((prev) => prev - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, analysis]);

  useEffect(() => {
    if (phase !== 'select') {
      return;
    }

    if (!selectStartRef.current) {
      selectStartRef.current = Date.now();
    }

    const timer = setInterval(() => {
      setSelectSec(Math.floor((Date.now() - selectStartRef.current) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'results' || !result) {
      setScoreAnim(0);
      return;
    }

    const start = performance.now();
    const target = Number(result.finalScore || 0);
    let raf = 0;

    const animate = (time) => {
      const progress = clamp((time - start) / 900, 0, 1);
      setScoreAnim(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) {
        raf = requestAnimationFrame(animate);
      }
    };

    raf = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(raf);
  }, [phase, result]);

  useEffect(() => {
    if (!diagramOpen) {
      return undefined;
    }
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setDiagramOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [diagramOpen]);

  const toggleFix = (fix) => {
    if (phase !== 'select') {
      return;
    }

    if (selectedIds.includes(fix.id)) {
      setSelectedIds((prev) => prev.filter((id) => id !== fix.id));
      return;
    }

    if (selectedIds.length >= TOKEN_LIMIT) {
      showToast(`Only ${TOKEN_LIMIT} tokens available.`);
      return;
    }

    if (spent + Number(fix.cost || 0) > BUDGET_LIMIT) {
      showToast('Budget exceeded. Pick another fix.');
      return;
    }

    setSelectedIds((prev) => [...prev, fix.id]);
  };

  const confirm = async () => {
    if (!profile || !puzzle || selectedIds.length !== TOKEN_LIMIT) {
      showToast(`Select exactly ${TOKEN_LIMIT} fixes.`);
      return;
    }

    const store = storeRef.current;
    const streak = nextStreak(profile, day);
    const score = evalSelection(puzzle, selectedFixes, streak, selectSec);
    const best = bestCombo(puzzle, streak);

    const missed = best
      ? best.combo.map((fix) => fix.id).filter((id) => !score.selectedFixIds.includes(id))
      : [];

    const resultPayload = {
      ...score,
      ecoContribution: Math.max(1, Math.round(score.finalScore / 9)),
      summaryText: summaryText(score),
      missedWhy: missed.length ? `Missed fixes: ${missed.join(', ')}` : 'You matched the optimal selection.'
    };

    const updated = {
      ...profile,
      current_streak: streak,
      longest_streak: Math.max(Number(profile.longest_streak || 0), streak),
      last_played_date: day,
      total_puzzles_completed: Number(profile.total_puzzles_completed || 0) + 1,
      total_score_all_time: Number(profile.total_score_all_time || 0) + resultPayload.finalScore,
      total_carbon_saved: scoreN(Number(profile.total_carbon_saved || 0) + resultPayload.carbonEquivalent),
      total_water_saved: scoreN(Number(profile.total_water_saved || 0) + Number(resultPayload.resourceSummary.water || 0)),
      puzzle_history: [...(profile.puzzle_history || []), `${day}:${puzzle.day_of_week}`].slice(-180),
      best_score: Math.max(Number(profile.best_score || 0), resultPayload.finalScore)
    };

    await store.saveDaily(day, userId, {
      user_id: userId,
      date: day,
      puzzle_id: `${puzzle.day_of_week}_${day}`,
      result: resultPayload,
      optimal: best ? { fixIds: best.combo.map((f) => f.id), score: best.score } : null
    });

    await store.saveUser(userId, updated);

    const sessionSync = await store.reportSession({
      playedOn: day,
      scenarioDay: puzzle.day_of_week,
      finalScore: resultPayload.finalScore,
      baseScore: resultPayload.baseScore,
      rootBonus: resultPayload.rootBonus,
      speedBonus: resultPayload.speedBonus,
      streakBonus: resultPayload.streakBonus,
      rootSelected: selectedFixes.some((fix) => Boolean(fix.is_root_cause))
    });

    const refreshedOffer = await store.offerStatus();
    if (refreshedOffer) {
      setOfferStatus(refreshedOffer);
    }

    setProfile(updated);
    setResult(resultPayload);
    setOptimal(best);
    setProviders(recProviders(puzzle, updated.neighbourhood_id, store.providers));
    setPhase('results');

    if (refreshedOffer?.activeCoupon?.code) {
      showToast(`Coupon ready: ${refreshedOffer.activeCoupon.code} (${refreshedOffer.activeCoupon.discountPct}% off)`);
    } else if (refreshedOffer?.offerEligible) {
      showToast(`Offer unlocked: redeem ${refreshedOffer.offer?.discountPct || 0}% now.`);
    } else if (sessionSync?.offer?.note) {
      showToast(sessionSync.offer.note);
    }
  };

  const redeemCouponNow = async () => {
    const store = storeRef.current;
    if (!store) {
      return;
    }
    const outcome = await store.redeemOffer();
    if (!outcome.ok) {
      showToast(outcome.error || 'Coupon redeem failed.');
      return;
    }
    const refreshed = await store.offerStatus();
    if (refreshed) {
      setOfferStatus(refreshed);
      if (refreshed.activeCoupon?.code) {
        showToast(`Coupon redeemed: ${refreshed.activeCoupon.code}`);
      } else {
        showToast('Coupon redeemed.');
      }
    }
  };

  const useFreezeNow = async () => {
    if (!profile || !canFreeze(profile, day)) {
      showToast('Streak freeze is not available right now.');
      return;
    }

    const next = applyFreeze(profile, day);
    await storeRef.current.saveUser(userId, next);
    setProfile(next);
    showToast('Weekly streak freeze used.');
  };

  const share = async () => {
    if (!result) {
      return;
    }
    const text = `I scored ${result.finalScore} on today's EcoFix. Can you beat it?`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'EcoFix', text });
        return;
      } catch {
        // fallback to clipboard
      }
    }
    await navigator.clipboard.writeText(text);
    showToast('Share text copied.');
  };

  const downloadCard = () => {
    if (!result || !puzzle || !profile) {
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 1080, 1080);
    gradient.addColorStop(0, '#0f766e');
    gradient.addColorStop(1, '#14532d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1080, 1080);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(70, 70, 940, 940);

    ctx.fillStyle = '#0f172a';
    ctx.font = '700 54px "Righteous", sans-serif';
    ctx.fillText('EcoFix Daily', 130, 170);

    ctx.font = '600 42px "Unbounded", sans-serif';
    ctx.fillText(`Score: ${result.finalScore}`, 130, 280);
    ctx.fillText(`${DAY_LABELS[puzzle.day_of_week]} Challenge`, 130, 350);
    ctx.fillText(profile.name, 130, 430);
    ctx.fillText(profile.neighbourhood_id, 130, 490);

    ctx.font = '500 30px "Space Grotesk", sans-serif';
    ctx.fillText(result.summaryText, 130, 575);

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `ecofix-${day}.png`;
    link.click();
  };

  if (!window.ECOFIX_DATA) {
    return (
      <main className="fx-app">
        <section className="fx-shell">
          <article className="fx-card fx-card-solid">
            <h1>EcoFix</h1>
            <p>EcoFix data did not load. Refresh the page once.</p>
          </article>
        </section>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="fx-app">
        <section className="fx-shell">
          <article className="fx-card fx-card-glass fx-loading-card">
            <div className="fx-spinner" />
            <p>Loading today's EcoFix challenge...</p>
          </article>
        </section>
      </main>
    );
  }

  const freezeReady = canFreeze(profile, day);

  return (
    <main className="fx-app">
      <section className="fx-shell">
        <header className="fx-card fx-card-glass fx-hero">
          <div className="fx-hero-top">
            <div>
              <p className="fx-overline">EcoSwipe Daily Challenge</p>
              <h1 className="fx-brand-title">EcoFix</h1>
              <p className="fx-sub">Fix real sustainability leaks in 3 moves.</p>
            </div>
            <a href="/app" className="fx-link-btn">Back</a>
          </div>
          <div className="fx-chip-row">
            <span className="fx-chip">Puzzle Day: {DAY_LABELS[activeDay] || 'Monday'}</span>
            <span className="fx-chip">Storage: {mode === 'Firebase' ? 'Cloud sync' : 'Local sync'}</span>
          </div>
        </header>

        <section className="fx-card fx-card-solid fx-profile">
          <div className="fx-row-between">
            <h2>Player Profile</h2>
            <select
              className="fx-select-input"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          {profile ? (
            <div className="fx-metric-grid">
              <article><strong>{profile.current_streak || 0}</strong><span>Day Streak</span></article>
              <article><strong>{profile.best_score || 0}</strong><span>Best Score</span></article>
              <article><strong>{Math.round(profile.total_water_saved || 0)}L</strong><span>Water Saved</span></article>
              <article><strong>{Math.round(profile.total_carbon_saved || 0)}kg</strong><span>CO2 Saved</span></article>
            </div>
          ) : null}

          {profile ? (
            <div className="fx-profile-foot">
              <p>{profile.neighbourhood_id} | {profile.total_puzzles_completed || 0} puzzles completed</p>
              {freezeReady ? (
                <button type="button" className="fx-ghost-btn" onClick={useFreezeNow}>Use Weekly Streak Freeze</button>
              ) : null}
            </div>
          ) : null}
        </section>

        {puzzle ? (
          <section className="fx-card fx-card-solid fx-scene">
            <div className="fx-row-between">
              <h2>{DAY_LABELS[puzzle.day_of_week]} Scenario</h2>
              <span className="fx-badge">{puzzle.scenario_type.replace(/_/g, ' ')}</span>
            </div>
            <p className="fx-scene-title">{puzzle.title}</p>
            <button type="button" className="fx-scene-image-wrap fx-diagram-open" onClick={() => setDiagramOpen(true)}>
              <img src={puzzle.scene_illustration} alt={puzzle.title} className="fx-scene-image" />
            </button>
            <div className="fx-scene-meta">
              <span className="fx-diagram-tag">Scenario Diagnostic Map</span>
              <span className="fx-diagram-hint">Tap image to expand</span>
            </div>
            <div className="fx-problem-list">
              {(puzzle.problems || []).slice(0, 6).map((problem) => (
                <span key={problem} className="fx-problem-chip">{problem}</span>
              ))}
            </div>
          </section>
        ) : null}

        {phase === 'analysis' ? (
          <section className="fx-card fx-card-glass fx-analysis">
            <div className="fx-analysis-ring" style={{ '--pct': analysisPct }}>
              <span>{analysis}s</span>
            </div>
            <div>
              <h3>Analyze first, then act.</h3>
              <p>
                You get {TOKEN_LIMIT} fixes and a {money(BUDGET_LIMIT)} budget. Pick root-cause moves before quick patches.
              </p>
            </div>
          </section>
        ) : null}

        {phase === 'select' && puzzle ? (
          <section className="fx-card fx-card-solid fx-select-phase">
            <div className="fx-kpi-grid">
              <article><strong>{tokensLeft}</strong><span>Tokens Left</span></article>
              <article><strong>{money(budgetLeft)}</strong><span>Budget Left</span></article>
              <article><strong>{selectSec}s</strong><span>Selection Time</span></article>
            </div>

            <div className="fx-fix-grid">
              {(puzzle.fix_options || []).map((fix) => {
                const selected = selectedIds.includes(fix.id);
                const pct = clamp((Number(fix.impact || 0) / 220) * 100, 8, 100);
                return (
                  <button
                    key={fix.id}
                    type="button"
                    onClick={() => toggleFix(fix)}
                    className={cx('fx-fix-card', selected && 'is-selected')}
                  >
                    <div className="fx-row-between">
                      <p className="fx-fix-name">{fix.name}</p>
                      {selected ? <span className="fx-pill fx-pill-on">Selected</span> : null}
                    </div>
                    <p className="fx-fix-meta">{money(fix.cost)} | Impact {fix.impact}</p>
                    <div className="fx-pill-row">
                      {fix.is_root_cause ? <span className="fx-pill">Root cause +20%</span> : null}
                      {fix.unlock_multiplier ? <span className="fx-pill">Synergy boost</span> : null}
                    </div>
                    <div className="fx-impact-track"><span style={{ width: `${pct}%` }} /></div>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={confirm}
              disabled={selectedIds.length !== TOKEN_LIMIT}
              className="fx-primary-btn"
            >
              Confirm {TOKEN_LIMIT} Fixes
            </button>
          </section>
        ) : null}

        {phase === 'results' && result ? (
          <section className="fx-card fx-card-solid fx-results">
            <div className="fx-score-block">
              <p className="fx-overline">Final Score</p>
              <h2>{scoreAnim}</h2>
              <p>{result.summaryText}</p>
            </div>

            <div className="fx-breakdown">
              <h3>Score Breakdown</h3>
              <p>Base Score: {result.baseScore}</p>
              <p>Root Cause Bonus: +{result.rootBonus}</p>
              <p>Speed Bonus: +{result.speedBonus}</p>
              <p>Streak Bonus ({result.streakDays} days): +{result.streakBonus}</p>
              <p className="fx-final-line">Final Score: {result.finalScore}</p>
            </div>

            <div className="fx-result-note">
              <p>{result.summaryText}</p>
              <p>
                Contribution: +{result.ecoContribution} to {profile?.neighbourhood_id} EcoScore.
              </p>
            </div>

            {offerStatus ? (
              <div className="fx-optimal">
                <h3>Coupon Status</h3>
                {offerStatus.activeCoupon ? (
                  <>
                    <p>
                      Active coupon: <strong>{offerStatus.activeCoupon.code}</strong> ({offerStatus.activeCoupon.discountPct}% off)
                    </p>
                    <p>Expires in {Number(offerStatus.activeCoupon.expiresInHours || 0).toFixed(1)} hours.</p>
                    <p>Apply this in the Payments page.</p>
                  </>
                ) : (
                  <>
                    <p>{offerStatus.note || 'No active coupon right now.'}</p>
                    {offerStatus.ecofix?.playedToday ? (
                      <p>
                        Today score: {offerStatus.ecofix.todayScore} / target {offerStatus.ecofix.unlockScoreTarget}
                      </p>
                    ) : (
                      <p>Play once today to be considered for a coupon.</p>
                    )}
                    {offerStatus.offerEligible ? (
                      <button type="button" className="fx-primary-btn" onClick={redeemCouponNow}>
                        Redeem {offerStatus.offer?.discountPct || 0}% Coupon
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {optimal ? (
              <div className="fx-optimal">
                <h3>Best Possible Combination</h3>
                <p>{(optimal.combo || []).map((fix) => fix?.name).filter(Boolean).join(', ') || 'No optimal combo available yet.'}</p>
                <p>Best score: {optimal?.score?.finalScore ?? '-'}</p>
                <p>{result.missedWhy}</p>
              </div>
            ) : null}

            {result.penalties?.length ? (
              <div className="fx-warning">
                <h3>Hidden Penalties</h3>
                {result.penalties.map((entry) => (
                  <p key={entry}>- {entry}</p>
                ))}
              </div>
            ) : null}

            <div>
              <h3>Recommended EcoSwipe Providers</h3>
              <div className="fx-provider-strip">
                {providers.map((provider) => (
                  <article key={provider.id || provider.provider} className="fx-provider-card">
                    <p className="fx-provider-name">{provider.provider}</p>
                    <p>{provider.area}</p>
                    <p>EcoScore {Number(provider.ecoScore || 0).toFixed(1)}</p>
                    <div className="fx-provider-meter">
                      <span style={{ width: `${clamp(Number(provider.ecoScore || 0), 0, 100)}%` }} />
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="fx-action-row">
              <button type="button" className="fx-ghost-btn" onClick={share}>Share Score</button>
              <button type="button" className="fx-primary-btn" onClick={downloadCard}>Download Card</button>
            </div>
          </section>
        ) : null}

        <footer className="fx-footer">
          EcoFix MVP | Daily puzzle rotation | Streak + score engine | Provider recommendations
        </footer>
      </section>

      {diagramOpen && puzzle ? (
        <aside className="fx-diagram-modal" onClick={() => setDiagramOpen(false)}>
          <div className="fx-diagram-panel" onClick={(event) => event.stopPropagation()}>
            <div className="fx-row-between">
              <h3>{DAY_LABELS[puzzle.day_of_week]} Scenario Map</h3>
              <div className="fx-action-row">
                <a href={puzzle.scene_illustration} target="_blank" rel="noreferrer" className="fx-link-btn">Open Original</a>
                <button type="button" className="fx-ghost-btn" onClick={() => setDiagramOpen(false)}>Close</button>
              </div>
            </div>
            <div className="fx-diagram-scroll">
              <img src={puzzle.scene_illustration} alt={puzzle.title} className="fx-diagram-full" />
            </div>
          </div>
        </aside>
      ) : null}

      {toast ? <aside className="fx-toast">{toast}</aside> : null}
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('ecofixRoot')).render(<EcoFixApp />);
