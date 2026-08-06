# EcoSwipe - On-Demand Service Platform

EcoSwipe is a swipe-first service marketplace focused on sustainability, smart economics, booking flow, and review-driven quality.

## What is included
- Separate authentication page (`/`) and app page (`/app`).
- Additional pages:
  - Payments page (`/payment`)
  - Database inspector (`/database`)
- Tinder-style swipe deck with gesture-based actions:
  - swipe right = `like`
  - swipe left = `skip`
  - swipe up = `superlike`
  - minimum 20 service cards in the deck
- Secure auth stack:
  - password hashing with `bcryptjs`
  - JWT sessions via `HttpOnly` cookie
  - CSRF token checks for all write actions
  - input validation + route rate limiting + CSP/helmet hardening
- Booking workflow:
  - schedule service date + slot + notes
  - fixed hourly slots from `9:00-10:00` through `19:00-20:00`
  - booking history panel
  - locked booking price and payment status
- Payment workflow:
  - pay by booking with method selection (`card`, `upi`, `wallet`)
  - stores secure last4 only and transaction ID
  - updates booking to paid status
- Review workflow:
  - submit ratings and comments by booking
  - review-aware service scoring
- Backend notifications feature:
  - auto notifications on `superlike`, booking creation, payment success, and review submission
  - APIs: `GET /api/notifications`, `POST /api/notifications/mark-read`, `POST /api/notifications/mark-all-read`
- Insights and visualization (canvas-based, no external chart dependency):
  - demand index
  - sustainability score trend
  - booked category distribution
  - monthly spend trend
- Accent theme customization (kept and expanded):
  - Sunset / Mint / Ocean / Ember
- Persistent database:
  - SQLite (`better-sqlite3`) for users, swipes, bookings, and reviews
  - local DB file at `server/data/ecoswipe.db`

## Run locally
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy env file and set a strong secret:
   ```powershell
   Copy-Item .env.example .env
   ```
3. Start app:
   ```bash
   npm run dev
   ```
4. Open:
   - Login: `http://localhost:3000/`
   - App: `http://localhost:3000/app`
   - Payments: `http://localhost:3000/payment`
   - Database: `http://localhost:3000/database`

## Files
- `server/index.js`: API, auth, booking/review endpoints, security.
- `public/index.html`: login/register page.
- `public/login.js`: login/register logic.
- `public/app.html`: main EcoSwipe dashboard.
- `public/app.js`: swipe engine, bookings, reviews, insights charts.
- `public/payment.html`: payment UI.
- `public/payment.js`: payment processing UI logic.
- `public/database.html`: auth-protected database viewer.
- `public/database.js`: renders records across all tables.
- `public/styles.css`: centered layout, visual theme, responsive behavior.
- `public/assets/logo.svg`: updated EcoSwipe logo.
