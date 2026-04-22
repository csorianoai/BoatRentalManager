# Overview

This project is a multi-platform boat rental management system for Nadaki Excursions. Its core purpose is to automate and streamline booking, payment, customer communication, captain scheduling, dynamic pricing, and accounting across 13 booking platforms. Key objectives include enhancing customer experience through an AI assistant, providing robust financial oversight, and consolidating operational workflows. The system integrates modules for task management, structured document storage, captain and stew payment management, and extended booking deposit functionalities, all accessible via gestion.nadakiexcursions.com.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

The system employs a dual-layer frontend: a modern React, TypeScript, and Tailwind CSS v3 dashboard (`/app`) for advanced analytics and a business intelligence dashboard built with Vanilla JavaScript, featuring real-time metrics and Chart.js for data visualization. Both interfaces provide a comprehensive control center. Core modules include calendar, commissions, pricing, accounting, messages, boat maintenance, marine conditions, fleet management, and an Executive Dashboard. An AI chat widget enables real-time customer interaction. UI/UX emphasizes a futuristic design system, secure content rendering against XSS, and clear data presentation with KPI cards, financial analysis panels, and trend charts.

## Backend Architecture

The backend is built with Express.js (Node.js), providing RESTful APIs with custom IP-based rate limiting and strict input validation. It integrates with OpenAI for AI services, Stripe for payment processing, and Twilio for WhatsApp notifications. The system processes webhooks from 13 booking platforms. Administrative and data management endpoints are secured using Replit Auth with OpenID Connect, while customer-facing AI chat and platform webhooks are publicly accessible. The backend ensures robust error handling for all operations, including 11 RESTful endpoints for messaging, 19 for boat maintenance, and 7 for fleet management. An email synchronization system ingests emails via IMAP.

## Data Storage

PostgreSQL (Neon-backed via Replit) serves as the primary database, featuring a comprehensive schema across over 36 tables. Key entities include `bookings`, `captains`, `users`, `chat_conversations`, `platform_sync_status`, `commission_rules`, `captain_availability`, `boats`, `platform_pricing_policies`, accounting, messaging, boat maintenance, and fleet management related tables. New tables such as `brokers`, `customers`, `bookings_ledger`, and extensions to `booking_deposits` and `booking_receivables` enhance financial traceability. UUIDs/nanoid IDs are used for primary keys, and JSONB stores flexible data. Numeric precision is maintained for financial fields, and direct booking-to-transaction traceability is implemented.

## Authentication & Authorization

Replit Auth with OpenID Connect (OIDC) is implemented using `passport.js` and `connect-pg-simple` for PostgreSQL-backed session storage. Sessions have a 7-day TTL and utilize httpOnly and secure cookies. An `isAuthenticated` middleware protects administrative and data management endpoints. The captain application uses a dual authentication model: Replit Auth for access control combined with Captain ID selection for in-app role identification.

## System Design Patterns

The system incorporates various design patterns including robust accounting transaction management, a priority-based auto-categorization engine, an alert system for financial monitoring, a smart matching algorithm for bank reconciliation, and a data merging strategy for marine conditions. Security is paramount with DOM API-based rendering to prevent XSS attacks. An email content cleaning system uses `html-to-text` and regex for integrity. Error handling focuses on non-blocking failures, detailed logging, and graceful degradation.

# External Dependencies

## Third-Party Libraries

-   **Frontend Frameworks**: React 18, Vite 5, TypeScript, Tailwind CSS.
-   **Data Management**: `@tanstack/react-query`.
-   **Charting & Visualization**: `recharts`, Chart.js, D3.js ecosystem.
-   **Icons**: `lucide-react`.
-   **File Processing**: `csv-parse`, `ofx-js`.

## External Services & Integrations

-   **AI Service**: OpenAI GPT-4 (via Replit AI Integrations).
-   **Payment Processing**: Stripe.
-   **Messaging**: Twilio for WhatsApp.
-   **Database**: PostgreSQL (Neon via Replit).
-   **Booking Platforms**: Airbnb, GetMyBoat, BoatSetter, Viator, Expedia, TripAdvisor, Groupon, Booking.com, FareHarbor, Bokun, Rezdy, Peek, Xola.
-   **Email Synchronization**: Gmail (sales@nadakiexcursions.com) via IMAP.
-   **CMS Integration**: WordPress webhooks from `nadakiexcursions.com`.
-   **Marine Data**: NOAA Weather API, NOAA Tides & Currents API, NOAA NDBC Buoy 41009.