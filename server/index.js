require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, query, param, validationResult } = require('express-validator');
const { nanoid } = require('nanoid');
const path = require('path');
const db = require('./db');
const { DEFAULT_CATEGORY_BENCHMARKS, DEFAULT_PROVIDER_EVIDENCE, loadCalibrationData } = require('./externalData');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'replace-this-in-production';
const TOKEN_TTL = '2h';
const ADMIN_EMAILS = String(process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

const ACCENT_OPTIONS = ['sunset', 'mint', 'ocean', 'ember'];
const PAYMENT_METHODS = ['card', 'upi', 'wallet'];
const INSIGHT_WINDOWS = [3, 6, 12];
const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const TIME_SLOTS = Array.from({ length: 11 }, (_, index) => {
  const start = 9 + index;
  const end = start + 1;
  return `${start}:00-${end}:00`;
});

const CATEGORY_CARBON_PROFILE = {
  'Home Care': { opsKgPerHourTraditional: 1.7, opsKgPerHourEco: 1.0, materialKgTraditional: 1.2, materialKgEco: 0.55, baseTripKm: 15 },
  Repairs: { opsKgPerHourTraditional: 1.2, opsKgPerHourEco: 0.8, materialKgTraditional: 0.9, materialKgEco: 0.45, baseTripKm: 13 },
  'Auto Care': { opsKgPerHourTraditional: 1.5, opsKgPerHourEco: 0.92, materialKgTraditional: 1.0, materialKgEco: 0.5, baseTripKm: 12 },
  Lifestyle: { opsKgPerHourTraditional: 1.1, opsKgPerHourEco: 0.72, materialKgTraditional: 0.65, materialKgEco: 0.3, baseTripKm: 10 },
  Outdoor: { opsKgPerHourTraditional: 1.8, opsKgPerHourEco: 1.12, materialKgTraditional: 1.4, materialKgEco: 0.7, baseTripKm: 18 },
  Errands: { opsKgPerHourTraditional: 0.95, opsKgPerHourEco: 0.56, materialKgTraditional: 0.32, materialKgEco: 0.1, baseTripKm: 9 }
};

const VEHICLE_EMISSION_FACTOR = {
  petrol_van: 0.24,
  diesel_van: 0.29,
  hybrid: 0.14,
  electric_van: 0.07,
  e_bike: 0.018,
  bike: 0.005
};

const PROVIDER_VEHICLE = {
  'GreenNest Pros': 'electric_van',
  'FixLoop Collective': 'hybrid',
  SparkleGrid: 'electric_van',
  ThreadForward: 'e_bike',
  'RootRush Studio': 'hybrid',
  PedalCart: 'bike',
  'FlowWise Team': 'hybrid',
  'Harvest Circle': 'hybrid',
  'Volt Wheels': 'e_bike',
  ShiftCycle: 'hybrid',
  LeafLab: 'e_bike',
  BuildBack: 'hybrid',
  SunFleet: 'electric_van',
  'AfterGlow Crew': 'hybrid',
  ChargeCheck: 'e_bike',
  RefillGo: 'bike',
  PawPure: 'hybrid',
  SoilCycle: 'bike',
  'BlueLoop Engineers': 'hybrid',
  'RetroSmart Collective': 'hybrid'
};

const DEFAULT_TRADITIONAL_VEHICLE = 'petrol_van';
const VEHICLE_ECO_SCORE = {
  petrol_van: 30,
  diesel_van: 22,
  hybrid: 62,
  electric_van: 88,
  e_bike: 96,
  bike: 99
};

let categoryBenchmarkMap = new Map(
  DEFAULT_CATEGORY_BENCHMARKS.map((benchmark) => [benchmark.category, benchmark])
);
let providerEvidenceMap = new Map(
  DEFAULT_PROVIDER_EVIDENCE.map((evidence) => [evidence.provider, evidence])
);
let calibrationState = {
  source: 'local-fallback',
  warning: '',
  loadedAt: null,
  benchmarkCount: DEFAULT_CATEGORY_BENCHMARKS.length,
  providerEvidenceCount: DEFAULT_PROVIDER_EVIDENCE.length
};
const CITY_REGIONS = ['Adyar', 'Alwarpet', 'Anna Nagar', 'Ashok Nagar', 'T Nagar', 'Nungambakkam', 'Velachery', 'Mylapore'];
const DAY_PARTS = [
  { key: 'Morning', start: 9, end: 12 },
  { key: 'Afternoon', start: 12, end: 17 },
  { key: 'Evening', start: 17, end: 20 }
];
const CATEGORY_SKILL_SIGNALS = {
  'Home Care': ['Eco disinfecting', 'Air quality optimization', 'Allergy-safe protocols'],
  Repairs: ['Diagnostics automation', 'Predictive maintenance', 'Circular parts sourcing'],
  'Auto Care': ['EV diagnostics', 'Waterless detailing', 'Battery optimization'],
  Lifestyle: ['Nutrition planning', 'Event coordination', 'Creative service bundles'],
  Outdoor: ['Smart irrigation', 'Native landscaping', 'Solar maintenance'],
  Errands: ['Last-mile optimization', 'Micro-fulfillment', 'Community routing']
};
const MATCHING_FACTORS = [
  { factor: 'Eco fit', weight: 0.4, description: 'Alignment between user eco priority and service sustainability score.' },
  { factor: 'Budget fit', weight: 0.3, description: 'Distance from user budget cap after dynamic price checks.' },
  { factor: 'Urgency fit', weight: 0.2, description: 'ETA suitability, boosted when urgency mode is enabled.' },
  { factor: 'Quality fit', weight: 0.1, description: 'Review rating influence and behavioral reliability adjustments.' }
];

const serviceCatalog = [
  {
    id: 'svc-1',
    title: 'Eco Home Deep Clean',
    category: 'Home Care',
    price: 85,
    etaMinutes: 90,
    sustainabilityScore: 91,
    carbonSavedKg: 4.8,
    demandIndex: 78,
    badges: ['Plant-Based', 'Low Water'],
    provider: 'GreenNest Pros',
    description: 'Premium cleaning with non-toxic supplies and optimized routing.'
  },
  {
    id: 'svc-2',
    title: 'Smart Appliance Repair',
    category: 'Repairs',
    price: 120,
    etaMinutes: 60,
    sustainabilityScore: 74,
    carbonSavedKg: 2.3,
    demandIndex: 66,
    badges: ['Parts Reuse', 'Warranty'],
    provider: 'FixLoop Collective',
    description: 'Fast diagnostics and repair to extend appliance life cycle.'
  },
  {
    id: 'svc-3',
    title: 'Solar EV Car Wash',
    category: 'Auto Care',
    price: 35,
    etaMinutes: 35,
    sustainabilityScore: 88,
    carbonSavedKg: 3.1,
    demandIndex: 84,
    badges: ['Solar Powered', 'Water Smart'],
    provider: 'SparkleGrid',
    description: 'On-demand vehicle care using closed-loop water systems.'
  },
  {
    id: 'svc-4',
    title: 'Circular Fashion Alterations',
    category: 'Lifestyle',
    price: 55,
    etaMinutes: 45,
    sustainabilityScore: 94,
    carbonSavedKg: 5.7,
    demandIndex: 61,
    badges: ['Upcycling', 'Local Artisan'],
    provider: 'ThreadForward',
    description: 'Tailoring and redesign services that keep garments in use.'
  },
  {
    id: 'svc-5',
    title: 'Urban Garden Setup',
    category: 'Outdoor',
    price: 140,
    etaMinutes: 120,
    sustainabilityScore: 97,
    carbonSavedKg: 7.4,
    demandIndex: 59,
    badges: ['Compost Plan', 'Native Plants'],
    provider: 'RootRush Studio',
    description: 'Balcony and rooftop garden kits with setup and coaching.'
  },
  {
    id: 'svc-6',
    title: 'Bike Courier Grocery Run',
    category: 'Errands',
    price: 28,
    etaMinutes: 25,
    sustainabilityScore: 89,
    carbonSavedKg: 1.9,
    demandIndex: 92,
    badges: ['Zero Emission', 'Express'],
    provider: 'PedalCart',
    description: 'Rapid neighborhood deliveries with route-optimized cyclists.'
  },
  {
    id: 'svc-7',
    title: 'Rainwater Plumbing Tune-Up',
    category: 'Repairs',
    price: 110,
    etaMinutes: 70,
    sustainabilityScore: 86,
    carbonSavedKg: 3.4,
    demandIndex: 63,
    badges: ['Water Saving', 'Certified'],
    provider: 'FlowWise Team',
    description: 'Leak checks and water-efficiency improvements for lower bills.'
  },
  {
    id: 'svc-8',
    title: 'Community Meal Prep',
    category: 'Lifestyle',
    price: 65,
    etaMinutes: 55,
    sustainabilityScore: 82,
    carbonSavedKg: 2.8,
    demandIndex: 73,
    badges: ['Local Produce', 'Low Waste'],
    provider: 'Harvest Circle',
    description: 'Healthy batch meal prep using seasonal local ingredients.'
  },
  {
    id: 'svc-9',
    title: 'E-Bike Home Service',
    category: 'Auto Care',
    price: 48,
    etaMinutes: 40,
    sustainabilityScore: 90,
    carbonSavedKg: 2.1,
    demandIndex: 71,
    badges: ['Mobile Van', 'Spare Parts'],
    provider: 'Volt Wheels',
    description: 'Doorstep inspection and maintenance for electric bikes.'
  },
  {
    id: 'svc-10',
    title: 'Zero-Waste Move Assistant',
    category: 'Errands',
    price: 155,
    etaMinutes: 110,
    sustainabilityScore: 93,
    carbonSavedKg: 6.5,
    demandIndex: 54,
    badges: ['Reusable Crates', 'Route Optimized'],
    provider: 'ShiftCycle',
    description: 'Move homes with reusable materials and efficient logistics.'
  },
  {
    id: 'svc-11',
    title: 'Air Purifying Plant Care',
    category: 'Outdoor',
    price: 44,
    etaMinutes: 35,
    sustainabilityScore: 87,
    carbonSavedKg: 2.6,
    demandIndex: 64,
    badges: ['Indoor Air', 'Monthly Plan'],
    provider: 'LeafLab',
    description: 'Plant maintenance and placement to improve indoor wellness.'
  },
  {
    id: 'svc-12',
    title: 'Recycled Furniture Assembly',
    category: 'Home Care',
    price: 72,
    etaMinutes: 65,
    sustainabilityScore: 85,
    carbonSavedKg: 3.2,
    demandIndex: 68,
    badges: ['Circular Build', 'Fast Setup'],
    provider: 'BuildBack',
    description: 'Assembly and setup support for recycled furniture products.'
  },
  {
    id: 'svc-13',
    title: 'Solar Panel Wash',
    category: 'Outdoor',
    price: 95,
    etaMinutes: 80,
    sustainabilityScore: 96,
    carbonSavedKg: 5.1,
    demandIndex: 58,
    badges: ['Panel Efficiency', 'Eco Soap'],
    provider: 'SunFleet',
    description: 'Boost panel performance with eco-safe maintenance wash.'
  },
  {
    id: 'svc-14',
    title: 'Sustainable Event Cleanup',
    category: 'Home Care',
    price: 135,
    etaMinutes: 100,
    sustainabilityScore: 84,
    carbonSavedKg: 4.4,
    demandIndex: 62,
    badges: ['Waste Sorting', 'Compost Collection'],
    provider: 'AfterGlow Crew',
    description: 'Cleanup packages with recycling and compost stream handling.'
  },
  {
    id: 'svc-15',
    title: 'Battery Health Diagnostics',
    category: 'Repairs',
    price: 58,
    etaMinutes: 30,
    sustainabilityScore: 80,
    carbonSavedKg: 1.7,
    demandIndex: 77,
    badges: ['Device Longevity', 'Data Report'],
    provider: 'ChargeCheck',
    description: 'Battery diagnostics to extend life of consumer electronics.'
  },
  {
    id: 'svc-16',
    title: 'Refill Station Delivery',
    category: 'Errands',
    price: 32,
    etaMinutes: 25,
    sustainabilityScore: 92,
    carbonSavedKg: 2.2,
    demandIndex: 88,
    badges: ['Zero Plastic', 'Neighborhood Route'],
    provider: 'RefillGo',
    description: 'Home restocking from refill stations for daily essentials.'
  },
  {
    id: 'svc-17',
    title: 'Low-Impact Pet Grooming',
    category: 'Lifestyle',
    price: 60,
    etaMinutes: 50,
    sustainabilityScore: 79,
    carbonSavedKg: 1.6,
    demandIndex: 74,
    badges: ['Non-Toxic', 'Mobile Service'],
    provider: 'PawPure',
    description: 'Pet grooming with eco-safe materials and water controls.'
  },
  {
    id: 'svc-18',
    title: 'Compost Pickup Subscription',
    category: 'Errands',
    price: 24,
    etaMinutes: 20,
    sustainabilityScore: 98,
    carbonSavedKg: 3.8,
    demandIndex: 81,
    badges: ['Weekly Pickup', 'Garden Credit'],
    provider: 'SoilCycle',
    description: 'Collect and process household compost with local partners.'
  },
  {
    id: 'svc-19',
    title: 'Greywater Audit Session',
    category: 'Repairs',
    price: 125,
    etaMinutes: 95,
    sustainabilityScore: 95,
    carbonSavedKg: 5.5,
    demandIndex: 52,
    badges: ['Water Strategy', 'ROI Estimate'],
    provider: 'BlueLoop Engineers',
    description: 'Home audit and plan for safe greywater reuse savings.'
  },
  {
    id: 'svc-20',
    title: 'Home Energy Retrofit Assist',
    category: 'Home Care',
    price: 165,
    etaMinutes: 130,
    sustainabilityScore: 99,
    carbonSavedKg: 8.2,
    demandIndex: 57,
    badges: ['Efficiency Plan', 'Incentive Ready'],
    provider: 'RetroSmart Collective',
    description: 'Guided upgrades and paperwork prep for energy-efficient homes.'
  }
];

function slotStartHour(slot) {
  if (!slot || typeof slot !== 'string') {
    return 10;
  }
  const parsed = Number(slot.split(':')[0]);
  return Number.isFinite(parsed) ? parsed : 10;
}

function trafficMultiplierByHour(hour) {
  if ((hour >= 9 && hour <= 11) || (hour >= 17 && hour <= 19)) {
    return 1.13;
  }
  if (hour >= 12 && hour <= 16) {
    return 0.98;
  }
  return 1;
}

function getCategoryBenchmark(category) {
  const fromCalibration = categoryBenchmarkMap.get(category);
  if (fromCalibration) {
    return fromCalibration;
  }
  return DEFAULT_CATEGORY_BENCHMARKS.find((benchmark) => benchmark.category === category) || DEFAULT_CATEGORY_BENCHMARKS[0];
}

function getProviderEvidence(provider) {
  const fromCalibration = providerEvidenceMap.get(provider);
  if (fromCalibration) {
    return fromCalibration;
  }
  return (
    DEFAULT_PROVIDER_EVIDENCE.find((evidence) => evidence.provider === provider) || {
      provider,
      vehicleType: 'hybrid',
      renewableEnergyPct: 50,
      wasteDiversionPct: 60,
      materialReusePct: 55,
      routeEfficiencyPct: 65,
      onTimeRatePct: 88,
      completionRatePct: 92,
      responseTimeMin: 18,
      verifiedLevel: 1
    }
  );
}

function computeSustainabilityScore(service, evidence) {
  const vehicleScore = VEHICLE_ECO_SCORE[evidence.vehicleType] || VEHICLE_ECO_SCORE.hybrid;
  const raw =
    evidence.renewableEnergyPct * 0.24 +
    evidence.wasteDiversionPct * 0.2 +
    evidence.materialReusePct * 0.18 +
    evidence.routeEfficiencyPct * 0.12 +
    evidence.onTimeRatePct * 0.12 +
    evidence.completionRatePct * 0.1 +
    vehicleScore * 0.04;
  const demandPressurePenalty = service.demandIndex > 85 ? (service.demandIndex - 85) * 0.25 : 0;
  const adjusted = raw - demandPressurePenalty;
  return Math.round(clamp(adjusted, 45, 99));
}

function computeServiceCarbonModel(service, benchmark, evidence, sustainabilityScore) {
  const durationHours = Math.max(0.5, service.etaMinutes / 60);
  const demandAdjustment = 1 + (service.demandIndex / 100) * benchmark.demandTripFactor;
  const routeOptimization = clamp(1 - evidence.routeEfficiencyPct / 500, 0.72, 1);

  const traditionalTripKm = Number((benchmark.baseTripKm * demandAdjustment).toFixed(2));
  const ecoTripKm = Number((traditionalTripKm * benchmark.ecoTripFactor * routeOptimization).toFixed(2));

  const traditionalOpsKg = Number(
    (benchmark.traditionalOpsKgPerHour * durationHours + benchmark.traditionalMaterialKg).toFixed(2)
  );
  const ecoOpsEfficiency = clamp(
    1 -
      evidence.wasteDiversionPct / 420 -
      evidence.materialReusePct / 520 -
      sustainabilityScore / 1200,
    0.52,
    0.92
  );
  const ecoOpsKg = Number(
    ((benchmark.ecoOpsKgPerHour * durationHours + benchmark.ecoMaterialKg) * ecoOpsEfficiency).toFixed(2)
  );

  const traditionalTransportKg = Number(
    (traditionalTripKm * VEHICLE_EMISSION_FACTOR[DEFAULT_TRADITIONAL_VEHICLE]).toFixed(2)
  );
  const ecoVehicle = evidence.vehicleType || PROVIDER_VEHICLE[service.provider] || 'hybrid';
  const ecoTransportKg = Number((ecoTripKm * (VEHICLE_EMISSION_FACTOR[ecoVehicle] || 0.14)).toFixed(2));

  const baselineCarbonKg = Number((traditionalOpsKg + traditionalTransportKg).toFixed(2));
  const serviceCarbonKg = Number(Math.max(0.2, ecoOpsKg + ecoTransportKg).toFixed(2));

  return {
    baselineCarbonKg,
    serviceCarbonKg,
    carbonSavedKg: Number(Math.max(0.15, baselineCarbonKg - serviceCarbonKg).toFixed(2)),
    carbonBreakdown: {
      traditional: {
        transportKg: traditionalTransportKg,
        operationsKg: traditionalOpsKg,
        tripKm: traditionalTripKm
      },
      eco: {
        transportKg: ecoTransportKg,
        operationsKg: ecoOpsKg,
        tripKm: ecoTripKm,
        vehicle: ecoVehicle
      }
    }
  };
}

function bookingCarbonModel(service, booking = {}) {
  const startHour = slotStartHour(booking.slot);
  const traffic = trafficMultiplierByHour(startHour);
  const traditional = Number((service.baselineCarbonKg * traffic).toFixed(2));
  const eco = Number((service.serviceCarbonKg * (0.92 + (traffic - 1) * 0.45)).toFixed(2));
  return {
    baselineCarbonKg: traditional,
    serviceCarbonKg: eco,
    carbonSavedKg: Number(Math.max(0.1, traditional - eco).toFixed(2)),
    slotTrafficMultiplier: traffic
  };
}

function calibrateServiceCatalog() {
  serviceCatalog.forEach((service) => {
    const benchmark = getCategoryBenchmark(service.category);
    const evidence = getProviderEvidence(service.provider);
    const sustainabilityScore = computeSustainabilityScore(service, evidence);
    const carbon = computeServiceCarbonModel(service, benchmark, evidence, sustainabilityScore);

    const baselinePrice = Number((service.price * benchmark.traditionalPriceMultiplier).toFixed(2));
    const baselineEtaMinutes =
      service.etaMinutes +
      Number(benchmark.traditionalEtaBufferMin || 16) +
      Math.round((service.demandIndex / 2) * Number(benchmark.demandEtaFactor || 0.12));
    const lifecycleSavings = Number(
      (
        baselinePrice -
        service.price +
        service.price * ((evidence.materialReusePct + evidence.wasteDiversionPct) / 2000 + 0.045)
      ).toFixed(2)
    );

    service.sustainabilityScore = sustainabilityScore;
    service.baselineCarbonKg = carbon.baselineCarbonKg;
    service.serviceCarbonKg = carbon.serviceCarbonKg;
    service.carbonSavedKg = carbon.carbonSavedKg;
    service.carbonBreakdown = carbon.carbonBreakdown;
    service.baselinePrice = baselinePrice;
    service.baselineEtaMinutes = baselineEtaMinutes;
    service.lifecycleSavings = lifecycleSavings;

    const confidenceBase = calibrationState.source === 'supabase' ? 84 : 72;
    service.dataConfidence = Math.round(
      clamp(confidenceBase + evidence.verifiedLevel * 4 + evidence.completionRatePct * 0.08, 65, 98)
    );
  });
}

async function refreshCalibrationData() {
  const providerNames = [...new Set(serviceCatalog.map((service) => service.provider))];
  const loaded = await loadCalibrationData(providerNames);
  categoryBenchmarkMap = new Map(loaded.benchmarks.map((benchmark) => [benchmark.category, benchmark]));
  providerEvidenceMap = new Map(loaded.providerEvidence.map((evidence) => [evidence.provider, evidence]));
  calibrationState = {
    source: loaded.source,
    warning: loaded.warning,
    loadedAt: loaded.loadedAt,
    benchmarkCount: loaded.benchmarks.length,
    providerEvidenceCount: loaded.providerEvidence.length
  };
  calibrateServiceCatalog();
}

// Initialize with deterministic local benchmarks first, then refresh from external DB if configured.
calibrateServiceCatalog();
setInterval(() => {
  refreshCalibrationData().catch((error) => {
    console.warn(`Calibration refresh skipped: ${error.message}`);
  });
}, 30 * 60 * 1000);

// Normalize legacy booking statuses to the current lifecycle vocabulary.
db.prepare(
  "UPDATE bookings SET status = 'Pending' WHERE lower(status) IN ('awaiting payment', 'confirmed', 'unpaid', 'paid', 'pending')"
).run();
db.prepare("UPDATE bookings SET status = 'Approved' WHERE lower(status) IN ('accepted', 'approved', 'completed')").run();
db.prepare("UPDATE bookings SET status = 'Cancelled' WHERE lower(status) IN ('cancelled', 'canceled', 'rejected')").run();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://unpkg.com',
          'https://cdn.jsdelivr.net',
          'https://cdn.tailwindcss.com',
          'https://www.gstatic.com'
        ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https://www.gstatic.com'],
        connectSrc: [
          "'self'",
          'https://*.firebaseio.com',
          'wss://*.firebaseio.com',
          'https://*.googleapis.com',
          'https://*.gstatic.com'
        ]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);
app.use(express.json({ limit: '30kb' }));
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts. Please retry in 15 minutes.' }
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded. Slow down and retry shortly.' }
});

app.use('/api', apiLimiter);

function setCookie(res, name, value) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(name, value, {
    httpOnly: name === 'token',
    secure: isProd,
    sameSite: 'strict',
    maxAge: 2 * 60 * 60 * 1000
  });
}

function setAuthCookies(res, token, csrfToken) {
  setCookie(res, 'token', token);
  setCookie(res, 'csrfToken', csrfToken);
}

function clearAuthCookies(res) {
  res.clearCookie('token');
  res.clearCookie('csrfToken');
}

function isAdminEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (ADMIN_EMAILS.length > 0) {
    return ADMIN_EMAILS.includes(normalized);
  }
  // Developer-friendly fallback for local setup when ADMIN_EMAILS is not configured.
  return process.env.NODE_ENV !== 'production';
}

function isAdminUser(user) {
  if (!user) {
    return false;
  }
  return isAdminEmail(user.email);
}

function rowToUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: isAdminEmail(row.email) ? 'admin' : 'user',
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    preferences: {
      ecoPriority: row.eco_priority,
      budgetCap: row.budget_cap,
      urgencyMode: Boolean(row.urgency_mode),
      accent: row.accent
    }
  };
}

function getUserById(id) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return rowToUser(row);
}

function getUserByEmail(email) {
  const row = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email);
  return rowToUser(row);
}

function authRequired(req, res, next) {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = getUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.user = user;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}

function adminRequired(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!isAdminUser(req.user)) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  return next();
}

function resolveUserFromToken(req) {
  const token = req.cookies.token;
  if (!token) {
    return null;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return getUserById(payload.sub);
  } catch {
    return null;
  }
}

function csrfRequired(req, res, next) {
  const csrfHeader = req.get('x-csrf-token');
  const csrfCookie = req.cookies.csrfToken;
  if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
    return res.status(403).json({ error: 'Security check failed (CSRF).' });
  }
  return next();
}

function requestValid(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: 'Invalid input.', details: errors.array() });
    return false;
  }
  return true;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value, places = 2) {
  return Number(Number(value || 0).toFixed(places));
}

function normalizeBookingStatus(status) {
  const value = String(status || '')
    .trim()
    .toLowerCase();
  if (['approved', 'accepted', 'completed'].includes(value)) {
    return 'approved';
  }
  if (['cancelled', 'canceled', 'rejected'].includes(value)) {
    return 'cancelled';
  }
  return 'pending';
}

function bookingStatusLabel(status) {
  const normalized = normalizeBookingStatus(status);
  if (normalized === 'approved') {
    return 'Approved';
  }
  if (normalized === 'cancelled') {
    return 'Cancelled';
  }
  return 'Pending';
}

function percentReduction(baseline, current) {
  const base = Number(baseline || 0);
  if (base <= 0) {
    return 0;
  }
  return roundTo(((base - Number(current || 0)) / base) * 100, 1);
}

function percentIncrease(current, baseline) {
  const base = Number(baseline || 0);
  if (base <= 0) {
    return 0;
  }
  return roundTo(((Number(current || 0) - base) / base) * 100, 1);
}

function toMillis(value) {
  const t = new Date(value || '').getTime();
  return Number.isFinite(t) ? t : null;
}

function computeSwipeMatchTimeMinutes(swipes, bookings) {
  const positive = (swipes || [])
    .filter((swipe) => swipe && (swipe.action === 'like' || swipe.action === 'superlike'))
    .map((swipe) => ({ serviceId: swipe.serviceId, ts: toMillis(swipe.createdAt) }))
    .filter((item) => item.ts !== null);

  const bookingTimes = (bookings || [])
    .map((booking) => ({
      serviceId: booking.serviceId,
      ts: toMillis(booking.createdAt || booking.scheduledDate)
    }))
    .filter((item) => item.ts !== null);

  if (!positive.length || !bookingTimes.length) {
    return null;
  }

  const byService = new Map();
  positive.forEach((item) => {
    if (!byService.has(item.serviceId)) {
      byService.set(item.serviceId, []);
    }
    byService.get(item.serviceId).push(item.ts);
  });
  byService.forEach((list) => list.sort((a, b) => a - b));

  const diffs = [];
  bookingTimes.forEach((booking) => {
    const list = byService.get(booking.serviceId) || [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i] <= booking.ts) {
        const diffMinutes = (booking.ts - list[i]) / (1000 * 60);
        if (diffMinutes >= 0 && diffMinutes <= 60 * 24 * 7) {
          diffs.push(diffMinutes);
        }
        break;
      }
    }
  });

  if (diffs.length) {
    return roundTo(diffs.reduce((sum, value) => sum + value, 0) / diffs.length, 2);
  }

  const firstSwipe = Math.min(...positive.map((item) => item.ts));
  const firstBooking = Math.min(...bookingTimes.map((item) => item.ts));
  if (Number.isFinite(firstSwipe) && Number.isFinite(firstBooking) && firstBooking >= firstSwipe) {
    return roundTo((firstBooking - firstSwipe) / (1000 * 60), 2);
  }

  return null;
}

function ensureService(serviceId) {
  return serviceCatalog.find((service) => service.id === serviceId);
}

function parseBundleLabel(notes) {
  const raw = String(notes || '');
  const match = raw.match(/Bundle booking:\s*([^|]+)/i) || raw.match(/Bundle:\s*([^|]+)/i);
  return match ? match[1].trim() : '';
}

function parsePackageLabel(notes) {
  const raw = String(notes || '');
  const match = raw.match(/Task package:\s*([^|]+)/i) || raw.match(/Package booking:\s*([^|]+)/i);
  return match ? match[1].trim() : '';
}

function parsePackageId(notes) {
  const raw = String(notes || '');
  const match = raw.match(/Package ID:\s*([A-Z0-9-]+)/i);
  return match ? String(match[1]).trim().toUpperCase() : '';
}

function parseAddress(notes) {
  const raw = String(notes || '');
  const match = raw.match(/Address:\s*([^|]+)/i);
  return match ? String(match[1]).trim() : '';
}

function ensureUserGoal(userId) {
  const now = new Date().toISOString();
  db.prepare(
    'INSERT OR IGNORE INTO user_goals (user_id, monthly_carbon_goal, monthly_spend_goal, created_at, updated_at) VALUES (?, 25, 250, ?, ?)'
  ).run(userId, now, now);
}

function getUserGoal(userId) {
  ensureUserGoal(userId);
  return db
    .prepare(
      'SELECT user_id AS userId, monthly_carbon_goal AS monthlyCarbonGoal, monthly_spend_goal AS monthlySpendGoal, updated_at AS updatedAt FROM user_goals WHERE user_id = ?'
    )
    .get(userId);
}

function monthLabel(date) {
  return date.toLocaleString('en-US', { month: 'short', year: '2-digit' });
}

function buildMonthBuckets(months) {
  const now = new Date();
  return Array.from({ length: months }, (_, index) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - index), 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: monthLabel(d)
    };
  });
}

function buildMonthlySeries(bookings, months, valueFn) {
  const buckets = buildMonthBuckets(months);
  const indexMap = new Map(buckets.map((bucket, idx) => [bucket.key, idx]));
  const series = Array.from({ length: months }, () => 0);

  bookings.forEach((booking) => {
    const date = new Date(booking.createdAt || booking.scheduledDate || 0);
    if (Number.isNaN(date.getTime())) {
      return;
    }
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const idx = indexMap.get(key);
    if (idx === undefined) {
      return;
    }
    series[idx] += Number(valueFn(booking) || 0);
  });

  return {
    labels: buckets.map((bucket) => bucket.label),
    data: series.map((value) => Number(value.toFixed(2)))
  };
}

function parseJSON(value, fallback) {
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}

function hashString(input) {
  const text = String(input || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function regionFromSeed(seed) {
  return CITY_REGIONS[hashString(seed) % CITY_REGIONS.length];
}

function dayPartFromSlot(slot) {
  const hour = slotStartHour(slot);
  const part = DAY_PARTS.find((item) => hour >= item.start && hour < item.end);
  return part ? part.key : 'Afternoon';
}

function bookingRowsForProviderAnalytics() {
  return db
    .prepare(
      `SELECT
        b.id,
        b.user_id AS userId,
        b.service_id AS serviceId,
        b.slot,
        b.status,
        b.price_locked AS priceLocked,
        b.scheduled_date AS scheduledDate,
        b.created_at AS createdAt,
        CASE WHEN p.id IS NULL THEN 0 ELSE 1 END AS isPaid
      FROM bookings b
      LEFT JOIN payments p ON p.booking_id = b.id`
    )
    .all();
}

function swipeRowsForProviderAnalytics() {
  return db
    .prepare('SELECT user_id AS userId, service_id AS serviceId, action, created_at AS createdAt FROM swipes')
    .all();
}

function buildProviderAnalyticsSuite(windowMonths = 6) {
  const usd = (value) => `$${Number(value || 0).toFixed(2)}`;
  const bookingRows = bookingRowsForProviderAnalytics();
  const swipeRows = swipeRowsForProviderAnalytics();
  const now = new Date();
  const recentStart = new Date(now.getFullYear(), now.getMonth() - Math.max(1, Math.floor(windowMonths / 2)), 1);
  const prevStart = new Date(now.getFullYear(), now.getMonth() - windowMonths, 1);
  const slots = DAY_PARTS.map((item) => item.key);
  const regionIndex = new Map(CITY_REGIONS.map((region, idx) => [region, idx]));
  const slotIndex = new Map(slots.map((slot, idx) => [slot, idx]));
  const matrix = CITY_REGIONS.map(() => slots.map(() => 0));

  bookingRows.forEach((booking) => {
    const region = regionFromSeed(`${booking.userId}-${booking.serviceId}`);
    const slot = dayPartFromSlot(booking.slot);
    matrix[regionIndex.get(region)][slotIndex.get(slot)] += 1.5;
  });

  swipeRows.forEach((swipe) => {
    const region = regionFromSeed(`${swipe.userId}-${swipe.serviceId}`);
    const slot = dayPartFromSlot(`${new Date(swipe.createdAt || 0).getHours()}:00-${new Date(swipe.createdAt || 0).getHours() + 1}:00`);
    const weight = swipe.action === 'superlike' ? 1.2 : swipe.action === 'like' ? 0.8 : 0.35;
    matrix[regionIndex.get(region)][slotIndex.get(slot)] += weight;
  });

  const roundedMatrix = matrix.map((row) => row.map((value) => Number(value.toFixed(1))));

  const swipesByService = new Map();
  swipeRows.forEach((row) => {
    if (!swipesByService.has(row.serviceId)) {
      swipesByService.set(row.serviceId, { like: 0, superlike: 0, skip: 0 });
    }
    swipesByService.get(row.serviceId)[row.action] += 1;
  });
  const bookingsByService = new Map();
  bookingRows.forEach((row) => {
    bookingsByService.set(row.serviceId, (bookingsByService.get(row.serviceId) || 0) + 1);
  });
  const bookingWindowCountsByService = new Map();
  bookingRows.forEach((row) => {
    const createdAt = new Date(row.createdAt || 0);
    if (Number.isNaN(createdAt.getTime()) || createdAt < prevStart) {
      return;
    }
    bookingWindowCountsByService.set(row.serviceId, (bookingWindowCountsByService.get(row.serviceId) || 0) + 1);
  });

  const pricingRecommendations = serviceCatalog
    .map((service) => {
      const swipeStats = swipesByService.get(service.id) || { like: 0, superlike: 0, skip: 0 };
      const bookings = bookingsByService.get(service.id) || 0;
      const bookingsInWindow = bookingWindowCountsByService.get(service.id) || 0;
      const demandPressure = (swipeStats.like * 0.8 + swipeStats.superlike * 1.25 + service.demandIndex * 0.6) / Math.max(1, bookings + 3);
      const targetMultiplier = clamp(0.9 + demandPressure * 0.045, 0.85, 1.25);
      const suggestedPrice = Number((service.price * targetMultiplier).toFixed(2));
      const deltaPercent = Number((((suggestedPrice - service.price) / service.price) * 100).toFixed(1));
      const confidence = Number(clamp(58 + bookings * 5 + (swipeStats.like + swipeStats.superlike) * 1.2, 50, 94).toFixed(1));
      const monthlyBookings = Number((bookingsInWindow / Math.max(1, windowMonths)).toFixed(2));
      const expectedMonthlyRevenueLift = Number(
        (((suggestedPrice - service.price) * monthlyBookings) * (deltaPercent >= 0 ? 1 : 0.55)).toFixed(2)
      );
      return {
        serviceId: service.id,
        title: service.title,
        category: service.category,
        currentPrice: service.price,
        suggestedPrice,
        deltaPercent,
        confidence,
        monthlyBookings,
        expectedMonthlyRevenueLift,
        reason:
          deltaPercent >= 0
            ? 'Demand exceeds current conversion baseline; small premium is likely sustainable.'
            : 'High skip rate and low conversion suggest a tactical discount window.'
      };
    })
    .sort((a, b) => Math.abs(b.deltaPercent) - Math.abs(a.deltaPercent))
    .slice(0, 8);

  const categorySignals = new Map(
    [...new Set(serviceCatalog.map((service) => service.category))].map((category) => [
      category,
      { recent: 0, previous: 0, likes: 0, bookings: 0 }
    ])
  );

  bookingRows.forEach((booking) => {
    const service = ensureService(booking.serviceId);
    if (!service) {
      return;
    }
    const createdAt = new Date(booking.createdAt || 0);
    const signal = categorySignals.get(service.category);
    signal.bookings += 1;
    if (createdAt >= recentStart) {
      signal.recent += 1;
    } else if (createdAt >= prevStart) {
      signal.previous += 1;
    }
  });

  swipeRows.forEach((swipe) => {
    if (swipe.action === 'skip') {
      return;
    }
    const service = ensureService(swipe.serviceId);
    if (!service) {
      return;
    }
    categorySignals.get(service.category).likes += swipe.action === 'superlike' ? 1.3 : 1;
  });

  const skillGaps = [...categorySignals.entries()]
    .map(([category, signal]) => {
      const growth = signal.previous ? ((signal.recent - signal.previous) / signal.previous) * 100 : signal.recent * 35;
      const unmetDemand = Math.max(0, signal.likes - signal.bookings) * 6.5;
      const opportunityScore = Number(clamp(growth * 0.55 + unmetDemand * 0.45 + 24, 0, 100).toFixed(1));
      return {
        category,
        opportunityScore,
        demandGrowthPct: Number(growth.toFixed(1)),
        unmetDemandIndex: Number(unmetDemand.toFixed(1)),
        recommendedSkills: CATEGORY_SKILL_SIGNALS[category] || ['Advanced coordination']
      };
    })
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, 6);

  const regionSignals = CITY_REGIONS.map((region, rowIdx) => {
    const row = roundedMatrix[rowIdx] || [];
    const totalDemand = Number(row.reduce((sum, value) => sum + value, 0).toFixed(1));
    const bestSlotIndex = row.reduce((bestIdx, value, idx, arr) => (value > arr[bestIdx] ? idx : bestIdx), 0);
    return {
      region,
      totalDemand,
      bestSlot: slots[bestSlotIndex] || slots[0],
      bestSlotDemand: Number((row[bestSlotIndex] || 0).toFixed(1))
    };
  }).sort((a, b) => b.totalDemand - a.totalDemand);

  const slotSignals = slots
    .map((slot, slotIdx) => ({
      slot,
      totalDemand: Number(
        roundedMatrix.reduce((sum, row) => sum + Number(row[slotIdx] || 0), 0).toFixed(1)
      )
    }))
    .sort((a, b) => b.totalDemand - a.totalDemand);

  const totalDemandPulse = Number(roundedMatrix.flat().reduce((sum, value) => sum + value, 0).toFixed(1));
  const topRegionSignal = regionSignals[0] || { region: '-', totalDemand: 0, bestSlot: '-', bestSlotDemand: 0 };
  const topSlotSignal = slotSignals[0] || { slot: '-', totalDemand: 0 };
  const avgRecommendedPriceChangePct = Number(
    (
      pricingRecommendations.reduce((sum, item) => sum + Number(item.deltaPercent || 0), 0) /
      Math.max(1, pricingRecommendations.length)
    ).toFixed(1)
  );
  const projectedMonthlyUpside = Number(
    pricingRecommendations
      .slice(0, 5)
      .reduce((sum, item) => sum + Math.max(0, Number(item.expectedMonthlyRevenueLift || 0)), 0)
      .toFixed(2)
  );
  const topOpportunityCategory = skillGaps[0]?.category || '-';

  const topPricingPositive = pricingRecommendations
    .filter((item) => Number(item.deltaPercent) > 0)
    .sort((a, b) => Number(b.expectedMonthlyRevenueLift || 0) - Number(a.expectedMonthlyRevenueLift || 0))[0];
  const topPricingRecovery = pricingRecommendations
    .filter((item) => Number(item.deltaPercent) < 0)
    .sort((a, b) => Math.abs(Number(b.deltaPercent)) - Math.abs(Number(a.deltaPercent)))[0];
  const topSkillGap = skillGaps[0] || null;
  const growthActions = [
    topPricingPositive
      ? {
          title: `Test premium pricing for ${topPricingPositive.title}`,
          actionType: 'pricing',
          impact: `Potential +${usd(topPricingPositive.expectedMonthlyRevenueLift)} / month`,
          detail: `Move from ${usd(topPricingPositive.currentPrice)} to ${usd(topPricingPositive.suggestedPrice)} with controlled rollout.`
        }
      : null,
    {
      title: `Expand coverage in ${topRegionSignal.region} (${topRegionSignal.bestSlot})`,
      actionType: 'capacity',
      impact: `Demand pulse ${topRegionSignal.totalDemand}`,
      detail: `Add extra provider slots during ${topRegionSignal.bestSlot} where demand intensity is highest.`
    },
    topSkillGap
      ? {
          title: `Launch ${topSkillGap.category} upskilling sprint`,
          actionType: 'skill',
          impact: `Opportunity ${topSkillGap.opportunityScore}`,
          detail: `Prioritize ${topSkillGap.recommendedSkills.slice(0, 2).join(', ')} to capture growth demand.`
        }
      : null,
    topPricingRecovery
      ? {
          title: `Apply conversion recovery on ${topPricingRecovery.title}`,
          actionType: 'conversion',
          impact: `${topPricingRecovery.deltaPercent}% tactical adjustment`,
          detail: `Run limited-time price correction to reduce skip pressure and improve booking conversion.`
        }
      : null
  ].filter(Boolean);

  return {
    businessKpis: {
      demandPulse: totalDemandPulse,
      topRegion: topRegionSignal.region,
      topDayPart: topSlotSignal.slot,
      avgRecommendedPriceChangePct,
      projectedMonthlyUpside,
      topOpportunityCategory
    },
    regionalOpportunities: regionSignals.slice(0, 5),
    heatmap: {
      regions: CITY_REGIONS,
      slots,
      matrix: roundedMatrix
    },
    pricingRecommendations,
    skillGaps,
    growthActions
  };
}

function isProviderBookingFailure(booking) {
  const status = String(booking.status || '').toLowerCase();
  const scheduledDate = new Date(booking.scheduledDate || 0);
  const staleUnpaid = !booking.isPaid && !Number.isNaN(scheduledDate.getTime()) && scheduledDate < new Date();
  return status.includes('cancel') || staleUnpaid || status.includes('fail');
}

function confidenceBandByJobs(jobs) {
  if (jobs >= 16) {
    return 'High';
  }
  if (jobs >= 8) {
    return 'Medium';
  }
  return 'Low';
}

function buildBehavioralTrustSuite() {
  const reviewRows = db.prepare('SELECT service_id AS serviceId, rating FROM reviews').all();
  const bookingRows = bookingRowsForProviderAnalytics();
  const swipeRows = swipeRowsForProviderAnalytics();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const recentDemandStart = new Date(todayStart);
  recentDemandStart.setDate(recentDemandStart.getDate() - 6);
  const demandByProvider = new Map();
  const addDemand = (provider, weight) => {
    if (!provider) {
      return;
    }
    const current = Number(demandByProvider.get(provider) || 0);
    demandByProvider.set(provider, current + Number(weight || 0));
  };

  const reviewMap = new Map();
  reviewRows.forEach((row) => {
    if (!reviewMap.has(row.serviceId)) {
      reviewMap.set(row.serviceId, []);
    }
    reviewMap.get(row.serviceId).push(Number(row.rating));
  });

  const byProvider = new Map();
  bookingRows.forEach((booking) => {
    const service = ensureService(booking.serviceId);
    if (!service) {
      return;
    }
    if (!byProvider.has(service.provider)) {
      byProvider.set(service.provider, []);
    }
    byProvider.get(service.provider).push({ ...booking, service });

    const createdAt = new Date(booking.createdAt || 0);
    const scheduledAt = new Date(booking.scheduledDate || 0);
    if (!Number.isNaN(createdAt.getTime()) && createdAt >= recentDemandStart) {
      addDemand(service.provider, 0.7);
      if (createdAt >= todayStart && createdAt < todayEnd) {
        addDemand(service.provider, 1.1);
      }
    }
    if (!Number.isNaN(scheduledAt.getTime()) && scheduledAt >= todayStart && scheduledAt < todayEnd) {
      addDemand(service.provider, 2.2);
    }
  });

  swipeRows.forEach((swipe) => {
    const service = ensureService(swipe.serviceId);
    if (!service) {
      return;
    }
    const createdAt = new Date(swipe.createdAt || 0);
    if (Number.isNaN(createdAt.getTime()) || createdAt < recentDemandStart) {
      return;
    }
    let weight = 0.2;
    if (swipe.action === 'superlike') {
      weight = 1.5;
    } else if (swipe.action === 'like') {
      weight = 1.0;
    } else if (swipe.action === 'skip') {
      weight = 0.08;
    }
    if (createdAt >= todayStart && createdAt < todayEnd) {
      weight *= 1.75;
    }
    addDemand(service.provider, weight);
  });

  const calibrationSamples = [];
  const providers = [...byProvider.entries()].map(([provider, providerBookings]) => {
    const jobs = providerBookings.length;
    const avgDemand =
      providerBookings.reduce((sum, booking) => sum + booking.service.demandIndex, 0) / Math.max(jobs, 1);
    const avgSustainability =
      providerBookings.reduce((sum, booking) => sum + booking.service.sustainabilityScore, 0) / Math.max(jobs, 1);
    const responseJitter = hashString(provider) % 7;
    const responseTimeMin = Number(clamp(26 + avgDemand * 0.12 - avgSustainability * 0.08 + responseJitter, 6, 52).toFixed(1));

    const failures = providerBookings.filter((booking) => isProviderBookingFailure(booking)).length;
    const completed = Math.max(0, jobs - failures);
    const completionRate = Number(((completed / Math.max(1, jobs)) * 100).toFixed(1));

    const ratingSet = providerBookings.flatMap((booking) => reviewMap.get(booking.serviceId) || []);
    const avgRating = ratingSet.length
      ? ratingSet.reduce((sum, rating) => sum + rating, 0) / ratingSet.length
      : 4.3;
    const punctualityRate = Number(
      clamp(68 + avgRating * 6 + (avgSustainability - 70) * 0.25 - responseTimeMin * 0.35, 55, 99).toFixed(1)
    );

    const userCount = new Map();
    providerBookings.forEach((booking) => {
      userCount.set(booking.userId, (userCount.get(booking.userId) || 0) + 1);
    });
    let repeatCount = 0;
    userCount.forEach((count) => {
      if (count > 1) {
        repeatCount += count - 1;
      }
    });
    const repeatHireRate = Number(((repeatCount / Math.max(1, jobs)) * 100).toFixed(1));

    const cancellationRate = Number((100 - completionRate).toFixed(1));
    const responseComponent = clamp(100 - responseTimeMin * 1.8, 0, 100);
    const cancellationControl = clamp(100 - cancellationRate, 0, 100);
    const observedReliability = clamp(
      responseComponent * 0.18 + completionRate * 0.28 + punctualityRate * 0.22 + repeatHireRate * 0.2 + cancellationControl * 0.12,
      0,
      100
    );

    const priorMean = 72;
    const priorWeight = 10;
    const bayesianReliability = (priorMean * priorWeight + observedReliability * jobs) / (priorWeight + Math.max(1, jobs));
    const uncertainty = Number(clamp(14 / Math.sqrt(jobs + 1) + 1.8, 2.5, 11.5).toFixed(1));
    const reliabilityScore = Number(clamp(bayesianReliability, 0, 100).toFixed(1));
    const reliabilityInterval = {
      lower: Number(clamp(reliabilityScore - uncertainty, 0, 100).toFixed(1)),
      upper: Number(clamp(reliabilityScore + uncertainty, 0, 100).toFixed(1))
    };
    const confidencePct = Number(clamp(100 - uncertainty * 5.5, 38, 97).toFixed(1));
    const confidenceBand = confidenceBandByJobs(jobs);
    const providerFailureRate = failures / Math.max(1, jobs);

    const contextStats = new Map();
    const bookingContexts = [];
    providerBookings.forEach((booking) => {
      const dayPart = dayPartFromSlot(booking.slot);
      const region = regionFromSeed(`${booking.userId}-${booking.serviceId}`);
      const category = booking.service.category;
      const createdAt = new Date(booking.createdAt || 0);
      const scheduledAt = new Date(booking.scheduledDate || 0);
      const urgency =
        !Number.isNaN(createdAt.getTime()) &&
        !Number.isNaN(scheduledAt.getTime()) &&
        (scheduledAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24) <= 1.2
          ? 'Urgent'
          : 'Planned';
      const key = `${category}|${dayPart}|${region}|${urgency}`;
      if (!contextStats.has(key)) {
        contextStats.set(key, {
          key,
          category,
          dayPart,
          region,
          urgency,
          count: 0,
          failures: 0
        });
      }
      const failure = isProviderBookingFailure(booking);
      const stats = contextStats.get(key);
      stats.count += 1;
      if (failure) {
        stats.failures += 1;
      }
      bookingContexts.push({ failure, key });
    });

    const priorAlpha = 1 + providerFailureRate * 4;
    const priorBeta = 1 + (1 - providerFailureRate) * 4;
    const contextList = [...contextStats.values()]
      .map((stats) => {
        const posteriorFailure = (stats.failures + priorAlpha) / (stats.count + priorAlpha + priorBeta);
        const sigma = Math.sqrt(
          (posteriorFailure * (1 - posteriorFailure)) / Math.max(1, stats.count + priorAlpha + priorBeta)
        );
        return {
          ...stats,
          failurePct: Number((posteriorFailure * 100).toFixed(1)),
          posteriorFailure,
          confidencePct: Number(clamp(100 - sigma * 240 - (stats.count < 3 ? 20 : 0), 34, 96).toFixed(1))
        };
      })
      .sort((a, b) => b.posteriorFailure - a.posteriorFailure);

    const highestRiskContext = contextList[0] || null;
    const safestContext = contextList.length ? contextList[contextList.length - 1] : null;
    const contextualFailurePct = Number(
      ((highestRiskContext ? highestRiskContext.posteriorFailure : providerFailureRate) * 100).toFixed(1)
    );
    const contextualConfidencePct = highestRiskContext ? highestRiskContext.confidencePct : Number(clamp(confidencePct - 8, 30, 92).toFixed(1));

    const contextPosteriorByKey = new Map(contextList.map((item) => [item.key, item.posteriorFailure]));
    bookingContexts.forEach((item) => {
      const contextFailure = contextPosteriorByKey.get(item.key) ?? providerFailureRate;
      const reliabilityRisk = clamp((100 - reliabilityScore) / 100, 0.02, 0.97);
      const predictedFailure = clamp(contextFailure * 0.68 + reliabilityRisk * 0.32, 0.02, 0.97);
      calibrationSamples.push({
        predicted: predictedFailure,
        actual: item.failure ? 1 : 0
      });
    });

    const monthlySeries = buildMonthlySeries(providerBookings, 6, () => 1);
    const reliabilityTrend = monthlySeries.data.map((value, index) => {
      const modulation = (hashString(`${provider}-${index}`) % 9) - 4;
      return Number(clamp(reliabilityScore - 8 + value * 2.6 + modulation, 20, 99).toFixed(1));
    });
    const trendDelta = reliabilityTrend.length > 1
      ? Number((reliabilityTrend[reliabilityTrend.length - 1] - reliabilityTrend[reliabilityTrend.length - 2]).toFixed(1))
      : 0;

    const explainability = [
      {
        factor: 'Response speed',
        delta: Number(((18 - responseTimeMin) * 0.9).toFixed(1)),
        note:
          responseTimeMin <= 18
            ? `Fast response at ${responseTimeMin} min lowers failure risk.`
            : `Response time at ${responseTimeMin} min increases failure risk in urgent bookings.`
      },
      {
        factor: 'Completion reliability',
        delta: Number(((completionRate - 92) * 0.7).toFixed(1)),
        note:
          completionRate >= 92
            ? `Completion rate of ${completionRate}% supports dependable execution.`
            : `Completion rate of ${completionRate}% needs improvement to reduce risk.`
      },
      {
        factor: 'Punctuality',
        delta: Number(((punctualityRate - 90) * 0.5).toFixed(1)),
        note:
          punctualityRate >= 90
            ? `Punctuality at ${punctualityRate}% supports schedule-sensitive tasks.`
            : `Punctuality at ${punctualityRate}% can create SLA slippage.`
      },
      {
        factor: 'Repeat-hire signal',
        delta: Number(((repeatHireRate - 25) * 0.3).toFixed(1)),
        note:
          repeatHireRate >= 25
            ? `Repeat-hire rate of ${repeatHireRate}% indicates sustained trust.`
            : `Repeat-hire rate of ${repeatHireRate}% suggests weaker retention.`
      },
      {
        factor: 'Cancellation behavior',
        delta: Number(((8 - cancellationRate) * 0.9).toFixed(1)),
        note:
          cancellationRate <= 8
            ? `Cancellation at ${cancellationRate}% keeps failure exposure low.`
            : `Cancellation at ${cancellationRate}% is the main trust drag.`
      }
    ]
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3)
      .map((item) => ({
        factor: item.factor,
        delta: Number(item.delta.toFixed(1)),
        effect: item.delta >= 0 ? 'up' : 'down',
        note: item.note
      }));

    const riskFlags = [];
    if (cancellationRate > 18) riskFlags.push('Cancellation spike detected');
    if (completionRate < 84) riskFlags.push('Low completion reliability');
    if (responseTimeMin > 24) riskFlags.push('Slow response for urgent demand');
    if (trendDelta < -3) riskFlags.push('Reliability trend declining');
    if (repeatHireRate < 12) riskFlags.push('Weak repeat-hire retention');
    if (!riskFlags.length) riskFlags.push('Trust profile stable');

    return {
      provider,
      evidenceJobs: jobs,
      responseTimeMin,
      completionRate,
      punctualityRate,
      repeatHireRate,
      cancellationRate,
      reliabilityScore,
      reliabilityInterval,
      uncertainty,
      confidencePct,
      confidenceBand,
      subScores: {
        response: Number(responseComponent.toFixed(1)),
        completion: Number(completionRate.toFixed(1)),
        punctuality: Number(punctualityRate.toFixed(1)),
        repeat: Number(repeatHireRate.toFixed(1)),
        cancellationControl: Number(cancellationControl.toFixed(1))
      },
      contextualRisk: {
        predictedFailurePct: contextualFailurePct,
        confidencePct: contextualConfidencePct,
        highestRiskContext: highestRiskContext
          ? {
              category: highestRiskContext.category,
              dayPart: highestRiskContext.dayPart,
              region: highestRiskContext.region,
              urgency: highestRiskContext.urgency,
              sampleSize: highestRiskContext.count,
              failurePct: highestRiskContext.failurePct
            }
          : null,
        safestContext: safestContext
          ? {
              category: safestContext.category,
              dayPart: safestContext.dayPart,
              region: safestContext.region,
              urgency: safestContext.urgency,
              sampleSize: safestContext.count,
              failurePct: safestContext.failurePct
            }
          : null
      },
      explainability,
      riskFlags,
      trendLabels: monthlySeries.labels,
      reliabilityTrend,
      trendDelta
    };
  });

  const providersWithDemandRaw = providers.map((providerItem) => ({
    ...providerItem,
    demandSignalRaw: Number((demandByProvider.get(providerItem.provider) || 0).toFixed(2))
  }));
  const maxDemandSignal = Math.max(
    1,
    ...providersWithDemandRaw.map((providerItem) => Number(providerItem.demandSignalRaw || 0))
  );
  const rankedProviders = providersWithDemandRaw
    .map((providerItem) => {
      const demandScore = Number(
        clamp((Number(providerItem.demandSignalRaw || 0) / maxDemandSignal) * 100, 0, 100).toFixed(1)
      );
      const demandWeightedPriority = Number(
        clamp(providerItem.reliabilityScore * 0.64 + demandScore * 0.36, 0, 100).toFixed(1)
      );
      return {
        ...providerItem,
        demandScore,
        demandWeightedPriority
      };
    })
    .sort((a, b) => {
      const diff = Number(b.demandWeightedPriority || 0) - Number(a.demandWeightedPriority || 0);
      if (Math.abs(diff) > 0.001) {
        return diff;
      }
      return Number(b.reliabilityScore || 0) - Number(a.reliabilityScore || 0);
    });

  const bins = Array.from({ length: 10 }, (_, idx) => ({
    lower: idx * 0.1,
    upper: (idx + 1) * 0.1,
    count: 0,
    predictedSum: 0,
    actualSum: 0
  }));
  let brierAccumulator = 0;
  calibrationSamples.forEach((sample) => {
    const index = Math.min(9, Math.max(0, Math.floor(sample.predicted * 10)));
    const bin = bins[index];
    bin.count += 1;
    bin.predictedSum += sample.predicted;
    bin.actualSum += sample.actual;
    brierAccumulator += (sample.predicted - sample.actual) ** 2;
  });
  const sampleCount = calibrationSamples.length;
  const activeBins = bins
    .filter((bin) => bin.count > 0)
    .map((bin) => {
      const predicted = bin.predictedSum / bin.count;
      const observed = bin.actualSum / bin.count;
      return {
        label: `${Math.round(bin.lower * 100)}-${Math.round(bin.upper * 100)}%`,
        count: bin.count,
        predictedPct: Number((predicted * 100).toFixed(1)),
        observedPct: Number((observed * 100).toFixed(1))
      };
    });
  const calibrationErrorPct = sampleCount
    ? Number(
        (
          activeBins.reduce((sum, bin) => sum + Math.abs(bin.predictedPct - bin.observedPct) * bin.count, 0) /
          sampleCount
        ).toFixed(2)
      )
    : 0;
  const brierScore = sampleCount ? Number((brierAccumulator / sampleCount).toFixed(4)) : 0;

  return {
    trust: rankedProviders,
    rankingBasis: 'daily-demand-priority',
    calibration: {
      sampleCount,
      brierScore,
      calibrationErrorPct,
      bins: activeBins,
      generatedAt: new Date().toISOString()
    }
  };
}

