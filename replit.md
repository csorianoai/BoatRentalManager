# Overview

This project is a multi-platform boat rental management system for Nadaki Excursions, designed to automate booking, payment, customer communication, captain scheduling, dynamic pricing, and accounting across 13 booking platforms. Its primary goal is to streamline operations, enhance customer experience via an AI assistant, and provide robust financial oversight. The system includes modules for task management, structured document storage, captain and stew payment management, and extended booking deposit functionalities, all accessible via gestion.nadakiexcursions.com.

# User Preferences

Preferred communication style: Simple, everyday language.

# Fleet Operations Center (Fase activa)

Módulo en `/fleet.html`, pestaña "Fleet Operations Center". Código en `public/assets/js/operations/fleet-ops.js`.

**Fases completadas:**
- Fase 1: Infraestructura y Timeline base
- Fase 2: Detail Drawer, Alert Engine, Today Strip, Action Handlers. fleet_config se puebla automáticamente desde la tabla boats en initializeDatabase().
- Fase 3 (actual): Vista Lista con filtros/sort, selector de vistas Timeline|Lista, atajos de teclado T/L/flechas/H

**Atajos de teclado:**
- `T` = Vista Timeline, `L` = Vista Lista
- `←/→` = Navegar rango, `H` = Ir a Hoy, `Esc` = Cerrar drawer

# Protocolo de Auto-Validación (obligatorio antes de deploy)

```bash
node validation/self-check.js --target=dev    # desarrollo
node validation/self-check.js --target=prod   # producción
node validation/self-check.js --target=all    # comparación
```

Regla: 0 FAIL y ≤2 WARN → avanzar. Ver `validation/VALIDATION.md`.

Tests activos: 29 tests (I-01..I-08, D-01..D-06, U-01..U-13, C-01..C-04)

# System Architecture

## Frontend Architecture

The system features a dual-layer frontend. A modern React, TypeScript, and Tailwind CSS v3 dashboard (`/app`) coexists with original Vanilla JavaScript pages (`public/`). The React app provides a modern control center with KPI cards, financial analysis panels, and trend charts using Recharts. The original Vanilla JS frontend offers a business intelligence dashboard with real-time metrics, a futuristic design system, and Chart.js for data visualization. Key modules include calendar, commissions, pricing, accounting, messages, boat maintenance, marine conditions, fleet management, and an Executive Dashboard. An AI chat widget provides real-time customer interaction. The accounting dashboard supports transaction management, bank reconciliation, categorization, and intelligent classification. Financial analysis modules for income and expenses include date presets, KPI cards, category breakdowns, and 6-month trend charts. The messaging center offers a unified inbox, intelligent templates, and AI-powered suggestions. All user-generated content is rendered securely to prevent XSS attacks. The boat maintenance system provides a 7-tab interface for tracking expenses, maintenance, work orders, parts inventory, and analytics. The marine conditions module displays real-time NOAA data. The fleet management system offers a 5-tab interface for boat inventory, availability, platform ID linking, and quick search.

## Backend Architecture

Developed with Express.js (Node.js), the backend provides RESTful APIs with custom IP-based rate limiting and strict input validation. It integrates with OpenAI for AI services, Stripe for payments, and Twilio for WhatsApp notifications. The system processes webhooks from 13 booking platforms. Administrative and data management endpoints are protected by Replit Auth with OpenID Connect, while customer-facing AI chat and platform webhooks are publicly accessible. Robust error handling is implemented for all accounting operations. The messaging center includes 11 RESTful endpoints for inbox management, message ingestion, and AI-powered suggestions. The boat maintenance system offers 19 RESTful endpoints for managing expenses, schedules, mechanics, maintenance, work orders, and parts inventory, with automatic accounting synchronization. The marine conditions module provides 5 RESTful endpoints with caching and hourly safety alerts. The fleet management system offers 7 RESTful endpoints for boat CRUD, platform ID linking, availability queries, and smart search. An email synchronization system connects to sales@nadakiexcursions.com via IMAP for automatic email ingestion and message thread creation. The booking deposits system includes 5 new endpoints for managing brokers, customers, booking ledgers, and atomically processing booking deposits and their application.

## Data Storage

PostgreSQL (Neon-backed via Replit) is the primary database, featuring a comprehensive schema across 36+ tables. Key tables include `bookings`, `captains`, `users`, `chat_conversations`, `platform_sync_status`, `commission_rules`, `captain_availability`, `boats`, `platform_pricing_policies`, accounting tables, messaging tables, boat maintenance tables, and fleet management tables. New tables include `brokers`, `customers`, `bookings_ledger`, and extended `booking_deposits` and `booking_receivables` for enhanced booking and financial traceability. Tables for fleet operations like `fleet_config`, `holds`, `maintenance_blocks`, and `operations_alerts` support advanced fleet management. UUIDs/nanoid IDs are used for primary keys, and JSONB stores flexible data. Key fields like `bookings.total_amount` have been migrated to `NUMERIC(12,2)` for precision, and `transactions` now include `booking_id` and `ledger_id` for direct booking-to-transaction traceability.

## Authentication & Authorization

Replit Auth with OpenID Connect (OIDC) is implemented using `passport.js` and `connect-pg-simple` for PostgreSQL-backed session storage. Sessions have a 7-day TTL and use httpOnly and secure cookies. An `isAuthenticated` middleware protects administrative and data management endpoints. The captain app uses dual authentication: Replit Auth for access control and Captain ID selection for in-app role identification.

## System Design Patterns

Key patterns include Chart.js lifecycle management, a robust accounting transaction system, a priority-based auto-categorization engine, an alert system for financial monitoring, a smart matching algorithm for bank reconciliation, a data merging strategy for marine conditions for accurate safety assessments, and a security-first rendering approach using DOM APIs to prevent XSS attacks. An email content cleaning system uses `html-to-text` and regex to remove tracking URLs and other unwanted elements, preserving content integrity. Error handling focuses on non-blocking failures, detailed logging, and graceful degradation.

# External Dependencies

## Third-Party Libraries

-   **React Dashboard**: React 18, Vite 5, TypeScript, Tailwind CSS, `@tanstack/react-query`, `recharts`, `lucide-react`.
-   **Vite Integration**: `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`.
-   **Classic UI & Styling**: Chart.js, D3.js ecosystem.
-   **File Processing**: `csv-parse`, `ofx-js`.

## External Services & Integrations

-   **AI Service**: OpenAI GPT-4 (via Replit AI Integrations).
-   **Payment Processing**: Stripe.
-   **Messaging**: Twilio for WhatsApp.
-   **Database**: PostgreSQL (Neon via Replit).
-   **Booking Platforms**: Airbnb, GetMyBoat, BoatSetter, Viator, Expedia, TripAdvisor, Groupon, Booking.com, FareHarbor, Bokun, Rezdy, Peek, Xola.
-   **Email Synchronization**: Gmail (nadakiportal@gmail.com) via IMAP.
-   **WordPress Integration**: Webhook endpoints for bookings from `nadakiexcursions.com`.
-   **Marine Data**: NOAA Weather API, NOAA Tides & Currents API, NOAA NDBC Buoy 41009.