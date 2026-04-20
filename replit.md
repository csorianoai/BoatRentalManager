# Overview

This project is a multi-platform boat rental management system for Nadaki Excursions, designed to automate booking, payment, customer communication, captain scheduling, dynamic pricing, and accounting across 13 booking platforms. Its primary goal is to streamline operations, enhance customer experience via an AI assistant, and provide robust financial oversight. The system includes modules for task management, structured document storage, captain and stew payment management, and extended booking deposit functionalities, all accessible via gestion.nadakiexcursions.com.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

**Dual-layer frontend**: A new React + TypeScript + Tailwind CSS v3 dashboard (at `/app`) coexists with the original Vanilla JavaScript pages (in `public/`). The React app is served via Vite middleware integrated into the Express server — no separate dev server needed. The React dashboard (`client/`) provides a modern control center with grouped module sections, executive KPI cards, financial analysis panels, and trend charts using Recharts. It connects to the same Express API endpoints as the Vanilla JS frontend. The classic Vanilla JS pages remain fully functional at their original URLs. **API mapping notes**: `fetchDashboardData` sends `dateRange=custom&dateFrom=&dateTo=` to `/api/dashboard-data`, maps `period_revenue`→`totalRevenue` and `period_bookings`→`bookingCount`. `fetchExpenseAnalysis` calls `/api/accounting/expenses/analysis` (uses `from`/`to` params, returns `by_category[]` with `{category_key, name, total, count}`). `fetchIncomeAnalysis` calls `/api/accounting/income/analysis`. `fetchMonthlyTrend` fetches from both accounting analysis endpoints and merges income/expense trends. Tailwind v3 is required (v4 has incompatible PostCSS plugin format).

The original Vanilla JS frontend is built with HTML/CSS/JS for a lightweight user experience. It features a business intelligence dashboard with real-time metrics, a futuristic elite design system (Inter font, dual-mode design tokens, electric accent colors, SVG nav icons), and Chart.js for data visualization. Key modules include a calendar, commissions, pricing, dynamic pricing, accounting, messages, boat maintenance, marine conditions, fleet management, asset/inventory management, and an Executive Dashboard for profitability and operations analysis. A WhatsApp/Intercom-style AI chat widget provides real-time customer interaction. The accounting dashboard supports transaction management, bank reconciliation, categorization rules, an intelligent classification engine (Clasificación Inteligente tab) with confidence scoring, pattern learning, and accounting preview. Two financial analysis modules exist: Análisis de Ingresos (income analysis) and Análisis de Gastos (expense analysis), each with date presets, KPI cards, category breakdown bars, 6-month trend charts, drill-down panels, and full detail tables with search. Both modules filter strictly by account_type to prevent cross-contamination (income=revenue accounts only, expenses=expense accounts only). The top dashboard KPI cards (Ingresos Totales, Gastos Totales, Balance Neto) call the analysis endpoints directly for accurate figures. A unified category taxonomy (UNIFIED_EXPENSE_CATEGORIES / UNIFIED_INCOME_CATEGORIES) in server.js is the single source of truth used by all 4 analysis/drilldown endpoints and the Clasificación Inteligente engine. Drilldown endpoints accept `category_key` (semantic string) instead of `account_id`, enabling multi-account grouping per category via SQL CASE expressions on account_code. The messaging center offers a unified inbox, intelligent templates, AI-powered suggestions for customer inquiries, and performance analytics. All user-generated content is rendered securely to prevent XSS attacks. The boat maintenance system provides a 7-tab interface for tracking expenses, maintenance records, work orders, parts inventory, and analytics with accounting synchronization. The marine conditions monitoring module displays real-time NOAA data. The fleet management system offers a 5-tab interface for boat inventory, availability calendar, platform ID linking, and quick search functionality, featuring an Airbnb-style card design with professional labeling.

## Backend Architecture

Developed with Express.js (Node.js), the backend provides RESTful APIs with custom IP-based rate limiting and strict input validation. It integrates with OpenAI for AI services, Stripe for payments, and Twilio for WhatsApp notifications. The system processes webhooks from 13 booking platforms. Administrative and data management endpoints are protected by Replit Auth with OpenID Connect, while customer-facing AI chat and platform webhooks are publicly accessible with appropriate rate limiting. Robust try/catch wrappers are used for all accounting operations. The messaging center includes 11 RESTful endpoints for inbox management, thread conversations, message ingestion, sending messages, template management, and AI-powered suggestions. A `messageAnalysisService.js` analyzes customer inquiries using regex and NLP, and `templateEngine.js` renders dynamic templates. The boat maintenance system offers 19 RESTful endpoints for expense, scheduled expense, mechanic, maintenance, work order, and parts inventory management, with automatic accounting synchronization. The marine conditions module provides 5 RESTful endpoints with 5-minute caching and hourly safety alerts. The fleet management system offers 7 RESTful endpoints for boat CRUD, platform ID linking, availability queries, and smart search. An email synchronization system connects to sales@nadakiexcursions.com via IMAP (Outlook), ingests emails every 2 minutes, detects booking platforms, and creates message threads. The booking deposits system includes 5 new endpoints: GET/POST /api/brokers, PATCH /api/brokers/:id, GET/POST /api/customers, GET /api/bookings-ledger, PATCH /api/bookings-ledger/:id/complete. POST /api/booking-deposits atomically creates a deposit record, a bookings_ledger entry, an automatic AR (Cuenta por Cobrar) pointed to the correct party, AND a `transactions` record in account 2500 (Deferred Booking Deposits) so the deposit is immediately visible in accounting. The `linked_transaction_id` field on the deposit links back to this transaction. POST /api/booking-deposits/:id/apply creates TWO transactions: (1) income to the selected revenue account (booking completion), (2) expense from account 2500 (reversal to clear the deferred liability) — both dated today so they appear in the current-month transactions view. PATCH /api/booking-receivables/:id/mark-paid creates a cash receipt transaction in the bank account when an AR is marked as paid.