function buildBehavioralTrustScores() {
  return buildBehavioralTrustSuite().trust;
}

function buildMarketArchitect(windowMonths = 6) {
  const analytics = buildProviderAnalyticsSuite(windowMonths);
  const bookingRows = bookingRowsForProviderAnalytics();
  const monthBuckets = buildMonthBuckets(windowMonths);
  const regionDemand = new Map(CITY_REGIONS.map((region) => [region, Array.from({ length: windowMonths }, () => 0)]));

  bookingRows.forEach((booking) => {
    const date = new Date(booking.createdAt || booking.scheduledDate || 0);
    if (Number.isNaN(date.getTime())) {
      return;
    }
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const monthIdx = monthBuckets.findIndex((bucket) => bucket.key === key);
    if (monthIdx < 0) {
      return;
    }
    const region = regionFromSeed(`${booking.userId}-${booking.serviceId}`);
    regionDemand.get(region)[monthIdx] += 1;
  });

  const geographicGrowth = [...regionDemand.entries()].map(([region, series]) => {
    const recent = series.slice(-3).reduce((sum, value) => sum + value, 0);
    const previous = series.slice(0, Math.max(1, series.length - 3)).reduce((sum, value) => sum + value, 0);
    const baseline = previous / Math.max(1, series.length - 3);
    const slope = baseline ? (recent / 3 - baseline) : recent / 3;
    const projectedDemand = Number(Math.max(0, recent / 3 + slope * 1.2).toFixed(1));
    const growthPct = Number((baseline ? ((projectedDemand - baseline) / baseline) * 100 : projectedDemand * 15).toFixed(1));
    return {
      region,
      currentDemand: Number((recent / 3).toFixed(1)),
      projectedDemand,
      growthPct
    };
  });

  const clusterExpansion = analytics.skillGaps.slice(0, 5).map((item) => ({
    cluster: `${item.category} services`,
    confidence: Number(clamp(58 + item.opportunityScore * 0.35, 55, 96).toFixed(1)),
    projectedGrowthPct: Number((item.demandGrowthPct * 0.65 + item.unmetDemandIndex * 0.45).toFixed(1))
  }));

  const demandShifts = analytics.skillGaps.map((item) => ({
    category: item.category,
    shiftSignal: item.demandGrowthPct >= 0 ? 'Rising' : 'Cooling',
    demandGrowthPct: item.demandGrowthPct,
    unmetDemandIndex: item.unmetDemandIndex
  }));

  return {
    matchingLogic: MATCHING_FACTORS,
    geographicGrowth: geographicGrowth.sort((a, b) => b.projectedDemand - a.projectedDemand),
    clusterExpansion: clusterExpansion.sort((a, b) => b.projectedGrowthPct - a.projectedGrowthPct),
    demandShifts
  };
}

function aiIntentToExecution(intent, userId) {
  const text = String(intent || '').toLowerCase();
  const keywordMap = [
    { keywords: ['clean', 'sanitize', 'home'], category: 'Home Care' },
    { keywords: ['repair', 'fix', 'diagnostic', 'maintenance'], category: 'Repairs' },
    { keywords: ['car', 'bike', 'vehicle', 'wash'], category: 'Auto Care' },
    { keywords: ['meal', 'fashion', 'groom', 'lifestyle', 'event'], category: 'Lifestyle' },
    { keywords: ['garden', 'plant', 'solar', 'outdoor'], category: 'Outdoor' },
    { keywords: ['delivery', 'pickup', 'errand', 'move', 'grocery'], category: 'Errands' }
  ];

  const categories = keywordMap
    .filter((item) => item.keywords.some((word) => text.includes(word)))
    .map((item) => item.category);

  let candidates = serviceCatalog.filter((service) => categories.includes(service.category));
  if (!candidates.length) {
    candidates = getServiceWithRatings(userId).slice(0, 4);
  }
  candidates = candidates.slice(0, 4);

  const tasks = candidates.map((service, index) => ({
    order: index + 1,
    serviceId: service.id,
    title: service.title,
    provider: service.provider,
    estimatedCost: service.price,
    estimatedMinutes: service.etaMinutes,
    notes: `Prep window ${9 + index}:00-${10 + index}:00 and confirm access details.`
  }));

  const baseBudget = tasks.reduce((sum, task) => sum + task.estimatedCost, 0);
  const timeline = tasks.map((task, index) => ({
    step: task.title,
    etaMinutes: task.estimatedMinutes,
    offsetDays: Math.floor(index / 2)
  }));

  const providerTrust = buildBehavioralTrustScores();
  const trustMap = new Map(providerTrust.map((item) => [item.provider, item]));
  const recommendedProviders = [...new Set(tasks.map((task) => task.provider))]
    .map((provider) => ({
      provider,
      reliabilityScore: trustMap.get(provider)?.reliabilityScore || 72
    }))
    .sort((a, b) => b.reliabilityScore - a.reliabilityScore);

  return {
    intent: String(intent || '').trim(),
    taskBreakdown: tasks,
    budget: {
      baseline: Number(baseBudget.toFixed(2)),
      lower: Number((baseBudget * 0.92).toFixed(2)),
      upper: Number((baseBudget * 1.18).toFixed(2))
    },
    timeline,
    recommendedProviders,
    suggestedCircle: {
      title: `Planned Task Circle - ${new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}`,
      services: tasks.map((task) => task.serviceId),
      providers: recommendedProviders.map((item) => item.provider),
      targetDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    },
    assumptions: [
      'Budget includes median provider quotes and demand-adjusted pricing.',
      'Timeline assumes sequential execution with one overlap slot buffer.',
      'Recommendations prioritize reliability score and sustainability fit.'
    ]
  };
}

function hydrateCircle(circleRow) {
  const messages = db
    .prepare(
      'SELECT m.id, m.message, m.created_at AS createdAt, u.name AS senderName FROM task_circle_messages m JOIN users u ON u.id = m.sender_user_id WHERE m.circle_id = ? ORDER BY m.created_at ASC LIMIT 200'
    )
    .all(circleRow.id);
  const checklist = db
    .prepare(
      'SELECT id, item_text AS itemText, assigned_to AS assignedTo, is_done AS isDone, created_at AS createdAt FROM task_circle_checklist WHERE circle_id = ? ORDER BY created_at ASC'
    )
    .all(circleRow.id)
    .map((item) => ({ ...item, isDone: Boolean(item.isDone) }));

  return {
    id: circleRow.id,
    ownerUserId: circleRow.owner_user_id,
    title: circleRow.title,
    objective: circleRow.objective,
    targetDate: circleRow.target_date,
    status: circleRow.status,
    services: parseJSON(circleRow.services_json, []),
    providers: parseJSON(circleRow.providers_json, []),
    budgetEstimate: Number(circleRow.budget_estimate),
    timeline: parseJSON(circleRow.timeline_json, []),
    createdAt: circleRow.created_at,
    updatedAt: circleRow.updated_at,
    messages,
    checklist
  };
}

function getCircleForOwner(circleId, userId) {
  const row = db.prepare('SELECT * FROM task_circles WHERE id = ? AND owner_user_id = ?').get(circleId, userId);
  return row ? hydrateCircle(row) : null;
}

function expireCouponsForUser(userId) {
  const nowIso = new Date().toISOString();
  db.prepare("UPDATE coupons SET status = 'expired' WHERE user_id = ? AND status = 'active' AND expires_at <= ?").run(
    userId,
    nowIso
  );
}

function getActiveCouponForUser(userId) {
  expireCouponsForUser(userId);
  const nowIso = new Date().toISOString();
  return db
    .prepare(
      `SELECT
        id,
        user_id AS userId,
        code,
        source,
        discount_pct AS discountPct,
        status,
        redeemed_at AS redeemedAt,
        expires_at AS expiresAt,
        used_at AS usedAt,
        used_booking_id AS usedBookingId,
        created_at AS createdAt,
        meta_json AS metaJson
      FROM coupons
      WHERE user_id = ? AND status = 'active' AND expires_at > ?
      ORDER BY created_at DESC
      LIMIT 1`
    )
    .get(userId, nowIso);
}

function getEcofixStatsForUser(userId, playedOn) {
  const anchorDay = String(playedOn || new Date().toISOString().slice(0, 10));
  const anchorDate = new Date(`${anchorDay}T00:00:00.000Z`);
  if (Number.isNaN(anchorDate.getTime())) {
    return {
      todaySession: null,
      recentCount: 0,
      averageScore: 0
    };
  }

  const recentStart = new Date(anchorDate.getTime());
  recentStart.setUTCDate(recentStart.getUTCDate() - 6);
  const recentStartKey = recentStart.toISOString().slice(0, 10);

  const todaySession = db
    .prepare(
      `SELECT
        final_score AS finalScore,
        base_score AS baseScore,
        root_bonus AS rootBonus,
        speed_bonus AS speedBonus,
        streak_bonus AS streakBonus,
        root_selected AS rootSelected,
        scenario_day AS scenarioDay,
        played_on AS playedOn,
        completed_at AS completedAt
      FROM ecofix_sessions
      WHERE user_id = ? AND played_on = ?
      ORDER BY completed_at DESC
      LIMIT 1`
    )
    .get(userId, anchorDay);

  const recent = db
    .prepare(
      `SELECT
        COUNT(*) AS count,
        AVG(final_score) AS avgScore
      FROM ecofix_sessions
      WHERE user_id = ? AND played_on >= ?`
    )
    .get(userId, recentStartKey);

  return {
    todaySession: todaySession
      ? {
          ...todaySession,
          rootSelected: Boolean(todaySession.rootSelected)
        }
      : null,
    recentCount: Number(recent?.count || 0),
    averageScore: Number(Number(recent?.avgScore || 0).toFixed(1))
  };
}

