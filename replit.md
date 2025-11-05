# Overview

This project is a comprehensive multi-platform boat rental management system developed for Nadaki Excursions. It automates booking management, payment processing, customer communication, captain scheduling, dynamic pricing, and accounting across 13 different booking platforms. The system aims to streamline operations, enhance customer experience through an AI assistant, and provide robust financial oversight.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

The frontend uses Vanilla JavaScript (HTML/CSS/JS) for a lightweight and fast user experience. It features a business intelligence dashboard with real-time metrics, an ocean/nautical themed custom CSS, and Chart.js for data visualization. A WhatsApp/Intercom-style AI chat widget provides real-time customer interaction with conversation history. The accounting dashboard includes financial metrics, Chart.js visualizations (with critical lifecycle management to prevent errors), transaction management, bank reconciliation, and categorization rules. The messaging center (FASE 9) provides a unified inbox with thread-based conversations, manual message ingestion, quick reply templates, and performance analytics across all 13 booking platforms. The boat maintenance system (FASE 10) features a comprehensive 6-tab interface for tracking expenses, maintenance records, work orders, parts inventory, mechanics, and analytics with automatic accounting synchronization. The marine conditions monitoring module displays real-time NOAA data including weather, tides, alerts, and buoy observations with a safety scoring system and auto-refresh every 5 minutes. The fleet management system (FASE 11) provides a comprehensive 4-tab interface for boat inventory with complete specifications, photos, amenities, and pricing; a visual calendar showing availability across all boats; platform ID linking for all 13 OTAs; and a quick search tool to find available boats based on date, capacity, and type criteria.

## Backend Architecture

Built with Express.js (Node.js), the backend provides RESTful APIs, implements custom IP-based rate limiting (20 requests/min), and strict input validation. It integrates with OpenAI for AI services, Stripe for payments, and Twilio for WhatsApp notifications. The system handles webhooks from 13 different booking platforms. All administrative and data management endpoints are protected using Replit Auth with OpenID Connect, while customer-facing AI chat and platform webhooks are publicly accessible (with rate limiting where appropriate). Try/catch wrappers are used on all accounting operations for robustness. The messaging center (FASE 9) provides 9 RESTful endpoints for inbox management, thread conversations, manual message ingestion, sending via WhatsApp/Email, template CRUD, and analytics. It uses a hybrid ingestion model: automatic via webhooks for WhatsApp/Email and manual entry for platforms without public APIs (Airbnb, GetMyBoat, BoatSetter, Viator). The boat maintenance system (FASE 10) provides 14 RESTful endpoints for expense tracking, mechanic management, maintenance records, work orders, parts inventory, and analytics with automatic accounting sync that creates transactions with reference_type='other' in the transactions table. The marine conditions module provides 5 RESTful endpoints (/api/marine/summary, /current, /forecast, /tides, /alerts) with 5-minute caching, hourly safety alerts via cron, and integration with NOAA Weather API, Tides & Currents API, and NDBC Buoy 41009 for Biscayne Bay. The fleet management system (FASE 11) provides 7 RESTful endpoints for complete boat CRUD operations, platform ID linking, availability calendar queries, and smart search functionality that checks real-time availability and filters by capacity/type/date.

## Data Storage

PostgreSQL (Neon-backed via Replit) is the primary database, featuring a comprehensive schema across 32 tables. Key tables include `bookings`, `captains`, `users`, `chat_conversations`, `platform_sync_status`, `commission_rules`, `captain_availability`, `boats`, `platform_pricing_policies`, a full suite of accounting tables (`chart_of_accounts`, `transactions`, `bank_statements`, `reconciliation_sessions`, `categorization_rules`, `accounting_alerts`), FASE 9 messaging tables (`platform_configs`, `message_threads`, `platform_messages`, `message_templates`), FASE 10 boat maintenance tables (`boat_expenses`, `mechanics`, `maintenance_records`, `parts_inventory`, `work_orders`), and FASE 11 fleet management tables (`boat_availability` for calendar management). The `boats` table was expanded to include platform_ids (JSONB linking to all 13 OTAs), photos array, amenities, full descriptions, hourly/daily base rates, and detailed specifications (make, model, year, length, location). UUIDs are used for primary keys, and JSONB stores flexible data like chat messages and platform mappings.

## Authentication & Authorization

Replit Auth with OpenID Connect (OIDC) is implemented using `passport.js` and `connect-pg-simple` for PostgreSQL-backed session storage. Sessions have a 7-day TTL and use httpOnly and secure cookies. An `isAuthenticated` middleware protects all administrative and data management endpoints. The captain app uses dual authentication: Replit Auth for access control and a Captain ID selection for in-app role identification.

## System Design Patterns

Key patterns include Chart.js lifecycle management for stable dashboards, a robust transaction type system for accounting, a priority-based auto-categorization engine with multiple operators, an alert system for financial monitoring, a smart matching algorithm for bank reconciliation supporting various import formats, and a data merging strategy for marine conditions that combines weather station air temperature with buoy water temperature to provide accurate safety assessments. Error handling focuses on non-blocking failures with detailed logging and graceful degradation.

# External Dependencies

## Third-Party Libraries

-   **UI & Styling**: Tailwind CSS, `class-variance-authority`, `clsx`, `aria-hidden`.
-   **Data Visualization**: D3.js ecosystem, Chart.js.
-   **Command Interface**: `cmdk`.
-   **File Processing**: `csv-parse`, `ofx-js`.

## External Services & Integrations

-   **AI Service**: OpenAI GPT-4 (via Replit AI Integrations) for the AI assistant.
-   **Payment Processing**: Stripe for secure payment collection.
-   **Messaging**: Twilio for WhatsApp notifications.
-   **Database**: PostgreSQL (Neon via Replit).
-   **Booking Platforms (13 total)**: Airbnb, GetMyBoat, BoatSetter, Viator, Expedia, TripAdvisor, Groupon, Booking.com, FareHarbor, Bokun, Rezdy, Peek, Xola.
-   **WordPress Integration**: Webhook endpoints for receiving bookings from WordPress forms on `nadakiexcursions.com`.
-   **Marine Data**: NOAA Weather API (free, no key), NOAA Tides & Currents API (free, no key), NOAA NDBC Buoy 41009 for Biscayne Bay real-time conditions.