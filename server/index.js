require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, query, validationResult } = require('express-validator');
const { nanoid } = require('nanoid');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'replace-this-in-production';
const TOKEN_TTL = '2h';

const ACCENT_OPTIONS = ['sunset', 'mint', 'ocean', 'ember'];
const PAYMENT_METHODS = ['card', 'upi', 'wallet'];
const TIME_SLOTS = Array.from({ length: 11 }, (_, index) => {
  const start = 9 + index;
  const end = start + 1;
  return `${start}:00-${end}:00`;
});

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

// Backfill legacy status from the removed payment-first flow.
db.prepare("UPDATE bookings SET status = 'Confirmed' WHERE status = 'Awaiting Payment'").run();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"]
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

function rowToUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
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

function ensureService(serviceId) {
  return serviceCatalog.find((service) => service.id === serviceId);
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
    serviceCount: serviceCatalog.length
  });
});

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

    const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: TOKEN_TTL });
    const csrfToken = nanoid(24);
    setAuthCookies(res, token, csrfToken);

    return res.status(201).json({
      message: 'Account created.',
      user: { id: user.id, name: user.name, email: user.email, preferences: user.preferences },
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
      user: { id: user.id, name: user.name, email: user.email, preferences: user.preferences },
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

  return res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
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

  const ranked = getServiceWithRatings(req.user.id)
    .map((service) => {
      const budgetFit = Math.max(0, 100 - Math.abs(service.price - budgetCap) / 2);
      const ecoFit = (service.sustainabilityScore * ecoPriority) / 100;
      const urgencyFit = urgencyMode ? Math.max(0, 100 - service.etaMinutes) : 50;
      const ratingBoost = service.avgRating * 10;
      const personalizationScore = Math.round(ecoFit * 0.4 + budgetFit * 0.3 + urgencyFit * 0.2 + ratingBoost * 0.1);
      return { ...service, personalizationScore };
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
      status: 'Confirmed',
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

    return res.status(201).json({ booking });
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

  const userBookings = bookingRows.map((booking) => ({
    ...booking,
    service: ensureService(booking.serviceId)
  }));

  return res.json({ bookings: userBookings });
});

app.post(
  '/api/payments',
  authRequired,
  csrfRequired,
  [
    body('bookingId').isString().isLength({ min: 1, max: 30 }),
    body('method').isIn(PAYMENT_METHODS),
    body('payerName').trim().isLength({ min: 2, max: 60 }).escape(),
    body('cardNumber')
      .isString()
      .custom((value) => value.replace(/\D/g, '').length >= 12)
  ],
  (req, res) => {
    if (!requestValid(req, res)) {
      return;
    }

    const booking = db
      .prepare('SELECT id, service_id AS serviceId, price_locked AS priceLocked FROM bookings WHERE id = ? AND user_id = ?')
      .get(req.body.bookingId, req.user.id);

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const existing = db.prepare('SELECT id FROM payments WHERE booking_id = ?').get(booking.id);
    if (existing) {
      return res.status(409).json({ error: 'Payment already completed for this booking.' });
    }

    const digits = req.body.cardNumber.replace(/\D/g, '');
    const payment = {
      id: nanoid(14),
      userId: req.user.id,
      bookingId: booking.id,
      amount: Number(booking.priceLocked),
      method: req.body.method,
      payerName: req.body.payerName,
      cardLast4: digits.slice(-4),
      transactionId: `ES-${Date.now()}-${nanoid(6)}`,
      paidAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    const tx = db.transaction(() => {
      db.prepare(
        'INSERT INTO payments (id, user_id, booking_id, amount, method, payer_name, card_last4, transaction_id, paid_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        payment.id,
        payment.userId,
        payment.bookingId,
        payment.amount,
        payment.method,
        payment.payerName,
        payment.cardLast4,
        payment.transactionId,
        payment.paidAt,
        payment.createdAt
      );

      db.prepare("UPDATE bookings SET status = 'Paid' WHERE id = ?").run(booking.id);
    });

    tx();

    const service = ensureService(booking.serviceId);
    addNotification(
      req.user.id,
      'payment',
      'Payment Successful',
      `Payment of $${payment.amount} received for ${service ? service.title : 'your booking'}.`,
      { bookingId: booking.id, paymentId: payment.id, transactionId: payment.transactionId }
    );

    return res.status(201).json({ payment });
  }
);

app.get('/api/payments', authRequired, (req, res) => {
  const payments = db
    .prepare(
      `SELECT
        p.id,
        p.booking_id AS bookingId,
        p.amount,
        p.method,
        p.payer_name AS payerName,
        p.card_last4 AS cardLast4,
        p.transaction_id AS transactionId,
        p.paid_at AS paidAt,
        p.created_at AS createdAt,
        b.service_id AS serviceId,
        b.scheduled_date AS scheduledDate,
        b.slot
      FROM payments p
      JOIN bookings b ON b.id = p.booking_id
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC`
    )
    .all(req.user.id)
    .map((payment) => ({
      ...payment,
      service: ensureService(payment.serviceId)
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
  const totalSwipes = db.prepare('SELECT COUNT(*) AS count FROM swipes WHERE user_id = ?').get(req.user.id).count;
  const userBookings = db
    .prepare('SELECT service_id AS serviceId, price_locked AS priceLocked, created_at AS createdAt FROM bookings WHERE user_id = ?')
    .all(req.user.id);
  const userReviews = db.prepare('SELECT rating FROM reviews WHERE user_id = ?').all(req.user.id);

  const bookedServices = userBookings.map((booking) => ensureService(booking.serviceId)).filter(Boolean);
  const totalSpend = userBookings.reduce((sum, booking) => sum + Number(booking.priceLocked), 0);
  const totalCarbonSaved = bookedServices.reduce((sum, service) => sum + service.carbonSavedKg, 0);
  const avgSustainability =
    bookedServices.length > 0
      ? Math.round(bookedServices.reduce((sum, service) => sum + service.sustainabilityScore, 0) / bookedServices.length)
      : 0;
  const avgRating = userReviews.length
    ? Number((userReviews.reduce((sum, review) => sum + review.rating, 0) / userReviews.length).toFixed(1))
    : 0;

  const categories = [...new Set(serviceCatalog.map((service) => service.category))];
  const categoryData = categories.map(
    (category) => bookedServices.filter((service) => service.category === category).length
  );

  const demandLabels = serviceCatalog.map((service) => service.title);
  const demandData = serviceCatalog.map((service) => service.demandIndex);
  const sustainabilityData = serviceCatalog.map((service) => service.sustainabilityScore);

  const spendLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const spendData = spendLabels.map((_, index) => {
    const monthsAgo = 5 - index;
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);

    return userBookings.reduce((sum, booking) => {
      const bookedAt = new Date(booking.createdAt || 0);
      if (bookedAt.getMonth() === target.getMonth() && bookedAt.getFullYear() === target.getFullYear()) {
        return sum + Number(booking.priceLocked);
      }
      return sum;
    }, 0);
  });

  return res.json({
    metrics: {
      totalSwipes,
      bookedCount: userBookings.length,
      totalSpend,
      totalCarbonSaved: Number(totalCarbonSaved.toFixed(2)),
      avgSustainability,
      avgRating
    },
    charts: {
      demandLabels,
      demandData,
      sustainabilityData,
      categoryLabels: categories,
      categoryData,
      spendLabels,
      spendData
    },
    businessIdeas: [
      'Use persistent behavior data to launch retention campaigns by service category and lifetime value.',
      'Bundle consecutive-hour bookings to reduce provider idle time and improve unit economics.',
      'Create eco-membership tiers tied to monthly carbon-saved milestones and partner benefits.'
    ]
  });
});

app.get('/api/admin/overview', authRequired, (req, res) => {
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

app.get('*', (req, res) => {
  res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`EcoSwipe running at http://localhost:${PORT}`);
});