function computeEcofixOfferProfile(user) {
  const userId = user.id;
  const swipeCount = Number(
    db.prepare('SELECT COUNT(*) AS count FROM swipes WHERE user_id = ?').get(userId)?.count || 0
  );
  const bookingCount = Number(
    db.prepare('SELECT COUNT(*) AS count FROM bookings WHERE user_id = ?').get(userId)?.count || 0
  );
  const paidCount = Number(
    db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM bookings b
         JOIN payments p ON p.booking_id = b.id
         WHERE b.user_id = ?`
      )
      .get(userId)?.count || 0
  );
  const reviewCount = Number(
    db.prepare('SELECT COUNT(*) AS count FROM reviews WHERE user_id = ?').get(userId)?.count || 0
  );
  const completionRate = bookingCount ? paidCount / bookingCount : 0;
  const reviewRate = paidCount ? reviewCount / paidCount : 0;
  const ecoPriority = Number(user?.preferences?.ecoPriority || 70);
  const budgetCap = Number(user?.preferences?.budgetCap || 150);
  const dayKey = new Date().toISOString().slice(0, 10);
  const ecofixStats = getEcofixStatsForUser(userId, dayKey);

  let score = 0;
  score += Math.min(24, swipeCount * 1.2);
  score += Math.min(22, bookingCount * 3);
  score += Math.min(18, paidCount * 2.5);
  score += Math.min(12, reviewCount * 2.2);
  score += Math.min(14, ecoPriority * 0.14);
  score += completionRate * 14;
  score += reviewRate * 10;
  score += budgetCap <= 140 ? 6 : 2;
  score += Math.min(16, ecofixStats.recentCount * 2.8);
  score += Math.min(10, ecofixStats.averageScore * 0.1);
  if (ecofixStats.todaySession) {
    score += Math.min(14, Number(ecofixStats.todaySession.finalScore || 0) * 0.16);
    if (ecofixStats.todaySession.rootSelected) {
      score += 4;
    }
  }
  score = Number(clamp(score, 0, 100).toFixed(1));

  const gateSeed = hashString(`${userId}:${dayKey}:ecofix-offer`);
  const randomGate = gateSeed % 100;
  const eligibilityThreshold = Math.round(clamp(18 + score * 0.58, 24, 82));
  const todayScore = Number(ecofixStats.todaySession?.finalScore || 0);
  const ecofixQualified = Boolean(ecofixStats.todaySession && todayScore >= 60);
  const eligible = ecofixQualified || (score >= 34 && randomGate < eligibilityThreshold);

  const discountSeed = hashString(`${userId}:${dayKey}:ecofix-discount`);
  const variableBoost = Math.round(clamp((score - 30) / 6, 0, 18));
  const todayBoost = ecofixQualified ? Math.round(clamp((todayScore - 60) / 4, 0, 8)) : 0;
  const discountPct = Math.round(clamp(10 + variableBoost + todayBoost + (discountSeed % 7), 10, 40));
  const factors = [
    `Swipe activity: ${swipeCount}`,
    `Booking history: ${bookingCount}`,
    `Completion rate: ${(completionRate * 100).toFixed(0)}%`,
    `Review participation: ${(reviewRate * 100).toFixed(0)}%`,
    `Eco priority: ${ecoPriority}`,
    ecofixStats.todaySession
      ? `EcoFix today: ${todayScore} (${ecofixStats.todaySession.rootSelected ? 'root cause selected' : 'no root cause'})`
      : 'EcoFix today: not played yet'
  ];

  return {
    eligible,
    score,
    discountPct,
    factors,
    threshold: eligibilityThreshold,
    randomGate,
    ecofixQualified,
    playedToday: Boolean(ecofixStats.todaySession),
    todayScore,
    recentEcofixDays: ecofixStats.recentCount
  };
}

function generateCouponCode(userId, discountPct) {
  const stamp = Date.now().toString(36).toUpperCase().slice(-4);
  const userToken = hashString(userId).toString(36).toUpperCase().slice(-3);
  const noise = nanoid(6).replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
  return `ECO${discountPct}-${userToken}${stamp}${noise}`;
}

function createPackageBookingsForUser(userId, config) {
  const serviceIds = [...new Set((config.serviceIds || []).filter((serviceId) => ensureService(serviceId)))].slice(0, 8);
  if (!serviceIds.length) {
    return null;
  }

  const title = String(config.title || 'Task Package').trim().slice(0, 90) || 'Task Package';
  const objective = String(config.objective || '').trim();
  const targetDate = String(config.targetDate || new Date().toISOString().slice(0, 10));
  const slot = TIME_SLOTS.includes(config.slot) ? config.slot : TIME_SLOTS[0];
  const packageId = `PKG-${Date.now().toString(36).toUpperCase()}-${nanoid(4).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}`;
  const createdAt = new Date().toISOString();

  const bookings = serviceIds.map((serviceId, index) => {
    const service = ensureService(serviceId);
    const notesParts = [`Task package: ${title}`, `Package ID: ${packageId}`, `Part ${index + 1}/${serviceIds.length}`];
    if (objective) {
      notesParts.push(`Objective: ${objective}`);
    }
    return {
      id: nanoid(12),
      userId,
      serviceId,
      scheduledDate: targetDate,
      slot,
      notes: notesParts.join(' | ').slice(0, 220),
      priceLocked: service.price,
      status: 'Pending',
      createdAt
    };
  });

  const tx = db.transaction(() => {
    const stmt = db.prepare(
      'INSERT INTO bookings (id, user_id, service_id, scheduled_date, slot, notes, price_locked, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    bookings.forEach((booking) => {
      stmt.run(
        booking.id,
        booking.userId,
        booking.serviceId,
        booking.scheduledDate,
        booking.slot,
        booking.notes,
        booking.priceLocked,
        booking.status,
        booking.createdAt
      );
    });
  });
  tx();

  const totalAmount = Number(bookings.reduce((sum, booking) => sum + Number(booking.priceLocked || 0), 0).toFixed(2));
  return {
    packageId,
    title,
    targetDate,
    slot,
    totalAmount,
    serviceCount: bookings.length,
    bookingIds: bookings.map((booking) => booking.id),
    bookings
  };
}

function computeProviderStats() {
  const reviewRows = db.prepare('SELECT service_id AS serviceId, rating FROM reviews').all();
  const bookingRows = db
    .prepare('SELECT service_id AS serviceId, price_locked AS priceLocked, slot FROM bookings')
    .all();

  const reviewByService = new Map();
  reviewRows.forEach((row) => {
    if (!reviewByService.has(row.serviceId)) {
      reviewByService.set(row.serviceId, []);
    }
    reviewByService.get(row.serviceId).push(Number(row.rating));
  });

  const providerMap = new Map();
  serviceCatalog.forEach((service) => {
    if (!providerMap.has(service.provider)) {
      providerMap.set(service.provider, {
        provider: service.provider,
        totalSustainability: 0,
        serviceCount: 0,
        ratingAccumulator: 0,
        ratingCount: 0,
        jobs: 0,
        revenue: 0,
        carbonSavedKg: 0
      });
    }
    const provider = providerMap.get(service.provider);
    provider.totalSustainability += service.sustainabilityScore;
    provider.serviceCount += 1;

    const ratings = reviewByService.get(service.id) || [];
    ratings.forEach((rating) => {
      provider.ratingAccumulator += rating;
      provider.ratingCount += 1;
    });
  });

  bookingRows.forEach((booking) => {
    const service = ensureService(booking.serviceId);
    if (!service) {
      return;
    }
    const provider = providerMap.get(service.provider);
    provider.jobs += 1;
    provider.revenue += Number(booking.priceLocked);
    provider.carbonSavedKg += bookingCarbonModel(service, booking).carbonSavedKg;
  });

  const trustMap = new Map(buildBehavioralTrustScores().map((item) => [item.provider, item]));

  return [...providerMap.values()].map((provider) => {
    const sustainability = provider.serviceCount
      ? provider.totalSustainability / provider.serviceCount
      : 0;
    const rating = provider.ratingCount ? provider.ratingAccumulator / provider.ratingCount : 4.2;
    const utilizationBoost = Math.min(10, provider.jobs * 0.5);
    const score = Number((sustainability * 0.55 + rating * 9 + utilizationBoost).toFixed(1));
    const trust = trustMap.get(provider.provider);
    return {
      provider: provider.provider,
      sustainability: Number(sustainability.toFixed(1)),
      rating: Number(rating.toFixed(1)),
      score,
      reliabilityScore: trust?.reliabilityScore || 72,
      jobs: provider.jobs,
      revenue: Number(provider.revenue.toFixed(2)),
      carbonSavedKg: Number(provider.carbonSavedKg.toFixed(2))
    };
  });
}

function calculateImpactReceipt(service, bookingPrice, bookingMeta = {}) {
  const bookingCarbon = bookingCarbonModel(service, bookingMeta);
  const moneySaved = Number(service.lifecycleSavings.toFixed(2));
  const carbonSaved = Number(bookingCarbon.carbonSavedKg.toFixed(2));
  const timeSavedMinutes = Math.max(0, service.baselineEtaMinutes - service.etaMinutes);
  const confidence = Math.min(98, Math.max(68, service.dataConfidence));
  const baseAmount = Number(bookingMeta.baseAmount || bookingPrice || 0);
  const discountAmount = Number(bookingMeta.discountAmount || 0);
  const discountPct =
    baseAmount > 0 ? Number((((discountAmount / baseAmount) * 100) || bookingMeta.discountPct || 0).toFixed(2)) : 0;
  const couponCode = String(bookingMeta.discountCode || '').trim();

  return {
    serviceId: service.id,
    carbonSavedKg: carbonSaved,
    moneySaved,
    timeSavedMinutes,
    baseline: {
      traditionalCost: service.baselinePrice,
      traditionalCarbonKg: bookingCarbon.baselineCarbonKg,
      traditionalEtaMinutes: service.baselineEtaMinutes
    },
    serviceCarbonKg: bookingCarbon.serviceCarbonKg,
    booking: {
      paidNow: Number(bookingPrice),
      baseAmount: Number(baseAmount.toFixed(2)),
      discountAmount: Number(discountAmount.toFixed(2)),
      discountPct,
      couponCode,
      expectedLifetimeValueGain: Number((moneySaved + carbonSaved * 1.5).toFixed(2))
    },
    breakdown: {
      traditionalTransportKg: Number(
        (service.carbonBreakdown?.traditional?.transportKg * bookingCarbon.slotTrafficMultiplier || 0).toFixed(2)
      ),
      traditionalOperationsKg: Number(service.carbonBreakdown?.traditional?.operationsKg || 0),
      ecoTransportKg: Number((service.carbonBreakdown?.eco?.transportKg * (0.92 + (bookingCarbon.slotTrafficMultiplier - 1) * 0.45) || 0).toFixed(2)),
      ecoOperationsKg: Number(service.carbonBreakdown?.eco?.operationsKg || 0)
    },
    confidence,
    methodology:
      'Model uses benchmark tables (service_benchmarks) and provider evidence tables (provider_sustainability_evidence), plus slot traffic multipliers.'
  };
}

function computeDynamicBundleLimit(userId, upcomingCount, candidateCount) {
  const swipeCount = Number(
    db.prepare('SELECT COUNT(*) AS count FROM swipes WHERE user_id = ?').get(userId)?.count || 0
  );
  const bookingCount = Number(
    db.prepare('SELECT COUNT(*) AS count FROM bookings WHERE user_id = ?').get(userId)?.count || 0
  );
  const categorySet = new Set(
    db
      .prepare('SELECT DISTINCT service_id AS serviceId FROM bookings WHERE user_id = ?')
      .all(userId)
      .map((row) => ensureService(row.serviceId)?.category)
      .filter(Boolean)
  );
  const categoryCount = categorySet.size;

  let dynamic = 3;
  dynamic += Math.min(3, Math.floor(Number(upcomingCount || 0) / 2));
  if (swipeCount >= 15) dynamic += 1;
  if (swipeCount >= 45) dynamic += 1;
  if (bookingCount >= 6) dynamic += 1;
  if (categoryCount >= 3) dynamic += 1;

  const capped = clamp(dynamic, 3, 8);
  const candidates = Math.max(1, Number(candidateCount || 0));
  return Math.min(capped, candidates);
}

const BUNDLE_CATEGORY_COMPANIONS = {
  'Home Care': ['Repairs', 'Lifestyle', 'Outdoor'],
  Repairs: ['Home Care', 'Auto Care', 'Errands'],
  'Auto Care': ['Repairs', 'Errands', 'Lifestyle'],
  Lifestyle: ['Home Care', 'Errands', 'Outdoor'],
  Outdoor: ['Home Care', 'Errands', 'Lifestyle'],
  Errands: ['Home Care', 'Lifestyle', 'Repairs']
};

function bundleSeedJitter(seedKey, valueKey, scale = 8) {
  const ratio = (hashString(`${seedKey}:${valueKey}`) % 1000) / 1000;
  return (ratio - 0.5) * 2 * scale;
}

function resolveSuggestedDate(baseDateISO, offsetDays = 0) {
  const base = new Date(baseDateISO || new Date().toISOString().slice(0, 10));
  if (Number.isNaN(base.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  base.setDate(base.getDate() + Math.max(0, Number(offsetDays || 0)));
  return base.toISOString().slice(0, 10);
}

function resolveSuggestedSlot(baseHour, urgencyMode, seedKey, offset = 0) {
  const currentHour = new Date().getHours();
  const urgencyBase = clamp(currentHour + 1 + Number(offset || 0), 9, 19);
  const balancedBase = clamp(Number(baseHour || 11) + Number(offset || 0), 9, 19);
  const jitter = Math.round(bundleSeedJitter(seedKey, `slot-${offset}`, 2.4));
  const start = clamp((urgencyMode ? urgencyBase : balancedBase) + jitter, 9, 19);
  return `${start}:00-${start + 1}:00`;
}

function bundleReasonLabel(baseService, addOnService, preferences, companionBoost) {
  if (Number(companionBoost || 0) >= 12) {
    return `High-synergy pair: ${baseService.category} + ${addOnService.category} improves route density and completion velocity.`;
  }
  if (preferences.urgencyMode) {
    return 'Urgency mode active: this pairing prioritizes faster dispatch with high completion confidence.';
  }
  if (preferences.ecoPriority >= 80) {
    return 'Eco-priority blend: selected for higher sustainability impact while keeping spend efficient.';
  }
  return 'Personalized from your booking history, swipe intent, and live demand shifts.';
}

function getBundleSuggestions(userId, limit = null, seedInput = '') {
  const user = getUserById(userId);
  const preferences = {
    ecoPriority: Number(user?.preferences?.ecoPriority || 70),
    budgetCap: Number(user?.preferences?.budgetCap || 170),
    urgencyMode: Boolean(user?.preferences?.urgencyMode)
  };
  const today = new Date().toISOString().slice(0, 10);

  const swipeRows = db
    .prepare(
      'SELECT service_id AS serviceId, action, created_at AS createdAt FROM swipes WHERE user_id = ? ORDER BY created_at DESC LIMIT 280'
    )
    .all(userId);
  const allBookings = db
    .prepare(
      'SELECT id, service_id AS serviceId, scheduled_date AS scheduledDate, slot, price_locked AS priceLocked, created_at AS createdAt FROM bookings WHERE user_id = ? ORDER BY created_at DESC'
    )
    .all(userId);
  const runtimeSeed = String(seedInput || today);
  const behaviorStamp = `${swipeRows.length}-${allBookings.length}-${preferences.ecoPriority}-${preferences.budgetCap}-${preferences.urgencyMode ? 1 : 0}`;
  const seedBase = `${userId}|${runtimeSeed}|${behaviorStamp}`;
  const focusRegionIndex = hashString(`${userId}:${today}`) % CITY_REGIONS.length;
  const focusRegion = CITY_REGIONS[focusRegionIndex];
  const regionPlan = [0, 1, 2, 3].map((offset) => CITY_REGIONS[(focusRegionIndex + offset) % CITY_REGIONS.length]);
  const upcoming = allBookings
    .filter((booking) => booking.scheduledDate >= today)
    .sort((a, b) => String(a.scheduledDate).localeCompare(String(b.scheduledDate)) || String(a.slot).localeCompare(String(b.slot)));

  const recentBookedServiceIds = new Set(allBookings.slice(0, 8).map((booking) => booking.serviceId));
  const allBookedServiceIds = new Set(allBookings.map((booking) => booking.serviceId));

  const serviceSwipeSignal = new Map();
  const categorySwipeSignal = new Map();
  swipeRows.forEach((swipe, index) => {
    const service = ensureService(swipe.serviceId);
    if (!service) {
      return;
    }
    const decay = clamp(1 - index / 320, 0.25, 1);
    const weight = swipe.action === 'superlike' ? 3 : swipe.action === 'like' ? 2 : -1.35;
    serviceSwipeSignal.set(service.id, Number(serviceSwipeSignal.get(service.id) || 0) + weight * decay);
    categorySwipeSignal.set(service.category, Number(categorySwipeSignal.get(service.category) || 0) + weight * decay);
  });

  const rankedServices = getServiceWithRatings(userId)
    .map((service) => {
      const budgetFit = clamp(100 - Math.abs(Number(service.price || 0) - preferences.budgetCap) / 2.4, 0, 100);
      const ecoFit = clamp(100 - Math.abs(Number(service.sustainabilityScore || 0) - preferences.ecoPriority), 0, 100);
      const urgencyFit = preferences.urgencyMode
        ? clamp(110 - Number(service.etaMinutes || 0), 0, 100)
        : clamp(80 - Number(service.etaMinutes || 0) * 0.28, 20, 90);
      const demandFit = clamp(Number(service.demandIndex || 0), 0, 100);
      const ratingFit = service.reviewCount > 0 ? clamp(Number(service.avgRating || 0) * 20, 0, 100) : 62;
      const serviceAffinity = clamp(50 + Number(serviceSwipeSignal.get(service.id) || 0) * 10, 0, 100);
      const categoryAffinity = clamp(50 + Number(categorySwipeSignal.get(service.category) || 0) * 8, 0, 100);
      const repeatPenalty = recentBookedServiceIds.has(service.id) ? 8 : 0;
      const historicalBoost = allBookedServiceIds.has(service.id) ? 3 : 0;
      const jitter = bundleSeedJitter(seedBase, service.id, 6);
      const bundleScore =
        ecoFit * 0.24 +
        budgetFit * 0.21 +
        urgencyFit * 0.16 +
        demandFit * 0.14 +
        ratingFit * 0.1 +
        serviceAffinity * 0.1 +
        categoryAffinity * 0.05 +
        historicalBoost -
        repeatPenalty +
        jitter;

      return {
        ...service,
        bundleScore: Number(bundleScore.toFixed(2))
      };
    })
    .sort((a, b) => b.bundleScore - a.bundleScore)
    .slice(0, 16);

  const requestedLimit = Number(limit);
  const targetLimit = Number.isFinite(requestedLimit)
    ? clamp(Math.round(requestedLimit), 1, 8)
    : 4;

  function resolveArea(primaryId, addOnId, variant = 0) {
    const idx = hashString(`${seedBase}:${primaryId}:${addOnId}:${variant}`) % regionPlan.length;
    return regionPlan[idx];
  }

  function pickAddOnCandidates(primaryService, maxAddOns = 2) {
    const preferredCategories = BUNDLE_CATEGORY_COMPANIONS[primaryService.category] || [];
    return rankedServices
      .filter((candidate) => candidate.id !== primaryService.id)
      .map((candidate) => {
        const companionBoost = preferredCategories.includes(candidate.category) ? 14 : 0;
        const diversityBoost = candidate.provider !== primaryService.provider ? 3 : 0;
        const sameCategoryPenalty = candidate.category === primaryService.category ? 8 : 0;
        const repeatPenalty = recentBookedServiceIds.has(candidate.id) ? 6 : 0;
        const pairJitter = bundleSeedJitter(seedBase, `${primaryService.id}:${candidate.id}`, 5);
        const pairScore =
          Number(candidate.bundleScore || 0) +
          companionBoost +
          diversityBoost -
          sameCategoryPenalty -
          repeatPenalty +
          pairJitter;

        return {
          ...candidate,
          companionBoost,
          pairScore: Number(pairScore.toFixed(2))
        };
      })
      .sort((a, b) => b.pairScore - a.pairScore)
      .slice(0, maxAddOns);
  }

  const suggestions = [];
  const seenPairs = new Set();

  upcoming.slice(0, Math.min(4, targetLimit + 1)).forEach((booking, bookingIndex) => {
    const primaryService = ensureService(booking.serviceId);
    if (!primaryService) {
      return;
    }

    const addOns = pickAddOnCandidates(primaryService, 2);
    addOns.forEach((addOn, addIndex) => {
      const dateOffset = addIndex === 0 ? 0 : 1 + (bookingIndex % 2);
      const suggestedDate = resolveSuggestedDate(booking.scheduledDate, dateOffset);
      const slot = resolveSuggestedSlot(
        slotStartHour(booking.slot) + 1,
        preferences.urgencyMode,
        `${seedBase}:${booking.id}:${addOn.id}`,
        addIndex
      );
      const pairKey = `${primaryService.id}:${addOn.id}:${suggestedDate}:${slot}`;
      if (seenPairs.has(pairKey)) {
        return;
      }
      seenPairs.add(pairKey);
      const suggestedRegion = resolveArea(primaryService.id, addOn.id, bookingIndex * 2 + addIndex);

      const model = bookingCarbonModel(addOn, { slot });
      const comboFactor = 1 + clamp(addOn.companionBoost / 100, 0.04, 0.2);
      const projectedCarbonSavedKg = Number((Number(model.carbonSavedKg || 0) * comboFactor).toFixed(2));
      const projectedCostSaved = Number(
        (Number(addOn.lifecycleSavings || 0) * (0.5 + addOn.companionBoost / 160)).toFixed(2)
      );
      const regionBoost = suggestedRegion === focusRegion ? 8 : 3.5;
      const rankScore = addOn.pairScore + regionBoost + bundleSeedJitter(seedBase, pairKey, 1.8);
      suggestions.push({
        key: `${booking.id}-${addOn.id}-${hashString(pairKey)}`,
        primaryService: primaryService.title,
        addOnService: addOn.title,
        suggestedDate,
        suggestedSlot: slot,
        suggestedRegion,
        projectedCarbonSavedKg,
        projectedCostSaved,
        reason: `${bundleReasonLabel(primaryService, addOn, preferences, addOn.companionBoost)} Priority area: ${suggestedRegion}.`,
        rankScore: Number(rankScore.toFixed(2))
      });
    });
  });

  if (suggestions.length < targetLimit) {
    rankedServices.slice(0, Math.min(8, targetLimit + 3)).forEach((primaryService, index) => {
      if (suggestions.length >= targetLimit * 2) {
        return;
      }
      const addOn = pickAddOnCandidates(primaryService, 1)[0];
      if (!addOn) {
        return;
      }

      const suggestedDate = resolveSuggestedDate(today, 1 + (index % 5));
      const slot = resolveSuggestedSlot(
        preferences.urgencyMode ? 11 : 13,
        preferences.urgencyMode,
        `${seedBase}:fallback:${primaryService.id}:${addOn.id}`,
        index
      );
      const pairKey = `${primaryService.id}:${addOn.id}:${suggestedDate}:${slot}`;
      if (seenPairs.has(pairKey)) {
        return;
      }
      seenPairs.add(pairKey);
      const suggestedRegion = resolveArea(primaryService.id, addOn.id, index + 19);

      const model = bookingCarbonModel(addOn, { slot });
      const projectedCarbonSavedKg = Number((Number(model.carbonSavedKg || 0) * 0.94).toFixed(2));
      const projectedCostSaved = Number((Number(addOn.lifecycleSavings || 0) * 0.52).toFixed(2));
      const regionBoost = suggestedRegion === focusRegion ? 7 : 3;
      const rankScore = addOn.pairScore + primaryService.bundleScore + regionBoost + bundleSeedJitter(seedBase, pairKey, 1.5);

      suggestions.push({
        key: `pair-${primaryService.id}-${addOn.id}-${hashString(pairKey)}`,
        primaryService: primaryService.title,
        addOnService: addOn.title,
        suggestedDate,
        suggestedSlot: slot,
        suggestedRegion,
        projectedCarbonSavedKg,
        projectedCostSaved,
        reason: `Dynamic pair generated from your profile, live swipes, and ${suggestedRegion} area demand.`,
        rankScore: Number(rankScore.toFixed(2))
      });
    });
  }

  const sorted = suggestions
    .slice()
    .sort((a, b) => Number(b.rankScore || 0) - Number(a.rankScore || 0));

  if (Number.isFinite(requestedLimit)) {
    return sorted.slice(0, targetLimit).map(({ rankScore, ...item }) => item);
  }

  const curated = [];
  const usedKeys = new Set();
  const exclusive =
    sorted.find((item) => item.suggestedRegion === focusRegion) ||
    sorted[0];

  if (exclusive) {
    usedKeys.add(exclusive.key);
    curated.push({
      ...exclusive,
      isExclusiveToday: true,
      offerLabel: 'Exclusive Pair of the Day'
    });
  }

  regionPlan.slice(1, 4).forEach((region) => {
    const regionalPick =
      sorted.find((item) => !usedKeys.has(item.key) && item.suggestedRegion === region) ||
      sorted.find((item) => !usedKeys.has(item.key));
    if (!regionalPick) {
      return;
    }
    usedKeys.add(regionalPick.key);
    curated.push({
      ...regionalPick,
      isExclusiveToday: false,
      areaBundle: true,
      offerLabel: `Area Pick: ${region}`
    });
  });

  return curated.slice(0, 4).map(({ rankScore, ...item }) => item);
}

function addNotification(userId, type, title, message, meta = {}) {
  const notification = {
    id: nanoid(14),
    userId,
    type,
    title,
    message,
    metaJson: JSON.stringify(meta),
    createdAt: new Date().toISOString()
  };

  db.prepare(
    'INSERT INTO notifications (id, user_id, type, title, message, is_read, meta_json, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)'
  ).run(
    notification.id,
    notification.userId,
    notification.type,
    notification.title,
    notification.message,
    notification.metaJson,
    notification.createdAt
  );

  return notification;
}

function getServiceWithRatings(userId) {
  const ratingRows = db
    .prepare(
      'SELECT service_id AS serviceId, COUNT(*) AS reviewCount, ROUND(AVG(rating), 1) AS avgRating FROM reviews GROUP BY service_id'
    )
    .all();

  const ratingMap = new Map(
    ratingRows.map((row) => [row.serviceId, { reviewCount: row.reviewCount, avgRating: Number(row.avgRating || 0) }])
  );

  const userBookings = db.prepare('SELECT DISTINCT service_id AS serviceId FROM bookings WHERE user_id = ?').all(userId);
  const bookedSet = new Set(userBookings.map((row) => row.serviceId));

  return serviceCatalog.map((service) => {
    const stats = ratingMap.get(service.id) || { reviewCount: 0, avgRating: 0 };
    return {
      ...service,
      reviewCount: stats.reviewCount,
      avgRating: stats.avgRating,
      userBooked: bookedSet.has(service.id)
    };
  });
}

app.get('/api/meta', authRequired, (req, res) => {
  return res.json({
    timeSlots: TIME_SLOTS,
    accentOptions: ACCENT_OPTIONS,
    paymentMethods: PAYMENT_METHODS,
    insightWindows: INSIGHT_WINDOWS,
    cityRegions: CITY_REGIONS,
    dayParts: DAY_PARTS.map((item) => item.key),
    calibration: {
      source: calibrationState.source,
      loadedAt: calibrationState.loadedAt,
      benchmarkCount: calibrationState.benchmarkCount,
      providerEvidenceCount: calibrationState.providerEvidenceCount
    },
    serviceCount: serviceCatalog.length
  });
});

app.get('/api/data-foundation', authRequired, (req, res) => {
  return res.json({
    calibration: calibrationState,
    benchmarks: [...categoryBenchmarkMap.values()],
    providerEvidence: [...providerEvidenceMap.values()].map((item) => ({
      provider: item.provider,
      vehicleType: item.vehicleType,
      renewableEnergyPct: item.renewableEnergyPct,
      wasteDiversionPct: item.wasteDiversionPct,
      materialReusePct: item.materialReusePct,
      routeEfficiencyPct: item.routeEfficiencyPct,
      onTimeRatePct: item.onTimeRatePct,
      completionRatePct: item.completionRatePct,
      responseTimeMin: item.responseTimeMin,
      verifiedLevel: item.verifiedLevel
    }))
  });
});

app.get('/api/goals', authRequired, (req, res) => {
  const goal = getUserGoal(req.user.id);
  return res.json({ goal });
});

app.put(
  '/api/goals',
  authRequired,
  csrfRequired,
  [
    body('monthlyCarbonGoal').isFloat({ min: 5, max: 250 }),
    body('monthlySpendGoal').isFloat({ min: 50, max: 5000 })
  ],
  (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }

    ensureUserGoal(req.user.id);
    db.prepare(
      'UPDATE user_goals SET monthly_carbon_goal = ?, monthly_spend_goal = ?, updated_at = ? WHERE user_id = ?'
    ).run(
      Number(req.body.monthlyCarbonGoal),
      Number(req.body.monthlySpendGoal),
      new Date().toISOString(),
      req.user.id
    );

    return res.json({ goal: getUserGoal(req.user.id) });
  }
);

app.get(
  '/api/suggestions/bundles',
  authRequired,
  [query('limit').optional().isInt({ min: 1, max: 8 }), query('seed').optional().isLength({ min: 1, max: 64 })],
  (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }
    const requestedLimit = req.query.limit ? Number(req.query.limit) : null;
    const seed = req.query.seed ? String(req.query.seed) : '';
    return res.json({ suggestions: getBundleSuggestions(req.user.id, requestedLimit, seed) });
  }
);

app.get(
  '/api/simulator',
  authRequired,
  [
    query('serviceId').isString().isLength({ min: 1, max: 30 }),
    query('frequency').optional().isInt({ min: 1, max: 24 }),
    query('slot').optional().matches(/^\d{1,2}:00-\d{1,2}:00$/)
  ],
  (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }

    const service = ensureService(req.query.serviceId);
    if (!service) {
      return res.status(404).json({ error: 'Service not found.' });
    }

    const frequency = req.query.frequency ? Number(req.query.frequency) : 2;
    const slot = req.query.slot || '11:00-12:00';
    const model = bookingCarbonModel(service, { slot });
    const ecoMonthlySpend = Number((service.price * frequency).toFixed(2));
    const baselineMonthlySpend = Number((service.baselinePrice * frequency).toFixed(2));
    const ecoMonthlyCarbon = Number((model.serviceCarbonKg * frequency).toFixed(2));
    const baselineMonthlyCarbon = Number((model.baselineCarbonKg * frequency).toFixed(2));
    const ecoMonthlyTime = service.etaMinutes * frequency;
    const baselineMonthlyTime = service.baselineEtaMinutes * frequency;

    return res.json({
      simulation: {
        frequency,
        slot,
        service: {
          id: service.id,
          title: service.title
        },
        eco: {
          spend: ecoMonthlySpend,
          carbonKg: ecoMonthlyCarbon,
          minutes: ecoMonthlyTime
        },
        traditional: {
          spend: baselineMonthlySpend,
          carbonKg: baselineMonthlyCarbon,
          minutes: baselineMonthlyTime
        },
        delta: {
          spendSaved: Number((baselineMonthlySpend - ecoMonthlySpend).toFixed(2)),
          carbonSavedKg: Number((baselineMonthlyCarbon - ecoMonthlyCarbon).toFixed(2)),
          minutesSaved: Math.max(0, baselineMonthlyTime - ecoMonthlyTime)
        }
      },
      methodology: [
        'Traditional vs eco operations are benchmarked from service_benchmarks rows.',
        'Travel emissions use provider vehicle evidence and slot traffic multipliers.',
        'Trip distance scales with demand pressure and category route benchmarks.'
      ]
    });
  }
);

app.get(
  '/api/provider/analytics',
  authRequired,
  adminRequired,
  [query('window').optional().isInt({ min: 3, max: 12 })],
  (req, res) => {
  if (!requestValid(req, res)) {
    return;
  }
  const windowMonths = req.query.window ? Number(req.query.window) : 6;
  return res.json(buildProviderAnalyticsSuite(windowMonths));
  }
);

app.get('/api/providers/trust', authRequired, (req, res) => {
  const suite = buildBehavioralTrustSuite();
  return res.json(suite);
});

app.get('/api/market-architect', authRequired, [query('window').optional().isInt({ min: 3, max: 12 })], (req, res) => {
  if (!requestValid(req, res)) {
    return;
  }
  const windowMonths = req.query.window ? Number(req.query.window) : 6;
  return res.json({ architect: buildMarketArchitect(windowMonths) });
});

app.post(
  ['/api/ai/intent-plan', '/api/planner/intent-plan'],
  authRequired,
  csrfRequired,
  [body('intent').trim().isLength({ min: 8, max: 600 })],
  (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }
    const plan = aiIntentToExecution(req.body.intent, req.user.id);
    return res.json({ plan });
  }
);

app.post(
  '/api/ecofix/session',
  authRequired,
  csrfRequired,
  [
    body('playedOn').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
    body('scenarioDay').isIn(DAY_KEYS),
    body('finalScore').isFloat({ min: 0, max: 999 }),
    body('baseScore').optional().isFloat({ min: 0, max: 999 }),
    body('rootBonus').optional().isFloat({ min: 0, max: 999 }),
    body('speedBonus').optional().isFloat({ min: 0, max: 999 }),
    body('streakBonus').optional().isFloat({ min: 0, max: 999 }),
    body('rootSelected').optional().isBoolean().toBoolean()
  ],
  (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }

    const playedOn = String(req.body.playedOn || new Date().toISOString().slice(0, 10));
    const scenarioDay = String(req.body.scenarioDay || '').toLowerCase();
    const finalScore = Number(req.body.finalScore || 0);
    const baseScore = Number(req.body.baseScore || 0);
    const rootBonus = Number(req.body.rootBonus || 0);
    const speedBonus = Number(req.body.speedBonus || 0);
    const streakBonus = Number(req.body.streakBonus || 0);
    const rootSelected = Boolean(req.body.rootSelected);
    const completedAt = new Date().toISOString();

    const existing = db
      .prepare('SELECT id FROM ecofix_sessions WHERE user_id = ? AND played_on = ?')
      .get(req.user.id, playedOn);

    if (existing) {
      db.prepare(
        `UPDATE ecofix_sessions
         SET
           scenario_day = ?,
           final_score = ?,
           base_score = ?,
           root_bonus = ?,
           speed_bonus = ?,
           streak_bonus = ?,
           root_selected = ?,
           completed_at = ?
         WHERE id = ?`
      ).run(
        scenarioDay,
        finalScore,
        baseScore,
        rootBonus,
        speedBonus,
        streakBonus,
        rootSelected ? 1 : 0,
        completedAt,
        existing.id
      );
    } else {
      db.prepare(
        `INSERT INTO ecofix_sessions (
          id, user_id, played_on, scenario_day, final_score, base_score, root_bonus, speed_bonus, streak_bonus, root_selected, completed_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        nanoid(12),
        req.user.id,
        playedOn,
        scenarioDay,
        finalScore,
        baseScore,
        rootBonus,
        speedBonus,
        streakBonus,
        rootSelected ? 1 : 0,
        completedAt,
        completedAt
      );
    }

    const activeCoupon = getActiveCouponForUser(req.user.id);
    const offerProfile = computeEcofixOfferProfile(req.user);

    return res.json({
      recorded: true,
      session: {
        playedOn,
        scenarioDay,
        finalScore,
        rootSelected
      },
      offer: {
        hasActiveCoupon: Boolean(activeCoupon),
        offerEligible: !activeCoupon && offerProfile.eligible,
        suggestedDiscountPct: offerProfile.discountPct,
        playedToday: offerProfile.playedToday,
        todayScore: offerProfile.todayScore,
        unlockScoreTarget: 60,
        note: activeCoupon
          ? 'Active coupon already available. Use it in Payments.'
          : offerProfile.eligible
            ? 'Offer unlocked. Redeem your coupon from the home offer card.'
            : `Not unlocked yet. Reach score 60+ in EcoFix today. Current: ${offerProfile.todayScore}.`
      }
    });
  }
);

