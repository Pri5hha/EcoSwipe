# EcoSwipe

**An impact-first on-demand service marketplace combining behavioral analytics, carbon emissions modeling, and Bayesian trust scoring into a full-stack consumer platform.**

EcoSwipe instruments every user interaction — swipes, bookings, payments, gameplay — into structured analytics pipelines that drive real-time personalization, provider intelligence, and environmental impact reporting. The platform is built end-to-end: authentication, booking workflow, payment processing, gamified engagement, and an admin analytics console.

---

## Architecture Overview

```
Client (Vanilla JS + React 18 via CDN)
        │
        ▼
Express.js REST API  ──►  SQLite (better-sqlite3, WAL mode)
        │
        ▼
Calibration Layer  ──►  Supabase PostgreSQL (optional, 30-min refresh)
        │
        ▼
Firebase Realtime DB (optional, EcoFix cloud sync)
```

**Stack:** Node.js · Express.js · SQLite (better-sqlite3) · Supabase · Firebase · React 18 (CDN) · Vanilla JS · CSS Variables

---

## Core Systems

### Bayesian Behavioral Trust Scoring

Computes provider reliability scores from five weighted operational signals:

| Signal | Weight |
|---|---|
| Completion rate | 28% |
| Punctuality | 22% |
| Repeat-hire rate | 20% |
| Response time | 18% |
| Cancellation control | 12% |

A Bayesian prior (mean 72, weight 10 jobs) regularizes scores for low-observation providers, preventing overfitting on sparse data. The model outputs 95% confidence intervals and is validated using **Brier score** and **calibration error %** diagnostics. Contextual risk is additionally segmented across a 4-dimensional matrix: `provider × category × day-part × region × urgency`.

### Carbon Emissions Modeling Engine

Models eco vs. traditional service delivery footprints across **20 services × 11 time slots × 8 regions = 1,760 parameterized scenarios**. Variables per scenario:

- Operations KgCO₂/hr (traditional vs. eco-optimized)
- Vehicle emission factors: petrol van (0.24), electric van (0.07), e-bike (0.018) kg CO₂/km
- Route efficiency reduction (%)
- Demand pressure uplift
- Time-of-day congestion multiplier (rush hour ×1.13, midday ×0.98)

Outputs: carbon saved (baseline − eco), transport vs. operations breakdown, lifecycle cost savings, and a data confidence score (84% with Supabase calibration, 72% with local defaults).

### Demand Heatmap & Pricing Intelligence

Aggregates swipe and booking event streams into a **24-cell demand matrix** (8 regions × 3 day-parts):

- Bookings weighted ×1.5; superlikes ×1.2; likes ×0.8; skips ×0.35

Pricing recommendations per service:

```
recommended_price = current_price × clamp(0.9 + demandPressure × 0.045, 0.85, 1.25)
```

Produces monthly revenue uplift projections, skill gap analysis (unmet demand vs. booking volume by category), and prioritized growth actions (pricing tests, capacity expansion, skill launches, conversion recovery).

### Personalization & Recommendation Engine

Match scoring per service per user:

```
match_score = eco_fit × 0.46 + budget_fit × 0.34 + pace_score × 0.20
```

Bundle scoring uses 8 weighted factors including eco fit, budget fit, demand fit, rating fit, service affinity (with temporal decay), and category affinity — with a repeat-booking penalty (−8%) and historical purchase bonus (+3%). A deterministic hash function generates reproducible jitter per `(user, service, day)` triple, ensuring consistent recommendations across sessions without randomness drift.

Outputs 4 curated daily bundles per user: one "Exclusive of Day" and three region-anchored pairings.

### EcoFix Daily Puzzle Game

A gamified behavioral engagement loop built in **React 18 (browser-transpiled via Babel)** with seven rotating real-world sustainability scenarios (Mon–Sun):

- **60-second analysis phase** → 3-token fix selection under ₹500 budget → scoring reveal
- Score components: base impact score + root-cause detection bonus (+20 pts) + speed bonus + streak multiplier
- Sessions enforce a `UNIQUE(user_id, played_on)` constraint for clean daily cohort data
- High scorers (≥60 pts) receive dynamically generated discount coupons: `discount % = 10 + activity_boost + today_boost`
- Optional Firebase Realtime Database sync for cloud leaderboards and cross-device persistence

---

## Security Architecture

| Layer | Implementation |
|---|---|
| Password storage | bcryptjs (salt rounds 10) |
| Session management | JWT in HttpOnly + SameSite=strict cookies (2hr TTL) |
| CSRF protection | Per-session token validation on all write endpoints |
| Input validation | express-validator with max-length and format constraints |
| Rate limiting | 12 auth requests/15min · 90 API requests/60sec per IP |
| HTTP hardening | Helmet.js with Content-Security-Policy |
| Authorization | `authRequired` middleware + `adminRequired` email-allowlist guard |