## Data Storage

PostgreSQL (Neon-backed via Replit) is the primary database, featuring a comprehensive schema across 36+ tables. Key tables include `bookings`, `captains`, `users`, `chat_conversations`, `platform_sync_status`, `commission_rules`, `captain_availability`, `boats`, `platform_pricing_policies`, a full suite of accounting tables, messaging tables, boat maintenance tables, and fleet management tables. New tables: `brokers` (agency/broker accounts), `customers` (direct client records), `bookings_ledger` (full booking record linking deposits + AR + parties), extended `booking_deposits` (booking_source, broker_id, customer_id, final_customer_*), extended `booking_receivables` (party_type, party_id, party_name, booking_id). **FASE 15 tables**: `boat_usage_log` (booking_id UNIQUE, boat_id, hours_reserved, hours_engine, status='pending'|'complete') auto-created on `POST /api/bookings`; `boat_fuel_log` (boat_id, log_date, gallons, cost_per_gallon, total_cost, odometer_hours, station). UUIDs/nanoid IDs are used for primary keys, and JSONB stores flexible data.

**FASE 16 — Trazabilidad y Normalización (reporting foundation)**:
- `bookings.total_amount` migrated from INTEGER to NUMERIC(12,2) (confirmed: USD dollar values, not cents, range $850–$1,521)
- `transactions.booking_id TEXT` (FK to bookings) and `transactions.ledger_id TEXT` (FK to bookings_ledger) added — enables direct booking→transaction traceability. Rule: one booking → many transactions (N:1).
- `payment_method TEXT` with CHECK constraint (`cash|card|transfer|online_platform|mixed|pending|unknown`) added to `bookings`, `bookings_ledger`, `booking_deposits`
- `base_price NUMERIC(12,2)`, `discount_amount NUMERIC(12,2) DEFAULT 0`, `discount_pct NUMERIC(5,2) DEFAULT 0` added to `bookings` and `bookings_ledger`
- `payment_date DATE` (date money was received, separate from `booking_date` which is date of service) added to `bookings` and `bookings_ledger`
- `sold_by_user_id TEXT`, `sold_by_name TEXT` added to `bookings` and `bookings_ledger`
- 19 transactions with `reference_type='booking'` that incorrectly pointed to `dep_*`/`ar_*` IDs corrected to `reference_type='other'`
- 7 new indexes: `idx_transactions_booking_id`, `idx_transactions_ledger_id`, `idx_bookings_payment_date`, `idx_bookings_payment_method`, `idx_bookings_boat_platform`, `idx_ppp_platform_boat`, `idx_ar_booking`
- **Known data gaps**: existing 6 bookings have `boat_id=NULL` (must be assigned manually); pricing policies point to non-existent `boat_id='boat1'` (must be updated to real boat IDs); no backfill possible for `payment_method`, `payment_date`, `sold_by_name` on historical records

## Authentication & Authorization

Replit Auth with OpenID Connect (OIDC) is implemented using `passport.js` and `connect-pg-simple` for PostgreSQL-backed session storage. Sessions have a 7-day TTL and use httpOnly and secure cookies. An `isAuthenticated` middleware protects all administrative and data management endpoints. The captain app uses dual authentication: Replit Auth for access control and Captain ID selection for in-app role identification.

## System Design Patterns

Key patterns include Chart.js lifecycle management, a robust accounting transaction system, a priority-based auto-categorization engine, an alert system for financial monitoring, a smart matching algorithm for bank reconciliation, a data merging strategy for marine conditions for accurate safety assessments, and a security-first rendering approach using DOM APIs to prevent XSS attacks. An email content cleaning system uses `html-to-text` and regex to remove tracking URLs and other unwanted elements, preserving content integrity. Error handling focuses on non-blocking failures, detailed logging, and graceful degradation.

# External Dependencies

## Third-Party Libraries

-   **React Dashboard**: React 18, Vite 5, TypeScript, Tailwind CSS, `@tanstack/react-query`, `recharts`, `lucide-react`. Entry: `client/src/main.tsx`. Served at `/app` via Vite middleware in Express.
-   **Vite Integration**: `vite.config.ts` at root, `tailwind.config.js`, `postcss.config.js`. Vite runs as middleware inside server.js (not a separate process). `client/tsconfig.json` for TypeScript support.
-   **Classic UI & Styling**: Chart.js, D3.js ecosystem.
-   **File Processing**: `csv-parse`, `ofx-js`.

## External Services & Integrations

-   **AI Service**: OpenAI GPT-4 (via Replit AI Integrations).
-   **Payment Processing**: Stripe.
-   **Messaging**: Twilio for WhatsApp.
-   **Database**: PostgreSQL (Neon via Replit).
-   **Booking Platforms**: Airbnb, GetMyBoat, BoatSetter, Viator, Expedia, TripAdvisor, Groupon, Booking.com, FareHarbor, Bokun, Rezdy, Peek, Xola.
-   **GetMyBoat Integration**: Email-based notification system with automatic detection and ingestion from sales@nadakiexcursions.com.
-   **Email Synchronization**: Gmail (nadakiportal@gmail.com) via IMAP for automatic ingestion every 2 minutes.
-   **WordPress Integration**: Webhook endpoints for bookings from `nadakiexcursions.com`.
-   **Marine Data**: NOAA Weather API, NOAA Tides & Currents API, NOAA NDBC Buoy 41009.