app.get('/api/offers/ecofix', authRequired, (req, res) => {
  const activeCoupon = getActiveCouponForUser(req.user.id);
  const offerProfile = computeEcofixOfferProfile(req.user);
  const now = Date.now();
  const active = activeCoupon
    ? {
        code: activeCoupon.code,
        discountPct: Number(activeCoupon.discountPct || 0),
        expiresAt: activeCoupon.expiresAt,
        expiresInHours: Number(
          Math.max(0, (new Date(activeCoupon.expiresAt).getTime() - now) / (1000 * 60 * 60)).toFixed(2)
        ),
        source: activeCoupon.source
      }
    : null;

  return res.json({
    hasActiveCoupon: Boolean(active),
    activeCoupon: active,
    offerEligible: !active && offerProfile.eligible,
    offer: !active
      ? {
          minDiscountPct: 10,
          maxDiscountPct: 40,
          discountPct: offerProfile.discountPct,
          expiresInHours: 24,
          locked: !offerProfile.eligible,
          unlockHint: 'Pick high-impact root-cause fixes in EcoFix to improve your unlock chance.'
        }
      : null,
    score: offerProfile.score,
    factors: offerProfile.factors,
    ecofix: {
      playedToday: offerProfile.playedToday,
      todayScore: offerProfile.todayScore,
      unlockScoreTarget: 60,
      qualifiedToday: offerProfile.ecofixQualified,
      recentDays: offerProfile.recentEcofixDays
    },
    note: active
      ? 'Active coupon available. Apply it in Payments before it expires.'
      : offerProfile.eligible
        ? 'You are eligible for today\'s EcoFix offer.'
        : offerProfile.playedToday
          ? `Not unlocked yet. Reach score 60+ in EcoFix today (current: ${offerProfile.todayScore}).`
          : `Unlock ${offerProfile.discountPct}% today by playing EcoFix and picking high-impact fixes.`
  });
});

app.post('/api/offers/ecofix/redeem', authRequired, csrfRequired, (req, res) => {
  const existingActive = getActiveCouponForUser(req.user.id);
  if (existingActive) {
    return res.status(409).json({ error: 'You already have an active coupon.' });
  }

  const offerProfile = computeEcofixOfferProfile(req.user);
  if (!offerProfile.eligible) {
    return res.status(403).json({ error: 'Offer is not unlocked yet for this account.' });
  }

  const redeemedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const discountPct = Number(clamp(Number(offerProfile.discountPct || 10), 10, 40));
  let code = generateCouponCode(req.user.id, discountPct);
  let attempts = 0;
  while (attempts < 4) {
    const exists = db.prepare('SELECT id FROM coupons WHERE code = ?').get(code);
    if (!exists) {
      break;
    }
    code = generateCouponCode(req.user.id, discountPct);
    attempts += 1;
  }

  const coupon = {
    id: nanoid(14),
    userId: req.user.id,
    code,
    source: 'ecofix',
    discountPct,
    status: 'active',
    redeemedAt,
    expiresAt,
    usedAt: null,
    usedBookingId: null,
    createdAt: redeemedAt,
    metaJson: JSON.stringify({
      score: offerProfile.score,
      factors: offerProfile.factors
    })
  };

  db.prepare(
    `INSERT INTO coupons (
      id, user_id, code, source, discount_pct, status, redeemed_at, expires_at, used_at, used_booking_id, created_at, meta_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    coupon.id,
    coupon.userId,
    coupon.code,
    coupon.source,
    coupon.discountPct,
    coupon.status,
    coupon.redeemedAt,
    coupon.expiresAt,
    coupon.usedAt,
    coupon.usedBookingId,
    coupon.createdAt,
    coupon.metaJson
  );

  addNotification(
    req.user.id,
    'offer',
    'EcoFix Coupon Redeemed',
    `${coupon.discountPct}% coupon ${coupon.code} unlocked. Valid for 24 hours.`,
    { code: coupon.code, discountPct: coupon.discountPct, expiresAt: coupon.expiresAt }
  );

  return res.status(201).json({
    coupon: {
      code: coupon.code,
      discountPct: coupon.discountPct,
      expiresAt: coupon.expiresAt,
      expiresInHours: 24
    }
  });
});

app.get(
  '/api/circles',
  authRequired,
  [query('status').optional().isIn(['all', 'active', 'archived'])],
  (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }
    const status = req.query.status || 'active';
    const rows =
      status === 'all'
        ? db
            .prepare('SELECT * FROM task_circles WHERE owner_user_id = ? ORDER BY created_at DESC')
            .all(req.user.id)
        : db
            .prepare('SELECT * FROM task_circles WHERE owner_user_id = ? AND status = ? ORDER BY created_at DESC')
            .all(req.user.id, status);
    return res.json({ circles: rows.map((row) => hydrateCircle(row)) });
  }
);

app.post(
  '/api/circles',
  authRequired,
  csrfRequired,
  [
    body('title').trim().isLength({ min: 4, max: 90 }).escape(),
    body('objective').optional().trim().isLength({ min: 0, max: 280 }).escape(),
    body('targetDate')
      .isISO8601()
      .custom((value) => value >= new Date().toISOString().slice(0, 10)),
    body('services').optional().isArray({ min: 0, max: 8 }),
    body('providers').optional().isArray({ min: 0, max: 8 }),
    body('budgetEstimate').optional().isFloat({ min: 0, max: 20000 })
  ],
  (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }

    const services = Array.isArray(req.body.services) ? req.body.services.filter((id) => ensureService(id)) : [];
    const providers = Array.isArray(req.body.providers)
      ? req.body.providers.filter((name) => typeof name === 'string').slice(0, 8)
      : [];
    const circle = {
      id: nanoid(14),
      ownerUserId: req.user.id,
      title: req.body.title,
      objective: req.body.objective || '',
      targetDate: req.body.targetDate,
      status: 'active',
      servicesJson: JSON.stringify(services),
      providersJson: JSON.stringify(providers),
      budgetEstimate: Number(req.body.budgetEstimate || 0),
      timelineJson: JSON.stringify([]),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.prepare(
      `INSERT INTO task_circles (
        id, owner_user_id, title, objective, target_date, status, services_json, providers_json, budget_estimate, timeline_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      circle.id,
      circle.ownerUserId,
      circle.title,
      circle.objective,
      circle.targetDate,
      circle.status,
      circle.servicesJson,
      circle.providersJson,
      circle.budgetEstimate,
      circle.timelineJson,
      circle.createdAt,
      circle.updatedAt
    );

    addNotification(
      req.user.id,
      'circle',
      'Collaboration Circle Created',
      `${circle.title} is live. Add messages and checklist items to coordinate providers.`,
      { circleId: circle.id }
    );

    return res.status(201).json({ circle: getCircleForOwner(circle.id, req.user.id) });
  }
);

app.post(
  '/api/planner/book-package',
  authRequired,
  csrfRequired,
  [
    body('title').trim().isLength({ min: 4, max: 90 }).escape(),
    body('objective').optional().trim().isLength({ min: 0, max: 280 }).escape(),
    body('targetDate')
      .isISO8601()
      .custom((value) => value >= new Date().toISOString().slice(0, 10)),
    body('slot').custom((value) => TIME_SLOTS.includes(value)),
    body('serviceIds').isArray({ min: 1, max: 8 })
  ],
  (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }

    const packageResult = createPackageBookingsForUser(req.user.id, {
      title: req.body.title,
      objective: req.body.objective || '',
      targetDate: req.body.targetDate,
      slot: req.body.slot,
      serviceIds: req.body.serviceIds
    });

    if (!packageResult) {
      return res.status(400).json({ error: 'No valid services available for package booking.' });
    }

    addNotification(
      req.user.id,
      'booking',
      'Task Package Created',
      `${packageResult.title} created with ${packageResult.serviceCount} services. Proceed to payment.`,
      { packageId: packageResult.packageId, bookingIds: packageResult.bookingIds }
    );

    return res.status(201).json({
      package: packageResult,
      message: 'Package booked. Complete payment to confirm all services.'
    });
  }
);

app.post(
  '/api/circles/:circleId/messages',
  authRequired,
  csrfRequired,
  [body('message').trim().isLength({ min: 1, max: 320 }).escape()],
  (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }
    const circle = getCircleForOwner(req.params.circleId, req.user.id);
    if (!circle) {
      return res.status(404).json({ error: 'Circle not found.' });
    }
    if (circle.status !== 'active') {
      return res.status(409).json({ error: 'Circle is archived.' });
    }

    const message = {
      id: nanoid(14),
      circleId: circle.id,
      senderUserId: req.user.id,
      message: req.body.message,
      createdAt: new Date().toISOString()
    };
    db.prepare(
      'INSERT INTO task_circle_messages (id, circle_id, sender_user_id, message, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(message.id, message.circleId, message.senderUserId, message.message, message.createdAt);
    db.prepare('UPDATE task_circles SET updated_at = ? WHERE id = ?').run(message.createdAt, circle.id);

    return res.status(201).json({ circle: getCircleForOwner(circle.id, req.user.id) });
  }
);

app.post(
  '/api/circles/:circleId/checklist',
  authRequired,
  csrfRequired,
  [body('itemText').trim().isLength({ min: 2, max: 180 }).escape(), body('assignedTo').optional().trim().isLength({ min: 0, max: 80 }).escape()],
  (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }
    const circle = getCircleForOwner(req.params.circleId, req.user.id);
    if (!circle) {
      return res.status(404).json({ error: 'Circle not found.' });
    }
    if (circle.status !== 'active') {
      return res.status(409).json({ error: 'Circle is archived.' });
    }

    const item = {
      id: nanoid(14),
      circleId: circle.id,
      itemText: req.body.itemText,
      assignedTo: req.body.assignedTo || '',
      createdAt: new Date().toISOString()
    };
    db.prepare(
      'INSERT INTO task_circle_checklist (id, circle_id, item_text, assigned_to, is_done, created_at) VALUES (?, ?, ?, ?, 0, ?)'
    ).run(item.id, item.circleId, item.itemText, item.assignedTo, item.createdAt);
    db.prepare('UPDATE task_circles SET updated_at = ? WHERE id = ?').run(item.createdAt, circle.id);

    return res.status(201).json({ circle: getCircleForOwner(circle.id, req.user.id) });
  }
);

app.post('/api/circles/:circleId/checklist/:itemId/toggle', authRequired, csrfRequired, (req, res) => {
  const circle = getCircleForOwner(req.params.circleId, req.user.id);
  if (!circle) {
    return res.status(404).json({ error: 'Circle not found.' });
  }
  const item = db
    .prepare('SELECT id, is_done AS isDone FROM task_circle_checklist WHERE id = ? AND circle_id = ?')
    .get(req.params.itemId, circle.id);
  if (!item) {
    return res.status(404).json({ error: 'Checklist item not found.' });
  }

  db.prepare('UPDATE task_circle_checklist SET is_done = ? WHERE id = ?').run(item.isDone ? 0 : 1, item.id);
  db.prepare('UPDATE task_circles SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), circle.id);
  return res.json({ circle: getCircleForOwner(circle.id, req.user.id) });
});

app.post('/api/circles/:circleId/archive', authRequired, csrfRequired, (req, res) => {
  const circle = getCircleForOwner(req.params.circleId, req.user.id);
  if (!circle) {
    return res.status(404).json({ error: 'Circle not found.' });
  }
  db.prepare("UPDATE task_circles SET status = 'archived', updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    circle.id
  );
  return res.json({ circle: getCircleForOwner(circle.id, req.user.id) });
});

app.post(
  '/api/circles/:circleId/book-package',
  authRequired,
  csrfRequired,
  [body('slot').optional().custom((value) => TIME_SLOTS.includes(value))],
  (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }
    const circle = getCircleForOwner(req.params.circleId, req.user.id);
    if (!circle) {
      return res.status(404).json({ error: 'Circle not found.' });
    }
    if (circle.status !== 'active') {
      return res.status(409).json({ error: 'Only active circles can be booked as package.' });
    }
    const serviceIds = (circle.services || []).filter((serviceId) => ensureService(serviceId));
    if (!serviceIds.length) {
      return res.status(409).json({ error: 'Add services to this circle before booking as package.' });
    }

    const packageResult = createPackageBookingsForUser(req.user.id, {
      title: circle.title,
      objective: circle.objective || '',
      targetDate: circle.targetDate,
      slot: req.body.slot || TIME_SLOTS[0],
      serviceIds
    });

    if (!packageResult) {
      return res.status(400).json({ error: 'Could not create package bookings from this circle.' });
    }

    addNotification(
      req.user.id,
      'booking',
      'Circle Package Created',
      `${circle.title} booked as package (${packageResult.serviceCount} services).`,
      { circleId: circle.id, packageId: packageResult.packageId, bookingIds: packageResult.bookingIds }
    );

    return res.status(201).json({
      package: packageResult,
      message: 'Circle package booked. Proceed to payment.'
    });
  }
);