---

## Data Model

11 SQLite tables with foreign key constraints and WAL journaling:

`users` · `swipes` · `bookings` · `reviews` · `payments` · `coupons` · `notifications` · `user_goals` · `task_circles` · `task_circle_messages` · `task_circle_checklist` · `ecofix_sessions`

External calibration tables (Supabase, optional): `service_benchmarks` · `provider_sustainability_evidence`

---

## API Surface

**Auth:** `POST /api/auth/register` · `POST /api/auth/login` · `GET /api/auth/me` · `POST /api/auth/logout`

**Discovery:** `GET /api/services` · `GET /api/services/filtered` · `POST /api/swipes` · `GET /api/bundles`

**Booking:** `POST /api/bookings` · `GET /api/bookings` · `GET /api/bookings/:id/receipt`

**Payments:** `POST /api/payments/process` · `GET /api/payments` · `POST /api/coupons/validate`

**Reviews:** `POST /api/reviews` · `GET /api/reviews`

**Analytics:** `GET /api/insights` · `GET /api/insights/charts` · `GET /api/goals` · `GET /api/providers/trust` · `GET /api/market-architect`

**Admin:** `GET /api/admin/overview` · `GET /api/admin/bookings` · `POST /api/admin/bookings/:id/accept` · `GET /api/admin/provider-analytics` · `GET /api/admin/provider-trust`

**EcoFix:** `GET /api/ecofix/config` · `GET /api/offers/ecofix` · `POST /api/offers/ecofix/redeem`

**Collaboration (Task Circles):** `POST /api/circles` · `GET /api/circles` · `POST /api/circles/:id/message` · `POST /api/circles/:id/checklist`

---

## Local Setup

**1. Install dependencies**
```bash
npm install
```

**2. Configure environment**
```bash
# Windows
Copy-Item .env.example .env

# macOS/Linux
cp .env.example .env
```

Set a strong `JWT_SECRET` in `.env`.

**3. (Optional) Supabase calibration — enables durable, non-random scoring**

Create a Supabase project, run `server/supabase-schema.sql` in the SQL editor, then set:
```env
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```
The app auto-refreshes benchmark and evidence data every 30 minutes.

**4. (Optional) Firebase — enables EcoFix cloud sync and leaderboards**
```env
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_DATABASE_URL=
FIREBASE_PROJECT_ID=
FIREBASE_STORAGE_BUCKET=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=
ECOFIX_DEMO_DAY=   # pin to monday..sunday for testing, or leave blank for live rotation
```

**5. Start the development server**
```bash
npm run dev
```

The SQLite database is auto-created at `server/data/ecoswipe.db` on first run.

**6. Routes**

| Route | Description |
|---|---|
| `http://localhost:3000/` | Login / Register |
| `http://localhost:3000/app` | Main dashboard |
| `http://localhost:3000/payment` | Payment processing |
| `http://localhost:3000/ecofix` | Daily sustainability puzzle |
| `http://localhost:3000/admin` | Admin analytics console |

---

## Repository Structure

```
server/
  index.js              — API routes, auth, booking/payment/review/admin logic
  db.js                 — SQLite schema initialization and migrations
  externalData.js       — Supabase calibration loader + deterministic fallbacks
  supabase-schema.sql   — External benchmark and provider evidence schema + seeds

public/
  index.html / login.js         — Authentication flow
  app.html / app.js             — Swipe engine, bookings, insights, bundle engine
  payment.html / payment.js     — Payment processing and coupon validation
  admin.html / admin.js         — Admin booking queue and provider analytics
  admin-login.html              — Admin authentication gate
  ecofix.html / ecofix.js       — React-based puzzle game and scoring
  ecofix-data.js                — Scenario library, fix trees, provider mappings
  ecofix.css / styles.css       — Theme system (Sunset · Mint · Ocean · Ember)
  assets/ecofix/                — Scenario SVG illustrations
```

---

## Notable Design Decisions

- **Zero charting dependencies:** All visualizations (spend trends, carbon charts, demand heatmaps) rendered on raw `<canvas>` — no Chart.js or D3.
- **Deterministic personalization:** A seeded hash function produces consistent, reproducible recommendations per `(user, day)` without storing randomness state.
- **Hybrid database strategy:** SQLite handles ACID user transactions locally; Supabase decouples calibration data, enabling benchmark updates without schema migrations.
- **Browser-transpiled React:** EcoFix uses React 18 + Babel Standalone — no build toolchain required, enabling rapid deployment from a static file server.
- **Model explainability:** Trust scores include top-3 factor attribution (with delta estimates) surfaced in the admin console.
