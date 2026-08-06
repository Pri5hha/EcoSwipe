const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'ecoswipe.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    eco_priority INTEGER NOT NULL DEFAULT 70,
    budget_cap INTEGER NOT NULL DEFAULT 150,
    urgency_mode INTEGER NOT NULL DEFAULT 0,
    accent TEXT NOT NULL DEFAULT 'sunset'
  );

  CREATE TABLE IF NOT EXISTS swipes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    service_id TEXT NOT NULL,
    action TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    service_id TEXT NOT NULL,
    scheduled_date TEXT NOT NULL,
    slot TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    price_locked REAL NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    booking_id TEXT NOT NULL UNIQUE,
    service_id TEXT NOT NULL,
    rating INTEGER NOT NULL,
    comment TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    booking_id TEXT NOT NULL UNIQUE,
    amount REAL NOT NULL,
    method TEXT NOT NULL,
    payer_name TEXT NOT NULL,
    card_last4 TEXT NOT NULL,
    transaction_id TEXT NOT NULL UNIQUE,
    paid_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS coupons (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL DEFAULT 'ecofix',
    discount_pct REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    redeemed_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    used_booking_id TEXT,
    created_at TEXT NOT NULL,
    meta_json TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (used_booking_id) REFERENCES bookings(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    meta_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_goals (
    user_id TEXT PRIMARY KEY,
    monthly_carbon_goal REAL NOT NULL DEFAULT 25,
    monthly_spend_goal REAL NOT NULL DEFAULT 250,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS task_circles (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    objective TEXT NOT NULL DEFAULT '',
    target_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    services_json TEXT NOT NULL DEFAULT '[]',
    providers_json TEXT NOT NULL DEFAULT '[]',
    budget_estimate REAL NOT NULL DEFAULT 0,
    timeline_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS task_circle_messages (
    id TEXT PRIMARY KEY,
    circle_id TEXT NOT NULL,
    sender_user_id TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (circle_id) REFERENCES task_circles(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS task_circle_checklist (
    id TEXT PRIMARY KEY,
    circle_id TEXT NOT NULL,
    item_text TEXT NOT NULL,
    assigned_to TEXT NOT NULL DEFAULT '',
    is_done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (circle_id) REFERENCES task_circles(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ecofix_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    played_on TEXT NOT NULL,
    scenario_day TEXT NOT NULL,
    final_score REAL NOT NULL DEFAULT 0,
    base_score REAL NOT NULL DEFAULT 0,
    root_bonus REAL NOT NULL DEFAULT 0,
    speed_bonus REAL NOT NULL DEFAULT 0,
    streak_bonus REAL NOT NULL DEFAULT 0,
    root_selected INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, played_on)
  );
`);

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const hasColumn = columns.some((column) => column.name === columnName);
  if (!hasColumn) {
    db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`).run();
  }
}

ensureColumn('payments', 'base_amount', 'base_amount REAL NOT NULL DEFAULT 0');
ensureColumn('payments', 'discount_code', "discount_code TEXT NOT NULL DEFAULT ''");
ensureColumn('payments', 'discount_pct', 'discount_pct REAL NOT NULL DEFAULT 0');
ensureColumn('payments', 'discount_amount', 'discount_amount REAL NOT NULL DEFAULT 0');

module.exports = db;