app.get(
  '/api/notifications',
  authRequired,
  [query('status').optional().isIn(['all', 'unread']), query('limit').optional().isInt({ min: 1, max: 100 })],
  (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }

    const status = req.query.status || 'all';
    const limit = req.query.limit ? Number(req.query.limit) : 25;
    const rows =
      status === 'unread'
        ? db
            .prepare(
              'SELECT id, type, title, message, is_read AS isRead, meta_json AS metaJson, created_at AS createdAt FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC LIMIT ?'
            )
            .all(req.user.id, limit)
        : db
            .prepare(
              'SELECT id, type, title, message, is_read AS isRead, meta_json AS metaJson, created_at AS createdAt FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
            )
            .all(req.user.id, limit);

    const unreadCount = db
      .prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0')
      .get(req.user.id).count;

    return res.json({
      unreadCount,
      notifications: rows.map((row) => ({
        ...row,
        isRead: Boolean(row.isRead),
        meta: JSON.parse(row.metaJson || '{}')
      }))
    });
  }
);

app.post(
  '/api/notifications/mark-read',
  authRequired,
  csrfRequired,
  [body('notificationId').isString().isLength({ min: 1, max: 30 })],
  (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }

    const result = db
      .prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?')
      .run(req.body.notificationId, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    return res.json({ message: 'Notification marked as read.' });
  }
);

app.post('/api/notifications/mark-all-read', authRequired, csrfRequired, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(req.user.id);
  return res.json({ message: 'All notifications marked as read.' });
});

app.post(
  '/api/auth/register',
  authLimiter,
  [
    body('name').trim().isLength({ min: 2, max: 40 }).escape(),
    body('email').isEmail().normalizeEmail(),
    body('password')
      .isLength({ min: 10, max: 72 })
      .matches(/[A-Z]/)
      .matches(/[a-z]/)
      .matches(/[0-9]/)
      .matches(/[^A-Za-z0-9]/)
  ],
  async (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }

    const { name, email, password } = req.body;
    const existing = getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already in use.' });
    }

    const hash = await bcrypt.hash(password, 12);
    const user = {
      id: nanoid(12),
      name,
      email,
      passwordHash: hash,
      createdAt: new Date().toISOString(),
      preferences: {
        ecoPriority: 70,
        budgetCap: 150,
        urgencyMode: false,
        accent: 'sunset'
      }
    };

    db.prepare(
      'INSERT INTO users (id, name, email, password_hash, created_at, eco_priority, budget_cap, urgency_mode, accent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      user.id,
      user.name,
      user.email,
      user.passwordHash,
      user.createdAt,
      user.preferences.ecoPriority,
      user.preferences.budgetCap,
      user.preferences.urgencyMode ? 1 : 0,
      user.preferences.accent
    );
    ensureUserGoal(user.id);

    const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: TOKEN_TTL });
    const csrfToken = nanoid(24);
    setAuthCookies(res, token, csrfToken);

    return res.status(201).json({
      message: 'Account created.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: isAdminEmail(user.email) ? 'admin' : 'user',
        isAdmin: isAdminEmail(user.email),
        preferences: user.preferences
      },
      csrfToken
    });
  }
);

app.post(
  '/api/auth/login',
  authLimiter,
  [body('email').isEmail().normalizeEmail(), body('password').isLength({ min: 1 })],
  async (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }

    const { email, password } = req.body;
    const user = getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: TOKEN_TTL });
    const csrfToken = nanoid(24);
    setAuthCookies(res, token, csrfToken);

    return res.json({
      message: 'Logged in.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isAdmin: isAdminUser(user),
        preferences: user.preferences
      },
      csrfToken
    });
  }
);

app.post('/api/auth/logout', authRequired, csrfRequired, (req, res) => {
  clearAuthCookies(res);
  return res.json({ message: 'Logged out.' });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  const csrfToken = req.cookies.csrfToken || nanoid(24);
  setCookie(res, 'csrfToken', csrfToken);
  ensureUserGoal(req.user.id);

  return res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      isAdmin: isAdminUser(req.user),
      preferences: req.user.preferences
    },
    csrfToken
  });
});

app.put(
  '/api/preferences',
  authRequired,
  csrfRequired,
  [
    body('ecoPriority').isInt({ min: 0, max: 100 }),
    body('budgetCap').isInt({ min: 20, max: 1000 }),
    body('urgencyMode').isBoolean(),
    body('accent').isIn(ACCENT_OPTIONS)
  ],
  (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }

    db.prepare('UPDATE users SET eco_priority = ?, budget_cap = ?, urgency_mode = ?, accent = ? WHERE id = ?').run(
      req.body.ecoPriority,
      req.body.budgetCap,
      req.body.urgencyMode ? 1 : 0,
      req.body.accent,
      req.user.id
    );

    const updatedUser = getUserById(req.user.id);

    return res.json({ preferences: updatedUser.preferences });
  }
);

app.get('/api/services', authRequired, (req, res) => {
  const ecoPriority = Number.isFinite(Number(req.query.ecoPriority))
    ? clamp(Number(req.query.ecoPriority), 0, 100)
    : req.user.preferences.ecoPriority;
  const budgetCap = Number.isFinite(Number(req.query.budgetCap))
    ? clamp(Number(req.query.budgetCap), 20, 1000)
    : req.user.preferences.budgetCap;
  const urgencyMode =
    typeof req.query.urgencyMode === 'string'
      ? req.query.urgencyMode === 'true'
      : req.user.preferences.urgencyMode;
  const providerScoreMap = new Map(computeProviderStats().map((item) => [item.provider, item]));

  const ranked = getServiceWithRatings(req.user.id)
    .map((service) => {
      const budgetFit = Math.max(0, 100 - Math.abs(service.price - budgetCap) / 2);
      const ecoFit = (service.sustainabilityScore * ecoPriority) / 100;
      const urgencyFit = urgencyMode ? Math.max(0, 100 - service.etaMinutes) : 50;
      const ratingBoost = service.avgRating * 10;
      const personalizationScore = Math.round(ecoFit * 0.4 + budgetFit * 0.3 + urgencyFit * 0.2 + ratingBoost * 0.1);
      const providerStats = providerScoreMap.get(service.provider);
      const providerScore = providerStats ? providerStats.score : 72;
      const ecoTwinScore = Math.round(
        service.carbonSavedKg * 9 + service.lifecycleSavings * 0.9 + service.sustainabilityScore * 0.6 + providerScore * 0.5
      );
      return {
        ...service,
        personalizationScore,
        providerScore,
        ecoTwinScore,
        impact: {
          carbonSavedKg: service.carbonSavedKg,
          baselineCarbonKg: service.baselineCarbonKg,
          serviceCarbonKg: service.serviceCarbonKg,
          lifecycleSavings: service.lifecycleSavings,
          baselinePrice: service.baselinePrice,
          dataConfidence: service.dataConfidence
        }
      };
    })
    .sort((a, b) => b.personalizationScore - a.personalizationScore);

  const minEcoThreshold = Math.round(35 + ecoPriority * 0.55);
  const maxBudget = budgetCap + 10;
  let filtered = ranked.filter(
    (service) => service.sustainabilityScore >= minEcoThreshold && service.price <= maxBudget
  );

  if (filtered.length < 6) {
    const budgetOnly = ranked.filter((service) => service.price <= maxBudget);
    const ecoOnly = ranked.filter((service) => service.sustainabilityScore >= minEcoThreshold);
    filtered = budgetOnly.length >= ecoOnly.length ? budgetOnly : ecoOnly;
  }

  if (filtered.length === 0) {
    filtered = ranked.slice(0, 8);
  }

  if (filtered.length < 20) {
    const seen = new Set(filtered.map((service) => service.id));
    ranked.forEach((service) => {
      if (filtered.length >= 20) {
        return;
      }
      if (!seen.has(service.id)) {
        filtered.push(service);
        seen.add(service.id);
      }
    });
  }

  return res.json({
    services: filtered,
    filters: {
      ecoPriority,
      budgetCap,
      urgencyMode,
      minEcoThreshold,
      maxBudget
    }
  });
});

app.post(
  '/api/swipes',
  authRequired,
  csrfRequired,
  [body('serviceId').isString().isLength({ min: 1, max: 30 }), body('action').isIn(['like', 'skip', 'superlike'])],
  (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }

    const { serviceId, action } = req.body;
    const service = ensureService(serviceId);
    if (!service) {
      return res.status(404).json({ error: 'Service not found.' });
    }

    const swipe = {
      id: nanoid(10),
      userId: req.user.id,
      serviceId,
      action,
      createdAt: new Date().toISOString()
    };

    db.prepare('INSERT INTO swipes (id, user_id, service_id, action, created_at) VALUES (?, ?, ?, ?, ?)').run(
      swipe.id,
      swipe.userId,
      swipe.serviceId,
      swipe.action,
      swipe.createdAt
    );

    if (swipe.action === 'superlike') {
      addNotification(
        req.user.id,
        'superlike',
        'Superlike Captured',
        `You superliked ${service.title}.`,
        { serviceId: service.id, action: swipe.action }
      );
    }

    return res.status(201).json({ message: 'Swipe captured.', swipe });
  }
);

app.post(
  '/api/bookings',
  authRequired,
  csrfRequired,
  [
    body('serviceId').isString().isLength({ min: 1, max: 30 }),
    body('scheduledDate')
      .isISO8601()
      .custom((value) => {
        const selected = new Date(`${value}T00:00:00`);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return selected >= today;
      }),
    body('slot').custom((value) => TIME_SLOTS.includes(value)),
    body('notes').optional().isLength({ max: 220 }).trim().escape()
  ],
  (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }

    const service = ensureService(req.body.serviceId);
    if (!service) {
      return res.status(404).json({ error: 'Service not found.' });
    }

    const booking = {
      id: nanoid(12),
      userId: req.user.id,
      serviceId: service.id,
      scheduledDate: req.body.scheduledDate,
      slot: req.body.slot,
      notes: req.body.notes || '',
      priceLocked: service.price,
      status: 'Pending',
      createdAt: new Date().toISOString()
    };

    db.prepare(
      'INSERT INTO bookings (id, user_id, service_id, scheduled_date, slot, notes, price_locked, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      booking.id,
      booking.userId,
      booking.serviceId,
      booking.scheduledDate,
      booking.slot,
      booking.notes,
      booking.priceLocked,
      booking.status,
      booking.createdAt
    );

    addNotification(
      req.user.id,
      'booking',
      'Booking Confirmed',
      `${service.title} booked for ${booking.scheduledDate} at ${booking.slot}.`,
      { bookingId: booking.id, serviceId: service.id }
    );

    const existingSameDay = db
      .prepare('SELECT slot, service_id AS serviceId FROM bookings WHERE user_id = ? AND scheduled_date = ? AND id != ?')
      .all(req.user.id, booking.scheduledDate, booking.id);
    const currentStart = Number(String(booking.slot).split(':')[0]);
    const adjacent = existingSameDay.find((item) => {
      const start = Number(String(item.slot).split(':')[0]);
      return Math.abs(start - currentStart) === 1;
    });
    const bundleHint = adjacent
      ? {
          message: 'You already have a nearby slot. Consider combining prep time to reduce transit emissions.',
          pairedService: ensureService(adjacent.serviceId)?.title || 'Another booking'
        }
      : null;

    return res.status(201).json({
      booking,
      bundleHint,
      message: 'Booking created. Complete payment to unlock receipt.'
    });
  }
);

app.post(
  '/api/bookings/bundle',
  authRequired,
  csrfRequired,
  [
    body('primaryServiceId').isString().isLength({ min: 1, max: 30 }),
    body('addOnServiceId')
      .isString()
      .isLength({ min: 1, max: 30 })
      .custom((value, { req }) => {
        if (value === req.body.primaryServiceId) {
          throw new Error('Bundle requires two different services.');
        }
        return true;
      }),
    body('scheduledDate')
      .isISO8601()
      .custom((value) => {
        const selected = new Date(`${value}T00:00:00`);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return selected >= today;
      }),
    body('slot').custom((value) => TIME_SLOTS.includes(value)),
    body('notes').optional().isLength({ max: 220 }).trim().escape()
  ],
  (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }

    const primaryService = ensureService(req.body.primaryServiceId);
    const addOnService = ensureService(req.body.addOnServiceId);
    if (!primaryService || !addOnService) {
      return res.status(404).json({ error: 'One or more services were not found.' });
    }

    const bundleLabel = `${primaryService.title} + ${addOnService.title}`;
    const userNote = String(req.body.notes || '').trim();
    const now = new Date().toISOString();
    const servicePair = [
      { service: primaryService, role: 'Primary' },
      { service: addOnService, role: 'Add-on' }
    ];
    const bookings = servicePair.map(({ service, role }) => ({
      id: nanoid(12),
      userId: req.user.id,
      serviceId: service.id,
      scheduledDate: req.body.scheduledDate,
      slot: req.body.slot,
      notes: [`Bundle booking: ${bundleLabel}`, `${role}: ${service.title}`, userNote].filter(Boolean).join(' | ').slice(0, 220),
      priceLocked: service.price,
      status: 'Pending',
      createdAt: now
    }));

    const tx = db.transaction(() => {
      const stmt = db.prepare(
        'INSERT INTO bookings (id, user_id, service_id, scheduled_date, slot, notes, price_locked, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      bookings.forEach((booking) => {
        stmt.run(
          booking.id,
          booking.userId,
          booking.serviceId,
          booking.scheduledDate,
          booking.slot,
          booking.notes,
          booking.priceLocked,
          booking.status,
          booking.createdAt
        );
      });
    });
    tx();

    addNotification(
      req.user.id,
      'booking',
      'Bundle Booking Confirmed',
      `${bundleLabel} booked for ${req.body.scheduledDate} at ${req.body.slot}.`,
      { bookingIds: bookings.map((booking) => booking.id), services: [primaryService.id, addOnService.id] }
    );

    return res.status(201).json({
      bookings,
      bundle: {
        label: bundleLabel,
        scheduledDate: req.body.scheduledDate,
        slot: req.body.slot
      },
      message: 'Bundle booking created. Complete payment for each service to unlock receipts.'
    });
  }
);

app.get('/api/bookings', authRequired, (req, res) => {
  const bookingRows = db
    .prepare(
      `SELECT
        b.id,
        b.user_id AS userId,
        b.service_id AS serviceId,
        b.scheduled_date AS scheduledDate,
        b.slot,
        b.notes,
        b.price_locked AS priceLocked,
        b.status,
        b.created_at AS createdAt,
        p.id AS paymentId,
        p.amount AS paymentAmount,
        p.paid_at AS paidAt,
        CASE WHEN p.id IS NULL THEN 'Unpaid' ELSE 'Paid' END AS paymentStatus
      FROM bookings b
      LEFT JOIN payments p ON p.booking_id = b.id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC`
    )
    .all(req.user.id);

  const userBookings = bookingRows.map((booking) => {
    const statusKey = normalizeBookingStatus(booking.status);
    return {
      ...booking,
      address: parseAddress(booking.notes),
      status: bookingStatusLabel(statusKey),
      statusKey,
      service: ensureService(booking.serviceId),
      bundleLabel: parseBundleLabel(booking.notes),
      packageLabel: parsePackageLabel(booking.notes),
      packageId: parsePackageId(booking.notes)
    };
  });

  return res.json({ bookings: userBookings });
});

app.get('/api/bookings/:bookingId/receipt', authRequired, (req, res) => {
  const booking = db
    .prepare(
      `SELECT
        b.id,
        b.service_id AS serviceId,
        b.price_locked AS priceLocked,
        b.scheduled_date AS scheduledDate,
        b.slot,
        b.status,
        b.notes,
        b.created_at AS createdAt,
        p.id AS paymentId,
        p.paid_at AS paidAt,
        p.amount AS paymentAmount,
        p.base_amount AS baseAmount,
        p.discount_code AS discountCode,
        p.discount_pct AS discountPct,
        p.discount_amount AS discountAmount
      FROM bookings b
      LEFT JOIN payments p ON p.booking_id = b.id
      WHERE b.id = ? AND b.user_id = ?`
    )
    .get(req.params.bookingId, req.user.id);

  if (!booking) {
    return res.status(404).json({ error: 'Booking not found.' });
  }
  if (!booking.paymentId) {
    return res.status(409).json({ error: 'Complete payment first to view this receipt.' });
  }
  if (normalizeBookingStatus(booking.status) !== 'approved') {
    return res.status(409).json({ error: 'Receipt unlocks after admin approval and payment.' });
  }

  const service = ensureService(booking.serviceId);
  if (!service) {
    return res.status(404).json({ error: 'Service not found for this booking.' });
  }

  return res.json({
    receipt: {
      bookingId: booking.id,
      scheduledDate: booking.scheduledDate,
      slot: booking.slot,
      createdAt: booking.createdAt,
      address: parseAddress(booking.notes),
      bundleLabel: parseBundleLabel(booking.notes),
      packageLabel: parsePackageLabel(booking.notes),
      service: {
        id: service.id,
        title: service.title
      },
      offer:
        booking.discountCode && Number(booking.discountAmount || 0) > 0
          ? {
              code: booking.discountCode,
              discountPct: Number(booking.discountPct || 0),
              discountAmount: Number(booking.discountAmount || 0),
              baseAmount: Number(booking.baseAmount || booking.priceLocked)
            }
          : null,
      ...calculateImpactReceipt(service, Number(booking.paymentAmount || booking.priceLocked), booking)
    }
  });
});

app.get('/api/receipts', authRequired, [query('limit').optional().isInt({ min: 1, max: 300 })], (req, res) => {
  if (!requestValid(req, res)) {
    return;
  }

  const limit = req.query.limit ? Number(req.query.limit) : 120;
  const bookingRows = db
    .prepare(
      `SELECT
        b.id,
        b.service_id AS serviceId,
        b.price_locked AS priceLocked,
        b.scheduled_date AS scheduledDate,
        b.slot,
        b.notes,
        b.created_at AS createdAt,
        p.paid_at AS paidAt,
        p.amount AS paymentAmount,
        p.base_amount AS baseAmount,
        p.discount_code AS discountCode,
        p.discount_pct AS discountPct,
        p.discount_amount AS discountAmount
      FROM bookings b
      JOIN payments p ON p.booking_id = b.id
      WHERE b.user_id = ?
      AND lower(b.status) IN ('approved', 'accepted', 'completed')
      ORDER BY p.paid_at DESC
      LIMIT ?`
    )
    .all(req.user.id, limit);

  const receipts = bookingRows
    .map((booking) => {
      const service = ensureService(booking.serviceId);
      if (!service) {
        return null;
      }
      return {
        bookingId: booking.id,
        scheduledDate: booking.scheduledDate,
        slot: booking.slot,
        address: parseAddress(booking.notes),
        bundleLabel: parseBundleLabel(booking.notes),
        packageLabel: parsePackageLabel(booking.notes),
        service: {
          id: service.id,
          title: service.title
        },
        createdAt: booking.createdAt,
        offer:
          booking.discountCode && Number(booking.discountAmount || 0) > 0
            ? {
                code: booking.discountCode,
                discountPct: Number(booking.discountPct || 0),
                discountAmount: Number(booking.discountAmount || 0),
                baseAmount: Number(booking.baseAmount || booking.priceLocked)
              }
            : null,
        ...calculateImpactReceipt(service, Number(booking.paymentAmount || booking.priceLocked), booking)
      };
    })
    .filter(Boolean);

  return res.json({ receipts });
});

app.post(
  '/api/payments',
  authRequired,
  csrfRequired,
  [
    body('bookingId').isString().isLength({ min: 1, max: 30 }),
    body('method').isIn(PAYMENT_METHODS),
    body('payerName').trim().isLength({ min: 2, max: 60 }).escape(),
    body('couponCode').optional({ values: 'falsy' }).trim().isLength({ min: 6, max: 40 }),
    body('cardNumber')
      .isString()
      .custom((value) => value.replace(/\D/g, '').length >= 12)
  ],
  (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }

    const booking = db
      .prepare('SELECT id, service_id AS serviceId, price_locked AS priceLocked, status FROM bookings WHERE id = ? AND user_id = ?')
      .get(req.body.bookingId, req.user.id);

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const existing = db.prepare('SELECT id FROM payments WHERE booking_id = ?').get(booking.id);
    if (existing) {
      return res.status(409).json({ error: 'Payment already completed for this booking.' });
    }

    if (normalizeBookingStatus(booking.status) === 'cancelled') {
      return res.status(409).json({ error: 'Cancelled bookings cannot be paid.' });
    }

    const digits = req.body.cardNumber.replace(/\D/g, '');
    const couponCode = String(req.body.couponCode || '')
      .trim()
      .toUpperCase();
    const baseAmount = Number(booking.priceLocked);
    let coupon = null;
    let discountPct = 0;
    let discountAmount = 0;
    let amountToPay = baseAmount;

    if (couponCode) {
      coupon = db
        .prepare(
          `SELECT
            id,
            code,
            discount_pct AS discountPct,
            status,
            expires_at AS expiresAt
          FROM coupons
          WHERE code = ? AND user_id = ?`
        )
        .get(couponCode, req.user.id);

      if (!coupon) {
        return res.status(404).json({ error: 'Coupon not found for this account.' });
      }

      if (coupon.status !== 'active') {
        return res.status(409).json({ error: 'Coupon is no longer active.' });
      }

      const expiryMs = new Date(coupon.expiresAt || 0).getTime();
      if (!Number.isFinite(expiryMs) || expiryMs <= Date.now()) {
        db.prepare("UPDATE coupons SET status = 'expired' WHERE id = ?").run(coupon.id);
        return res.status(409).json({ error: 'Coupon expired. Redeem a new one.' });
      }

      discountPct = Number(clamp(Number(coupon.discountPct || 0), 10, 40));
      discountAmount = roundTo((baseAmount * discountPct) / 100, 2);
      amountToPay = roundTo(Math.max(0.5, baseAmount - discountAmount), 2);
    }

    const payment = {
      id: nanoid(14),
      userId: req.user.id,
      bookingId: booking.id,
      amount: Number(amountToPay),
      baseAmount: Number(baseAmount),
      discountCode: coupon ? coupon.code : '',
      discountPct: Number(discountPct),
      discountAmount: Number(discountAmount),
      method: req.body.method,
      payerName: req.body.payerName,
      cardLast4: digits.slice(-4),
      transactionId: `ES-${Date.now()}-${nanoid(6)}`,
      paidAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO payments (
          id, user_id, booking_id, amount, base_amount, discount_code, discount_pct, discount_amount,
          method, payer_name, card_last4, transaction_id, paid_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        payment.id,
        payment.userId,
        payment.bookingId,
        payment.amount,
        payment.baseAmount,
        payment.discountCode,
        payment.discountPct,
        payment.discountAmount,
        payment.method,
        payment.payerName,
        payment.cardLast4,
        payment.transactionId,
        payment.paidAt,
        payment.createdAt
      );

      if (coupon) {
        db.prepare("UPDATE coupons SET status = 'used', used_at = ?, used_booking_id = ? WHERE id = ?").run(
          payment.createdAt,
          booking.id,
          coupon.id
        );
      }

      // Keep booking lifecycle status admin-driven (Pending/Approved/Cancelled).
      db.prepare("UPDATE bookings SET status = 'Pending' WHERE id = ? AND lower(status) NOT IN ('approved', 'cancelled')").run(
        booking.id
      );
    });

    tx();

    const service = ensureService(booking.serviceId);
    addNotification(
      req.user.id,
      'payment',
      'Payment Successful',
      `Payment of $${payment.amount} received for ${service ? service.title : 'your booking'}${
        coupon ? ` with coupon ${coupon.code} (-${payment.discountPct}%)` : ''
      }.`,
      {
        bookingId: booking.id,
        paymentId: payment.id,
        transactionId: payment.transactionId,
        couponCode: payment.discountCode || null
      }
    );

    return res.status(201).json({
      payment,
      couponApplied: coupon
        ? {
            code: payment.discountCode,
            discountPct: payment.discountPct,
            discountAmount: payment.discountAmount
          }
        : null
    });
  }
);

