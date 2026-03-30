# Overview

This project is a multi-platform boat rental management system for Nadaki Excursions, designed to automate booking, payment, customer communication, captain scheduling, dynamic pricing, and accounting across 13 booking platforms. Its primary goal is to streamline operations, enhance customer experience via an AI assistant, and provide robust financial oversight. The system includes modules for task management, structured document storage, captain and stew payment management, and extended booking deposit functionalities, all accessible via gestion.nadakiexcursions.com.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

The frontend is built with Vanilla JavaScript (HTML/CSS/JS) for a lightweight user experience. It features a business intelligence dashboard with real-time metrics, an ocean/nautical themed custom CSS, and Chart.js for data visualization. Key modules include a calendar, commissions, pricing, dynamic pricing, accounting, messages, boat maintenance, marine conditions, and fleet management. A WhatsApp/Intercom-style AI chat widget provides real-time customer interaction. The accounting dashboard supports transaction management, bank reconciliation, and categorization rules. The messaging center offers a unified inbox, intelligent templates, AI-powered suggestions for customer inquiries, and performance analytics. All user-generated content is rendered securely to prevent XSS attacks. The boat maintenance system provides a 7-tab interface for tracking expenses, maintenance records, work orders, parts inventory, and analytics with accounting synchronization. The marine conditions monitoring module displays real-time NOAA data. The fleet management system offers a 5-tab interface for boat inventory, availability calendar, platform ID linking, and quick search functionality, featuring an Airbnb-style card design with professional labeling.

## Backend Architecture

Developed with Express.js (Node.js), the backend provides RESTful APIs with custom IP-based rate limiting and strict input validation. It integrates with OpenAI for AI services, Stripe for payments, and Twilio for WhatsApp notifications. The system processes webhooks from 13 booking platforms. Administrative and data management endpoints are protected by Replit Auth with OpenID Connect, while customer-facing AI chat and platform webhooks are publicly accessible with appropriate rate limiting. Robust try/catch wrappers are used for all accounting operations. The messaging center includes 11 RESTful endpoints for inbox management, thread conversations, message ingestion, sending messages, template management, and AI-powered suggestions. A `messageAnalysisService.js` analyzes customer inquiries using regex and NLP, and `templateEngine.js` renders dynamic templates. The boat maintenance system offers 19 RESTful endpoints for expense, scheduled expense, mechanic, maintenance, work order, and parts inventory management, with automatic accounting synchronization. The marine conditions module provides 5 RESTful endpoints with 5-minute caching and hourly safety alerts. The fleet management system offers 7 RESTful endpoints for boat CRUD, platform ID linking, availability queries, and smart search. An email synchronization system connects to sales@nadakiexcursions.com via IMAP (Outlook), ingests emails every 2 minutes, detects booking platforms, and creates message threads. The booking deposits system includes 5 new endpoints: GET/POST /api/brokers, PATCH /api/brokers/:id, GET/POST /api/customers, GET /api/bookings-ledger, PATCH /api/bookings-ledger/:id/complete. POST /api/booking-deposits atomically creates a deposit record, a bookings_ledger entry, and an automatic AR (Cuenta por Cobrar) pointed to the correct party (customer for direct, broker for broker-sourced bookings).

## Data Storage

PostgreSQL (Neon-backed via Replit) is the primary database, featuring a comprehensive schema across 36+ tables. Key tables include `bookings`, `captains`, `users`, `chat_conversations`, `platform_sync_status`, `commission_rules`, `captain_availability`, `boats`, `platform_pricing_policies`, a full suite of accounting tables, messaging tables, boat maintenance tables, and fleet management tables. New tables: `brokers` (agency/broker accounts), `customers` (direct client records), `bookings_ledger` (full booking record linking deposits + AR + parties), extended `booking_deposits` (booking_source, broker_id, customer_id, final_customer_*), extended `booking_receivables` (party_type, party_id, party_name, booking_id). UUIDs/nanoid IDs are used for primary keys, and JSONB stores flexible data.

## Authentication & Authorization

Replit Auth with OpenID Connect (OIDC) is implemented using `passport.js` and `connect-pg-simple` for PostgreSQL-backed session storage. Sessions have a 7-day TTL and use httpOnly and secure cookies. An `isAuthenticated` middleware protects all administrative and data management endpoints. The captain app uses dual authentication: Replit Auth for access control and Captain ID selection for in-app role identification.

## System Design Patterns

Key patterns include Chart.js lifecycle management, a robust accounting transaction system, a priority-based auto-categorization engine, an alert system for financial monitoring, a smart matching algorithm for bank reconciliation, a data merging strategy for marine conditions for accurate safety assessments, and a security-first rendering approach using DOM APIs to prevent XSS attacks. An email content cleaning system uses `html-to-text` and regex to remove tracking URLs and other unwanted elements, preserving content integrity. Error handling focuses on non-blocking failures, detailed logging, and graceful degradation.

# External Dependencies

## Third-Party Libraries

-   **UI & Styling**: Tailwind CSS, `class-variance-authority`, `clsx`, `aria-hidden`.
-   **Data Visualization**: D3.js ecosystem, Chart.js.
-   **Command Interface**: `cmdk`.
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