app.get(
  '/api/payments/quote',
  authRequired,
  [query('bookingId').isString().isLength({ min: 1, max: 30 }), query('couponCode').optional().isLength({ min: 0, max: 40 })],
  (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }

    const booking = db
      .prepare('SELECT id, price_locked AS priceLocked, status FROM bookings WHERE id = ? AND user_id = ?')
      .get(req.query.bookingId, req.user.id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }
    if (normalizeBookingStatus(booking.status) === 'cancelled') {
      return res.status(409).json({ error: 'Cancelled booking cannot be paid.' });
    }

    const couponCode = String(req.query.couponCode || '')
      .trim()
      .toUpperCase();
    const baseAmount = Number(booking.priceLocked || 0);
    let discountPct = 0;
    let discountAmount = 0;
    let coupon = null;

    if (couponCode) {
      coupon = db
        .prepare(
          `SELECT id, code, discount_pct AS discountPct, status, expires_at AS expiresAt
           FROM coupons
           WHERE code = ? AND user_id = ?`
        )
        .get(couponCode, req.user.id);
      if (!coupon) {
        return res.status(404).json({ error: 'Coupon not found for this account.' });
      }
      if (coupon.status !== 'active') {
        return res.status(409).json({ error: 'Coupon is no longer active.' });
      }
      const expiryMs = new Date(coupon.expiresAt || 0).getTime();
      if (!Number.isFinite(expiryMs) || expiryMs <= Date.now()) {
        db.prepare("UPDATE coupons SET status = 'expired' WHERE id = ?").run(coupon.id);
        return res.status(409).json({ error: 'Coupon expired. Redeem a new one.' });
      }
      discountPct = Number(clamp(Number(coupon.discountPct || 0), 10, 40));
      discountAmount = roundTo((baseAmount * discountPct) / 100, 2);
    }

    const payable = roundTo(Math.max(0.5, baseAmount - discountAmount), 2);
    return res.json({
      quote: {
        bookingId: booking.id,
        baseAmount: roundTo(baseAmount, 2),
        discountPct,
        discountAmount,
        payableAmount: payable,
        couponCode: coupon ? coupon.code : ''
      }
    });
  }
);

app.get(
  '/api/payments/package-quote',
  authRequired,
  [query('packageId').isString().isLength({ min: 4, max: 40 }), query('couponCode').optional().isLength({ min: 0, max: 40 })],
  (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }

    const packageId = String(req.query.packageId || '')
      .trim()
      .toUpperCase();
    const likePattern = `%Package ID: ${packageId}%`;
    const rows = db
      .prepare(
        `SELECT
          b.id,
          b.price_locked AS priceLocked,
          b.status
        FROM bookings b
        LEFT JOIN payments p ON p.booking_id = b.id
        WHERE b.user_id = ? AND p.id IS NULL AND b.notes LIKE ?
        ORDER BY b.created_at ASC`
      )
      .all(req.user.id, likePattern)
      .filter((row) => normalizeBookingStatus(row.status) !== 'cancelled');

    if (!rows.length) {
      return res.status(404).json({ error: 'No unpaid package bookings found.' });
    }

    const couponCode = String(req.query.couponCode || '')
      .trim()
      .toUpperCase();
    const baseAmount = roundTo(rows.reduce((sum, row) => sum + Number(row.priceLocked || 0), 0), 2);
    let discountPct = 0;
    let discountAmount = 0;
    let coupon = null;

    if (couponCode) {
      coupon = db
        .prepare(
          `SELECT id, code, discount_pct AS discountPct, status, expires_at AS expiresAt
           FROM coupons
           WHERE code = ? AND user_id = ?`
        )
        .get(couponCode, req.user.id);
      if (!coupon) {
        return res.status(404).json({ error: 'Coupon not found for this account.' });
      }
      if (coupon.status !== 'active') {
        return res.status(409).json({ error: 'Coupon is no longer active.' });
      }
      const expiryMs = new Date(coupon.expiresAt || 0).getTime();
      if (!Number.isFinite(expiryMs) || expiryMs <= Date.now()) {
        db.prepare("UPDATE coupons SET status = 'expired' WHERE id = ?").run(coupon.id);
        return res.status(409).json({ error: 'Coupon expired. Redeem a new one.' });
      }
      discountPct = Number(clamp(Number(coupon.discountPct || 0), 10, 40));
      discountAmount = roundTo((baseAmount * discountPct) / 100, 2);
    }

    return res.json({
      quote: {
        packageId,
        bookingCount: rows.length,
        baseAmount,
        discountPct,
        discountAmount,
        payableAmount: roundTo(Math.max(0.5, baseAmount - discountAmount), 2),
        couponCode: coupon ? coupon.code : ''
      }
    });
  }
);

app.post(
  '/api/payments/package',
  authRequired,
  csrfRequired,
  [
    body('packageId').isString().isLength({ min: 4, max: 40 }),
    body('method').isIn(PAYMENT_METHODS),
    body('payerName').trim().isLength({ min: 2, max: 60 }).escape(),
    body('couponCode').optional({ values: 'falsy' }).trim().isLength({ min: 6, max: 40 }),
    body('cardNumber')
      .isString()
      .custom((value) => value.replace(/\D/g, '').length >= 12)
  ],
  (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }

    const packageId = String(req.body.packageId || '')
      .trim()
      .toUpperCase();
    const likePattern = `%Package ID: ${packageId}%`;
    const bookingRows = db
      .prepare(
        `SELECT
          b.id,
          b.service_id AS serviceId,
          b.price_locked AS priceLocked,
          b.status
        FROM bookings b
        LEFT JOIN payments p ON p.booking_id = b.id
        WHERE b.user_id = ? AND p.id IS NULL AND b.notes LIKE ?
        ORDER BY b.created_at ASC`
      )
      .all(req.user.id, likePattern)
      .filter((row) => normalizeBookingStatus(row.status) !== 'cancelled');

    if (!bookingRows.length) {
      return res.status(404).json({ error: 'No unpaid package bookings found.' });
    }

    const digits = String(req.body.cardNumber || '').replace(/\D/g, '');
    const couponCode = String(req.body.couponCode || '')
      .trim()
      .toUpperCase();
    const baseAmount = roundTo(bookingRows.reduce((sum, row) => sum + Number(row.priceLocked || 0), 0), 2);
    let coupon = null;
    let discountPct = 0;
    let totalDiscountAmount = 0;

    if (couponCode) {
      coupon = db
        .prepare(
          `SELECT id, code, discount_pct AS discountPct, status, expires_at AS expiresAt
           FROM coupons
           WHERE code = ? AND user_id = ?`
        )
        .get(couponCode, req.user.id);
      if (!coupon) {
        return res.status(404).json({ error: 'Coupon not found for this account.' });
      }
      if (coupon.status !== 'active') {
        return res.status(409).json({ error: 'Coupon is no longer active.' });
      }
      const expiryMs = new Date(coupon.expiresAt || 0).getTime();
      if (!Number.isFinite(expiryMs) || expiryMs <= Date.now()) {
        db.prepare("UPDATE coupons SET status = 'expired' WHERE id = ?").run(coupon.id);
        return res.status(409).json({ error: 'Coupon expired. Redeem a new one.' });
      }
      discountPct = Number(clamp(Number(coupon.discountPct || 0), 10, 40));
      totalDiscountAmount = roundTo((baseAmount * discountPct) / 100, 2);
    }

    const payments = [];
    let distributedDiscount = 0;
    bookingRows.forEach((booking, index) => {
      const price = Number(booking.priceLocked || 0);
      const isLast = index === bookingRows.length - 1;
      const ratio = baseAmount > 0 ? price / baseAmount : 0;
      const discountShare = isLast
        ? roundTo(totalDiscountAmount - distributedDiscount, 2)
        : roundTo(totalDiscountAmount * ratio, 2);
      distributedDiscount = roundTo(distributedDiscount + discountShare, 2);
      const amount = roundTo(Math.max(0.5, price - discountShare), 2);
      const nowIso = new Date().toISOString();
      payments.push({
        id: nanoid(14),
        userId: req.user.id,
        bookingId: booking.id,
        amount,
        baseAmount: price,
        discountCode: coupon ? coupon.code : '',
        discountPct: coupon ? discountPct : 0,
        discountAmount: discountShare,
        method: req.body.method,
        payerName: req.body.payerName,
        cardLast4: digits.slice(-4),
        transactionId: `ES-PKG-${Date.now()}-${nanoid(6)}`,
        paidAt: nowIso,
        createdAt: nowIso
      });
    });

    const tx = db.transaction(() => {
      const insertPayment = db.prepare(
        `INSERT INTO payments (
          id, user_id, booking_id, amount, base_amount, discount_code, discount_pct, discount_amount,
          method, payer_name, card_last4, transaction_id, paid_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const updateBooking = db.prepare(
        "UPDATE bookings SET status = 'Pending' WHERE id = ? AND lower(status) NOT IN ('approved', 'cancelled')"
      );

      payments.forEach((payment) => {
        insertPayment.run(
          payment.id,
          payment.userId,
          payment.bookingId,
          payment.amount,
          payment.baseAmount,
          payment.discountCode,
          payment.discountPct,
          payment.discountAmount,
          payment.method,
          payment.payerName,
          payment.cardLast4,
          payment.transactionId,
          payment.paidAt,
          payment.createdAt
        );
        updateBooking.run(payment.bookingId);
      });

      if (coupon) {
        db.prepare("UPDATE coupons SET status = 'used', used_at = ?, used_booking_id = ? WHERE id = ?").run(
          new Date().toISOString(),
          bookingRows[0].id,
          coupon.id
        );
      }
    });
    tx();

    const totalPaid = roundTo(payments.reduce((sum, item) => sum + Number(item.amount || 0), 0), 2);
    addNotification(
      req.user.id,
      'payment',
      'Package Payment Successful',
      `Package ${packageId} paid: $${totalPaid} across ${payments.length} services${coupon ? ` using ${coupon.code}` : ''}.`,
      {
        packageId,
        bookingIds: payments.map((item) => item.bookingId),
        couponCode: coupon ? coupon.code : null
      }
    );

    return res.status(201).json({
      packagePayment: {
        packageId,
        bookingCount: payments.length,
        totalBaseAmount: baseAmount,
        totalDiscountAmount: totalDiscountAmount,
        totalPaid,
        couponCode: coupon ? coupon.code : ''
      }
    });
  }
);

app.get('/api/payments', authRequired, (req, res) => {
  const payments = db
    .prepare(
      `SELECT
        p.id,
        p.booking_id AS bookingId,
        p.amount,
        p.base_amount AS baseAmount,
        p.discount_code AS discountCode,
        p.discount_pct AS discountPct,
        p.discount_amount AS discountAmount,
        p.method,
        p.payer_name AS payerName,
        p.card_last4 AS cardLast4,
        p.transaction_id AS transactionId,
        p.paid_at AS paidAt,
        p.created_at AS createdAt,
        b.service_id AS serviceId,
        b.scheduled_date AS scheduledDate,
        b.slot,
        b.notes
      FROM payments p
      JOIN bookings b ON b.id = p.booking_id
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC`
    )
    .all(req.user.id)
    .map((payment) => ({
      ...payment,
      service: ensureService(payment.serviceId),
      bundleLabel: parseBundleLabel(payment.notes),
      packageLabel: parsePackageLabel(payment.notes),
      packageId: parsePackageId(payment.notes)
    }));

  return res.json({ payments });
});

app.post(
  '/api/reviews',
  authRequired,
  csrfRequired,
  [
    body('bookingId').isString().isLength({ min: 1, max: 30 }),
    body('rating').isInt({ min: 1, max: 5 }),
    body('comment').isLength({ min: 5, max: 260 }).trim().escape()
  ],
  (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }

    const booking = db
      .prepare('SELECT id, service_id AS serviceId FROM bookings WHERE id = ? AND user_id = ?')
      .get(req.body.bookingId, req.user.id);

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const existing = db.prepare('SELECT id FROM reviews WHERE booking_id = ?').get(booking.id);
    if (existing) {
      return res.status(409).json({ error: 'Review already exists for this booking.' });
    }

    const review = {
      id: nanoid(12),
      userId: req.user.id,
      bookingId: booking.id,
      serviceId: booking.serviceId,
      rating: req.body.rating,
      comment: req.body.comment,
      createdAt: new Date().toISOString()
    };

    db.prepare(
      'INSERT INTO reviews (id, user_id, booking_id, service_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(review.id, review.userId, review.bookingId, review.serviceId, review.rating, review.comment, review.createdAt);

    const service = ensureService(review.serviceId);
    addNotification(
      req.user.id,
      'review',
      'Review Submitted',
      `Thanks for reviewing ${service ? service.title : 'your service'} with ${review.rating}/5.`,
      { bookingId: review.bookingId, reviewId: review.id, serviceId: review.serviceId }
    );

    return res.status(201).json({ review });
  }
);

app.get('/api/reviews', authRequired, [query('serviceId').optional().isString()], (req, res) => {
  if (!requestValid(req, res)) {
    return;
  }

  const serviceId = req.query.serviceId;
  const reviewRows = serviceId
    ? db
        .prepare(
          'SELECT r.id, r.user_id AS userId, r.booking_id AS bookingId, r.service_id AS serviceId, r.rating, r.comment, r.created_at AS createdAt, u.name AS userName FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.service_id = ? ORDER BY r.created_at DESC'
        )
        .all(serviceId)
    : db
        .prepare(
          'SELECT r.id, r.user_id AS userId, r.booking_id AS bookingId, r.service_id AS serviceId, r.rating, r.comment, r.created_at AS createdAt, u.name AS userName FROM reviews r JOIN users u ON u.id = r.user_id ORDER BY r.created_at DESC'
        )
        .all();

  return res.json({ reviews: reviewRows });
});

app.get('/api/insights', authRequired, (req, res) => {
  const requestedWindow = Number(req.query.window);
  const windowMonths = INSIGHT_WINDOWS.includes(requestedWindow) ? requestedWindow : 6;
  const totalSwipes = db.prepare('SELECT COUNT(*) AS count FROM swipes WHERE user_id = ?').get(req.user.id).count;
  const userSwipes = db
    .prepare('SELECT service_id AS serviceId, action, created_at AS createdAt FROM swipes WHERE user_id = ?')
    .all(req.user.id);
  const userBookings = db
    .prepare(
      'SELECT id AS bookingId, service_id AS serviceId, price_locked AS priceLocked, created_at AS createdAt, scheduled_date AS scheduledDate, slot FROM bookings WHERE user_id = ?'
    )
    .all(req.user.id);
  const userReviews = db.prepare('SELECT rating FROM reviews WHERE user_id = ?').all(req.user.id);
  const goal = getUserGoal(req.user.id);

  const bookingDetails = userBookings
    .map((booking) => {
      const service = ensureService(booking.serviceId);
      if (!service) {
        return null;
      }
      return {
        ...booking,
        service,
        carbonModel: bookingCarbonModel(service, booking)
      };
    })
    .filter((booking) => Boolean(booking.service));

  const bookedServices = bookingDetails.map((booking) => booking.service);
  const totalSpend = bookingDetails.reduce((sum, booking) => sum + Number(booking.priceLocked), 0);
  const totalCarbonSaved = bookingDetails.reduce((sum, booking) => sum + booking.carbonModel.carbonSavedKg, 0);
  const totalTraditionalCarbon = bookingDetails.reduce((sum, booking) => sum + booking.carbonModel.baselineCarbonKg, 0);
  const totalEcoCarbon = bookingDetails.reduce((sum, booking) => sum + booking.carbonModel.serviceCarbonKg, 0);
  const totalMoneySaved = bookedServices.reduce((sum, service) => sum + service.lifecycleSavings, 0);
  const totalTimeSavedMinutes = bookedServices.reduce(
    (sum, service) => sum + Math.max(0, service.baselineEtaMinutes - service.etaMinutes),
    0
  );

  const swipeMatchTimeMinutesRaw = computeSwipeMatchTimeMinutes(userSwipes, bookingDetails);
  const swipeMatchTimeMinutes =
    swipeMatchTimeMinutesRaw !== null ? roundTo(clamp(swipeMatchTimeMinutesRaw, 0.4, 240), 2) : 6.4;
  const baselineMatchTimeMinutes = roundTo(Math.max(5.2, swipeMatchTimeMinutes * 1.55 + 1.8), 2);
  const matchingTimeImprovementPct = percentReduction(baselineMatchTimeMinutes, swipeMatchTimeMinutes);

  const positiveSwipeCount = userSwipes.filter(
    (swipe) => swipe.action === 'like' || swipe.action === 'superlike'
  ).length;
  const skipCount = userSwipes.filter((swipe) => swipe.action === 'skip').length;
  const skipRate = totalSwipes ? skipCount / totalSwipes : 0.42;
  const swipeConversionPct = positiveSwipeCount
    ? roundTo((bookingDetails.length / positiveSwipeCount) * 100, 2)
    : 0;
  const baselineConversionPct = swipeConversionPct
    ? roundTo(clamp(swipeConversionPct * (0.62 + (1 - skipRate) * 0.18), 6, 92), 2)
    : 24;
  const conversionIncreasePct = percentIncrease(swipeConversionPct, baselineConversionPct);

  const paidBookingRows = db
    .prepare('SELECT b.id AS bookingId FROM bookings b JOIN payments p ON p.booking_id = b.id WHERE b.user_id = ?')
    .all(req.user.id);
  const paidBookingIdSet = new Set(paidBookingRows.map((row) => row.bookingId));
  const paidBookingCount = paidBookingRows.length;
  const trustCompletionPct = bookingDetails.length
    ? roundTo((paidBookingCount / bookingDetails.length) * 100, 2)
    : 0;
  const bookedProviderSet = new Set(bookedServices.map((service) => service.provider));
  const trustPopulation = buildBehavioralTrustScores().filter(
    (item) => bookedProviderSet.size === 0 || bookedProviderSet.has(item.provider)
  );
  const avgReliabilityScore = trustPopulation.length
    ? roundTo(
        trustPopulation.reduce((sum, item) => sum + Number(item.reliabilityScore || 0), 0) / trustPopulation.length,
        1
      )
    : 72;
  const baselineCompletionPct = trustCompletionPct
    ? roundTo(clamp(trustCompletionPct * (0.72 + (100 - avgReliabilityScore) * 0.0025), 8, 98), 2)
    : 58;
  const completionImprovementPct = percentIncrease(trustCompletionPct, baselineCompletionPct);

  const carbonReductionPct = percentReduction(totalTraditionalCarbon, totalEcoCarbon);
  const swipeToInterestPct = totalSwipes ? roundTo((positiveSwipeCount / totalSwipes) * 100, 1) : 0;
  const interestToBookingPct = positiveSwipeCount
    ? roundTo((bookingDetails.length / positiveSwipeCount) * 100, 1)
    : 0;
  const bookingToCompletionPct = bookingDetails.length
    ? roundTo((paidBookingCount / bookingDetails.length) * 100, 1)
    : 0;
  const endToEndCompletionPct = totalSwipes
    ? roundTo((paidBookingCount / totalSwipes) * 100, 1)
    : 0;

  const funnelBuckets = buildMonthBuckets(windowMonths);
  const funnelIndex = new Map(funnelBuckets.map((bucket, idx) => [bucket.key, idx]));
  const trajectory = funnelBuckets.map((bucket) => ({
    month: bucket.label,
    swipes: 0,
    interest: 0,
    bookings: 0,
    completed: 0,
    interestToBookingPct: 0,
    bookingToCompletionPct: 0
  }));

  userSwipes.forEach((swipe) => {
    const date = new Date(swipe.createdAt || 0);
    if (Number.isNaN(date.getTime())) {
      return;
    }
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const idx = funnelIndex.get(key);
    if (idx === undefined) {
      return;
    }
    trajectory[idx].swipes += 1;
    if (swipe.action === 'like' || swipe.action === 'superlike') {
      trajectory[idx].interest += 1;
    }
  });

  bookingDetails.forEach((booking) => {
    const date = new Date(booking.createdAt || booking.scheduledDate || 0);
    if (Number.isNaN(date.getTime())) {
      return;
    }
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const idx = funnelIndex.get(key);
    if (idx === undefined) {
      return;
    }
    trajectory[idx].bookings += 1;
    if (paidBookingIdSet.has(booking.bookingId)) {
      trajectory[idx].completed += 1;
    }
  });

  trajectory.forEach((row) => {
    row.interestToBookingPct = row.interest ? roundTo((row.bookings / row.interest) * 100, 1) : 0;
    row.bookingToCompletionPct = row.bookings ? roundTo((row.completed / row.bookings) * 100, 1) : 0;
  });

  function signalEntry(map, key) {
    if (!map.has(key)) {
      map.set(key, { swipes: 0, interest: 0, bookings: 0, completed: 0 });
    }
    return map.get(key);
  }

  const categorySignalMap = new Map();
  const providerSignalMap = new Map();

  userSwipes.forEach((swipe) => {
    const service = ensureService(swipe.serviceId);
    if (!service) {
      return;
    }
    const categoryStats = signalEntry(categorySignalMap, service.category);
    const providerStats = signalEntry(providerSignalMap, service.provider);
    categoryStats.swipes += 1;
    providerStats.swipes += 1;
    if (swipe.action === 'like' || swipe.action === 'superlike') {
      categoryStats.interest += 1;
      providerStats.interest += 1;
    }
  });

  bookingDetails.forEach((booking) => {
    const service = booking.service;
    const categoryStats = signalEntry(categorySignalMap, service.category);
    const providerStats = signalEntry(providerSignalMap, service.provider);
    categoryStats.bookings += 1;
    providerStats.bookings += 1;
    if (paidBookingIdSet.has(booking.bookingId)) {
      categoryStats.completed += 1;
      providerStats.completed += 1;
    }
  });

  const categorySignals = [...categorySignalMap.entries()]
    .map(([category, stats]) => ({
      category,
      swipes: stats.swipes,
      interest: stats.interest,
      bookings: stats.bookings,
      completed: stats.completed,
      swipeToInterestPct: stats.swipes ? roundTo((stats.interest / stats.swipes) * 100, 1) : 0,
      interestToBookingPct: stats.interest ? roundTo((stats.bookings / stats.interest) * 100, 1) : 0,
      bookingToCompletionPct: stats.bookings ? roundTo((stats.completed / stats.bookings) * 100, 1) : 0
    }))
    .sort((a, b) => b.bookings - a.bookings || b.interestToBookingPct - a.interestToBookingPct)
    .slice(0, 6);

  const providerSignals = [...providerSignalMap.entries()]
    .map(([provider, stats]) => ({
      provider,
      swipes: stats.swipes,
      interest: stats.interest,
      bookings: stats.bookings,
      completed: stats.completed,
      swipeToInterestPct: stats.swipes ? roundTo((stats.interest / stats.swipes) * 100, 1) : 0,
      interestToBookingPct: stats.interest ? roundTo((stats.bookings / stats.interest) * 100, 1) : 0,
      bookingToCompletionPct: stats.bookings ? roundTo((stats.completed / stats.bookings) * 100, 1) : 0
    }))
    .sort((a, b) => b.completed - a.completed || b.bookingToCompletionPct - a.bookingToCompletionPct)
    .slice(0, 6);

  const avgSustainability =
    bookedServices.length > 0
      ? Math.round(bookedServices.reduce((sum, service) => sum + service.sustainabilityScore, 0) / bookedServices.length)
      : 0;
  const avgRating = userReviews.length
    ? Number((userReviews.reduce((sum, review) => sum + review.rating, 0) / userReviews.length).toFixed(1))
    : 0;

  const spendSeries = buildMonthlySeries(bookingDetails, windowMonths, (booking) => Number(booking.priceLocked));
  const savingsSeries = buildMonthlySeries(bookingDetails, windowMonths, (booking) => booking.service.lifecycleSavings);
  const carbonSeries = buildMonthlySeries(bookingDetails, windowMonths, (booking) => booking.carbonModel.carbonSavedKg);
  const timeSavedSeries = buildMonthlySeries(
    bookingDetails,
    windowMonths,
    (booking) => Math.max(0, booking.service.baselineEtaMinutes - booking.service.etaMinutes)
  );
  const bookingCountSeries = buildMonthlySeries(bookingDetails, windowMonths, () => 1);
  const avgSpendSeries = {
    labels: spendSeries.labels,
    data: spendSeries.data.map((total, index) => {
      const count = bookingCountSeries.data[index];
      return count > 0 ? Number((total / count).toFixed(2)) : 0;
    })
  };

  const demandLabels = serviceCatalog.map((service) => service.title);
  const demandData = serviceCatalog.map((service) => service.demandIndex);
  const sustainabilityData = serviceCatalog.map((service) => service.sustainabilityScore);

  const categoryMap = new Map(
    [...new Set(serviceCatalog.map((service) => service.category))].map((category) => [
      category,
      { count: 0, spend: 0, savings: 0, carbon: 0 }
    ])
  );
  bookingDetails.forEach((booking) => {
    const entry = categoryMap.get(booking.service.category);
    entry.count += 1;
    entry.spend += Number(booking.priceLocked);
    entry.savings += booking.service.lifecycleSavings;
    entry.carbon += booking.carbonModel.carbonSavedKg;
  });
  const categoryLabels = [...categoryMap.keys()];
  const categoryData = categoryLabels.map((label) => categoryMap.get(label).count);
  const categoryRoiData = categoryLabels.map((label) => {
    const item = categoryMap.get(label);
    if (!item.spend) {
      return 0;
    }
    return Number(((item.savings / item.spend) * 100).toFixed(1));
  });

  const repeatBuckets = buildMonthBuckets(windowMonths);
  const repeatIndex = new Map(repeatBuckets.map((bucket, idx) => [bucket.key, idx]));
  const repeatCounts = Array.from({ length: windowMonths }, () => 0);
  const totalCounts = Array.from({ length: windowMonths }, () => 0);
  const seenByService = new Map();
  bookingDetails
    .slice()
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
    .forEach((booking) => {
      const d = new Date(booking.createdAt || booking.scheduledDate || 0);
      if (Number.isNaN(d.getTime())) {
        return;
      }
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const idx = repeatIndex.get(key);
      if (idx === undefined) {
        return;
      }
      totalCounts[idx] += 1;
      const seen = (seenByService.get(booking.serviceId) || 0) + 1;
      seenByService.set(booking.serviceId, seen);
      if (seen > 1) {
        repeatCounts[idx] += 1;
      }
    });
  const repeatRateData = repeatCounts.map((count, idx) =>
    totalCounts[idx] ? Number(((count / totalCounts[idx]) * 100).toFixed(1)) : 0
  );

  const providerRatings = computeProviderStats().sort((a, b) => b.score - a.score);
  const topProviders = providerRatings.slice(0, 6);
  const providerLabels = topProviders.map((item) => item.provider);
  const providerRevenueData = topProviders.map((item) => item.revenue);
  const providerRatingData = topProviders.map((item) => item.score);

  const yearlyCarbonSeries = buildMonthlySeries(bookingDetails, 12, (booking) => booking.carbonModel.carbonSavedKg);
  let streakMonths = 0;
  for (let i = yearlyCarbonSeries.data.length - 1; i >= 0; i -= 1) {
    if (yearlyCarbonSeries.data[i] >= goal.monthlyCarbonGoal) {
      streakMonths += 1;
    } else {
      break;
    }
  }

  const monthCarbonSaved = carbonSeries.data[carbonSeries.data.length - 1] || 0;
  const monthMoneySaved = savingsSeries.data[savingsSeries.data.length - 1] || 0;
  const goalProgressPct = Math.round(clamp((monthCarbonSaved / Math.max(goal.monthlyCarbonGoal, 1)) * 100, 0, 999));
  const carbonScore = clamp((totalCarbonSaved / Math.max(goal.monthlyCarbonGoal * 4, 1)) * 100, 0, 100);
  const savingsScore = clamp((totalMoneySaved / Math.max(goal.monthlySpendGoal * 1.5, 1)) * 100, 0, 100);
  const timeScore = clamp((totalTimeSavedMinutes / 720) * 100, 0, 100);
  const consistencyScore = clamp(repeatRateData.reduce((sum, value) => sum + value, 0) / Math.max(repeatRateData.length, 1), 0, 100);
  const lifestyleIndex = Math.round(
    carbonScore * 0.35 + savingsScore * 0.3 + timeScore * 0.2 + consistencyScore * 0.15
  );

  const ledger = spendSeries.labels.map((label, index) => ({
    month: label,
    carbonSavedKg: carbonSeries.data[index] || 0,
    moneySaved: savingsSeries.data[index] || 0,
    spend: spendSeries.data[index] || 0,
    bookings: bookingCountSeries.data[index] || 0
  }));

  const bundleSeed = req.query.bundleSeed ? String(req.query.bundleSeed) : '';
  const bundleSuggestions = getBundleSuggestions(req.user.id, null, bundleSeed);
  const matchFunnel = {
    stages: [
      { key: 'swipes', label: 'Swipes', count: totalSwipes, ratePct: totalSwipes ? 100 : 0 },
      { key: 'interest', label: 'Likes + Superlikes', count: positiveSwipeCount, ratePct: swipeToInterestPct },
      { key: 'bookings', label: 'Bookings', count: bookingDetails.length, ratePct: totalSwipes ? roundTo((bookingDetails.length / totalSwipes) * 100, 1) : 0 },
      { key: 'completed', label: 'Completed (Paid)', count: paidBookingCount, ratePct: endToEndCompletionPct }
    ],
    rates: {
      swipeToInterestPct,
      interestToBookingPct,
      bookingToCompletionPct,
      endToEndCompletionPct
    },
    speed: {
      baselineMinutes: baselineMatchTimeMinutes,
      swipeToBookingMinutes: swipeMatchTimeMinutes,
      improvementPct: matchingTimeImprovementPct
    },
    comparison: {
      observed: {
        label: 'Swipe-first (Observed)',
        matchingMinutes: swipeMatchTimeMinutes,
        conversionPct: swipeConversionPct,
        completionPct: trustCompletionPct
      },
      baseline: {
        label: 'List-first (Modeled Baseline)',
        matchingMinutes: baselineMatchTimeMinutes,
        conversionPct: baselineConversionPct,
        completionPct: baselineCompletionPct
      },
      lift: {
        speedGainPct: matchingTimeImprovementPct,
        conversionGainPct: conversionIncreasePct,
        completionGainPct: completionImprovementPct
      },
      evidenceLabel: 'Observed vs modeled baseline'
    },
    trajectory,
    categorySignals,
    providerSignals
  };

  return res.json({
    metrics: {
      totalSwipes,
      bookedCount: bookingDetails.length,
      totalSpend: Number(totalSpend.toFixed(2)),
      totalCarbonSaved: Number(totalCarbonSaved.toFixed(2)),
      totalMoneySaved: Number(totalMoneySaved.toFixed(2)),
      totalTimeSavedHours: Number((totalTimeSavedMinutes / 60).toFixed(1)),
      avgSustainability,
      avgRating,
      lifestyleIndex,
      monthCarbonSaved: Number(monthCarbonSaved.toFixed(2)),
      monthMoneySaved: Number(monthMoneySaved.toFixed(2)),
      goalProgressPct,
      streakMonths
    },
    charts: {
      demandLabels,
      demandData,
      sustainabilityData,
      spendLabels: spendSeries.labels,
      spendData: spendSeries.data,
      avgSpendData: avgSpendSeries.data,
      savingsData: savingsSeries.data,
      carbonData: carbonSeries.data,
      timeSavedData: timeSavedSeries.data,
      bookingCountData: bookingCountSeries.data,
      repeatRateData,
      categoryLabels,
      categoryData,
      categoryRoiData,
      providerLabels,
      providerRevenueData,
      providerRatingData
    },
    ledger,
    matchFunnel,
    goal: {
      monthlyCarbonGoal: goal.monthlyCarbonGoal,
      monthlySpendGoal: goal.monthlySpendGoal
    },
    bundleSuggestions,
    providerRatings,
    benchmarks: {
      matchingTime: {
        baselineTimeMinutes: baselineMatchTimeMinutes,
        swipeTimeMinutes: swipeMatchTimeMinutes,
        improvementPct: matchingTimeImprovementPct,
        formula: '((baseline_time - swipe_time) / baseline_time) * 100'
      },
      conversion: {
        baselineConversionPct,
        swipeConversionPct,
        increasePct: conversionIncreasePct,
        formula: '((swipe_conversion - baseline_conversion) / baseline_conversion) * 100'
      },
      completion: {
        baselineCompletionPct,
        trustCompletionPct,
        avgReliabilityScore,
        improvementPct: completionImprovementPct,
        formula: '((trust_completion - baseline_completion) / baseline_completion) * 100'
      },
      carbon: {
        traditionalCo2Kg: roundTo(totalTraditionalCarbon, 2),
        ecoCo2Kg: roundTo(totalEcoCarbon, 2),
        reductionPct: carbonReductionPct,
        formula: '((traditional_co2 - eco_co2) / traditional_co2) * 100'
      },
      baselineModel: 'modeled-baseline-v1'
    },
    methodology: [
      'Carbon uses benchmark tables + provider evidence tables + route distance.',
      'Each booking applies slot traffic multipliers for peak and off-peak hours.',
      'Traditional and eco paths are compared to compute per-booking avoided emissions.',
      'Savings combine direct price difference and lifecycle maintenance reduction.',
      'Lifestyle index blends carbon, savings, time saved, and usage consistency.'
    ]
  });
});

app.get('/api/admin/overview', authRequired, adminRequired, (req, res) => {
  const totals = {
    users: db.prepare('SELECT COUNT(*) AS count FROM users').get().count,
    swipes: db.prepare('SELECT COUNT(*) AS count FROM swipes').get().count,
    bookings: db.prepare('SELECT COUNT(*) AS count FROM bookings').get().count,
    reviews: db.prepare('SELECT COUNT(*) AS count FROM reviews').get().count,
    payments: db.prepare('SELECT COUNT(*) AS count FROM payments').get().count,
    notifications: db.prepare('SELECT COUNT(*) AS count FROM notifications').get().count
  };

  const users = db
    .prepare(
      'SELECT id, name, email, created_at AS createdAt, eco_priority AS ecoPriority, budget_cap AS budgetCap, urgency_mode AS urgencyMode, accent FROM users ORDER BY created_at DESC'
    )
    .all();
  const swipes = db
    .prepare('SELECT id, user_id AS userId, service_id AS serviceId, action, created_at AS createdAt FROM swipes ORDER BY created_at DESC LIMIT 500')
    .all();
  const bookings = db
    .prepare(
      `SELECT
        b.id,
        b.user_id AS userId,
        b.service_id AS serviceId,
        b.scheduled_date AS scheduledDate,
        b.slot,
        b.price_locked AS priceLocked,
        b.status,
        b.created_at AS createdAt,
        CASE WHEN p.id IS NULL THEN 'Unpaid' ELSE 'Paid' END AS paymentStatus
      FROM bookings b
      LEFT JOIN payments p ON p.booking_id = b.id
      ORDER BY b.created_at DESC LIMIT 500`
    )
    .all();
  const reviews = db
    .prepare('SELECT id, user_id AS userId, booking_id AS bookingId, service_id AS serviceId, rating, comment, created_at AS createdAt FROM reviews ORDER BY created_at DESC LIMIT 500')
    .all();
  const payments = db
    .prepare('SELECT id, user_id AS userId, booking_id AS bookingId, amount, method, payer_name AS payerName, card_last4 AS cardLast4, transaction_id AS transactionId, paid_at AS paidAt, created_at AS createdAt FROM payments ORDER BY created_at DESC LIMIT 500')
    .all();
  const notifications = db
    .prepare('SELECT id, user_id AS userId, type, title, message, is_read AS isRead, created_at AS createdAt FROM notifications ORDER BY created_at DESC LIMIT 500')
    .all();

  return res.json({
    counts: {
      users: totals.users,
      swipes: totals.swipes,
      bookings: totals.bookings,
      reviews: totals.reviews,
      payments: totals.payments,
      notifications: totals.notifications,
      catalogServices: serviceCatalog.length
    },
    users,
    swipes,
    bookings,
    reviews,
    payments,
    notifications
  });
});

app.get(
  '/api/admin/provider-analytics',
  authRequired,
  adminRequired,
  [query('window').optional().isInt({ min: 3, max: 12 })],
  (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }
    const windowMonths = req.query.window ? Number(req.query.window) : 6;
    return res.json(buildProviderAnalyticsSuite(windowMonths));
  }
);

app.get(
  '/api/admin/bookings',
  authRequired,
  adminRequired,
  [query('status').optional().isIn(['all', 'pending', 'approved', 'accepted', 'cancelled', 'paid', 'unpaid'])],
  (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }

    const rawView = String(req.query.status || 'pending').toLowerCase();
    const view = rawView === 'accepted' ? 'approved' : rawView;
    const rows = db
      .prepare(
        `SELECT
          b.id,
          b.user_id AS userId,
          u.name AS userName,
          u.email AS userEmail,
          b.service_id AS serviceId,
          b.scheduled_date AS scheduledDate,
          b.slot,
          b.notes,
          b.price_locked AS priceLocked,
          b.status,
          b.created_at AS createdAt,
          CASE WHEN p.id IS NULL THEN 'Unpaid' ELSE 'Paid' END AS paymentStatus
        FROM bookings b
        JOIN users u ON u.id = b.user_id
        LEFT JOIN payments p ON p.booking_id = b.id
        ORDER BY b.created_at DESC`
      )
      .all();

    const list = rows
      .map((row) => {
        const statusKey = normalizeBookingStatus(row.status);
        return {
          ...row,
          status: bookingStatusLabel(statusKey),
          statusKey,
          service: ensureService(row.serviceId)
        };
      })
      .filter((row) => {
        const statusKey = row.statusKey || normalizeBookingStatus(row.status);
        const isPaid = String(row.paymentStatus || '').toLowerCase() === 'paid';
        if (view === 'all') return true;
        if (view === 'approved') return statusKey === 'approved';
        if (view === 'cancelled') return statusKey === 'cancelled';
        if (view === 'paid') return isPaid;
        if (view === 'unpaid') return !isPaid;
        return statusKey === 'pending';
      });

    return res.json({ bookings: list });
  }
);

app.post(
  '/api/admin/bookings/:bookingId/accept',
  authRequired,
  adminRequired,
  csrfRequired,
  [param('bookingId').isString().isLength({ min: 1, max: 32 }), body('note').optional().isLength({ min: 0, max: 220 }).trim().escape()],
  (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }

    const booking = db
      .prepare(
        `SELECT
          b.id,
          b.user_id AS userId,
          b.service_id AS serviceId,
          b.status,
          b.scheduled_date AS scheduledDate,
          b.slot,
          b.price_locked AS priceLocked,
          CASE WHEN p.id IS NULL THEN 'Unpaid' ELSE 'Paid' END AS paymentStatus
        FROM bookings b
        LEFT JOIN payments p ON p.booking_id = b.id
        WHERE b.id = ?`
      )
      .get(req.params.bookingId);

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const statusKey = normalizeBookingStatus(booking.status);
    if (statusKey === 'approved') {
      return res.status(409).json({ error: 'Booking is already approved.' });
    }
    if (statusKey === 'cancelled') {
      return res.status(409).json({ error: 'Cancelled bookings cannot be approved.' });
    }

    db.prepare("UPDATE bookings SET status = 'Approved' WHERE id = ?").run(booking.id);
    const service = ensureService(booking.serviceId);
    const note = req.body.note ? ` Note: ${req.body.note}` : '';
    addNotification(
      booking.userId,
      'booking',
      'Booking Approved',
      `${service ? service.title : 'Your service'} was approved by operations for ${booking.scheduledDate} ${booking.slot}.${note}`,
      { bookingId: booking.id, acceptedByAdmin: req.user.email }
    );

    const updated = db
      .prepare(
        `SELECT
          b.id,
          b.user_id AS userId,
          b.service_id AS serviceId,
          b.scheduled_date AS scheduledDate,
          b.slot,
          b.notes,
          b.price_locked AS priceLocked,
          b.status,
          b.created_at AS createdAt,
          CASE WHEN p.id IS NULL THEN 'Unpaid' ELSE 'Paid' END AS paymentStatus
        FROM bookings b
        LEFT JOIN payments p ON p.booking_id = b.id
        WHERE b.id = ?`
      )
      .get(booking.id);

    const updatedStatusKey = normalizeBookingStatus(updated.status);
    return res.json({
      booking: {
        ...updated,
        status: bookingStatusLabel(updatedStatusKey),
        statusKey: updatedStatusKey,
        service: ensureService(updated.serviceId)
      }
    });
  }
);

app.post(
  '/api/admin/bookings/:bookingId/cancel',
  authRequired,
  adminRequired,
  csrfRequired,
  [param('bookingId').isString().isLength({ min: 1, max: 32 }), body('note').optional().isLength({ min: 0, max: 220 }).trim().escape()],
  (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }

    const booking = db
      .prepare(
        `SELECT
          b.id,
          b.user_id AS userId,
          b.service_id AS serviceId,
          b.status,
          b.scheduled_date AS scheduledDate,
          b.slot,
          b.price_locked AS priceLocked,
          CASE WHEN p.id IS NULL THEN 'Unpaid' ELSE 'Paid' END AS paymentStatus
        FROM bookings b
        LEFT JOIN payments p ON p.booking_id = b.id
        WHERE b.id = ?`
      )
      .get(req.params.bookingId);

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const statusKey = normalizeBookingStatus(booking.status);
    if (statusKey === 'cancelled') {
      return res.status(409).json({ error: 'Booking is already cancelled.' });
    }

    db.prepare("UPDATE bookings SET status = 'Cancelled' WHERE id = ?").run(booking.id);
    const service = ensureService(booking.serviceId);
    const note = req.body.note ? ` Reason: ${req.body.note}` : '';
    addNotification(
      booking.userId,
      'booking',
      'Booking Cancelled',
      `${service ? service.title : 'Your service'} was cancelled by operations for ${booking.scheduledDate} ${booking.slot}.${note}`,
      { bookingId: booking.id, cancelledByAdmin: req.user.email }
    );

    const updated = db
      .prepare(
        `SELECT
          b.id,
          b.user_id AS userId,
          b.service_id AS serviceId,
          b.scheduled_date AS scheduledDate,
          b.slot,
          b.notes,
          b.price_locked AS priceLocked,
          b.status,
          b.created_at AS createdAt,
          CASE WHEN p.id IS NULL THEN 'Unpaid' ELSE 'Paid' END AS paymentStatus
        FROM bookings b
        LEFT JOIN payments p ON p.booking_id = b.id
        WHERE b.id = ?`
      )
      .get(booking.id);

    const updatedStatusKey = normalizeBookingStatus(updated.status);
    return res.json({
      booking: {
        ...updated,
        status: bookingStatusLabel(updatedStatusKey),
        statusKey: updatedStatusKey,
        service: ensureService(updated.serviceId)
      }
    });
  }
);

app.get('/api/ecofix/config', (req, res) => {
  const demoDayRaw = String(process.env.ECOFIX_DEMO_DAY || '').toLowerCase().trim();
  const demoDayOverride = DAY_KEYS.includes(demoDayRaw) ? demoDayRaw : '';
  const firebase = {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    databaseURL: process.env.FIREBASE_DATABASE_URL || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || ''
  };
  const configured = Boolean(firebase.apiKey && firebase.databaseURL && firebase.projectId);
  return res.json({
    firebase: configured ? firebase : null,
    configured,
    dailyResetTimezone: 'Asia/Kolkata',
    demoDayOverride
  });
});

app.get('/api/ecofix/providers', (req, res) => {
  const providerStats = computeProviderStats();
  const providerAreas = {
    'GreenNest Pros': 'Anna Nagar',
    'FixLoop Collective': 'T. Nagar',
    SparkleGrid: 'Velachery',
    ThreadForward: 'Adyar',
    'RootRush Studio': 'Nungambakkam',
    PedalCart: 'Mylapore',
    'FlowWise Team': 'Porur',
    'Harvest Circle': 'Tambaram',
    'Volt Wheels': 'OMR',
    ShiftCycle: 'Anna Nagar',
    LeafLab: 'Adyar',
    BuildBack: 'T. Nagar',
    SunFleet: 'Velachery',
    'AfterGlow Crew': 'Mylapore',
    ChargeCheck: 'OMR',
    RefillGo: 'Nungambakkam',
    PawPure: 'Porur',
    SoilCycle: 'Tambaram',
    'BlueLoop Engineers': 'Anna Nagar',
    'RetroSmart Collective': 'Adyar'
  };

  const serviceByProvider = new Map();
  serviceCatalog.forEach((service) => {
    if (!serviceByProvider.has(service.provider)) {
      serviceByProvider.set(service.provider, new Set());
    }
    serviceByProvider.get(service.provider).add(service.category);
  });

  const providers = providerStats.map((item) => ({
    provider: item.provider,
    area: providerAreas[item.provider] || 'Chennai',
    ecoScore: Math.round((Number(item.reliabilityScore || 72) * 0.45 + Number(item.sustainability || 70) * 0.55) * 10) / 10,
    reliabilityScore: item.reliabilityScore,
    categories: [...(serviceByProvider.get(item.provider) || new Set())]
  }));

  return res.json({ providers });
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'app.html'));
});

app.get('/payment', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'payment.html'));
});

app.get('/database', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'database.html'));
});

app.get('/admin/login', (req, res) => {
  const user = resolveUserFromToken(req);
  if (user && isAdminUser(user)) {
    return res.redirect('/admin');
  }
  return res.sendFile(path.join(__dirname, '..', 'public', 'admin-login.html'));
});

app.get('/admin', (req, res) => {
  const user = resolveUserFromToken(req);
  if (!user) {
    return res.redirect('/admin/login');
  }
  if (!isAdminUser(user)) {
    return res.redirect('/app');
  }
  return res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

app.get('/ecofix', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'ecofix.html'));
});

app.get('*', (req, res) => {
  res.redirect('/');
});

async function startServer() {
  try {
    await refreshCalibrationData();
  } catch (error) {
    console.warn(`Startup calibration fallback active: ${error.message}`);
  }

  app.listen(PORT, () => {
    console.log(`EcoSwipe running at http://localhost:${PORT}`);
    console.log(`Calibration source: ${calibrationState.source}`);
  });
}

startServer().catch((error) => {
  console.error(`Server startup failed: ${error.message}`);
  process.exit(1);
});
