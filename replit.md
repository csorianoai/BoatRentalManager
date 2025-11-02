# Overview

This project is a comprehensive multi-platform boat rental management system developed for Nadaki Excursions. It automates booking management, payment processing, customer communication, captain scheduling, dynamic pricing, and accounting across 13 different booking platforms. The system aims to streamline operations, enhance customer experience through an AI assistant, and provide robust financial oversight.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

**[MAJOR REDESIGN IN PROGRESS - Nov 2025]** The frontend is undergoing a complete migration from Vanilla JavaScript to **React 18 + TypeScript** for improved maintainability, developer experience, and UI capabilities. 

**New Stack:**
- **React 18.3.1** with TypeScript for type-safe component development
- **Wouter** for lightweight client-side routing (not react-router-dom)
- **Tailwind CSS 4.1.16** with custom nautical color palette:
  * Primary (Ocean Blue Navy): #0A2E52 (HSL 210 70% 18%)
  * Secondary (Ocean Blue Bright): #1E90FF (HSL 210 100% 56%)
  * Accent (Premium Gold): #D4AF37 (HSL 45 75% 53%)
  * Destructive (Alert Red): #DC2626 (HSL 0 72% 51%)
- **Shadcn/ui** component library with class-variance-authority (CVA) for consistent UI patterns
- **Framer Motion** for smooth animations and microinteractions
- **TanStack Query (React Query v5)** for API state management and caching
- **Recharts** for data visualization (replacing Chart.js)
- **Lucide React** for icons (no emojis per design guidelines)
- **Vite 7.x** as build tool and dev server

**Theme System:**
Custom ThemeProvider with dark/light/system modes, localStorage persistence, and automatic document.documentElement class toggling.

**UI Components:**
Building a comprehensive component library following shadcn patterns:
- **Base Components** (src/components/ui/): Button (CVA variants), Card, Form controls, Badge, Input, etc.
- **Premium Components** (src/components/):
  - BoatCard: Display boats with hover animations, dynamic badges, pricing, features, status indicators
  - PricingCard: Animated pricing plans with highlighted variants, ribbon badges, staggered feature reveals
  - FeatureCard: Module cards with Lucide icons, stagger entrance animations, hover elevation
  - MetricCard: Dashboard metrics with Framer Motion stagger effects

**Completed Features (React Migration - Nov 2, 2025):**
- ✅ Mobile-first responsive navigation with Navbar, MobileSidebar, FloatingActionMenu using wouter's navigate() hook
- ✅ ThemeProvider with dark/light/system modes and ThemeToggle component
- ✅ Animated Hero section with Framer Motion, QuickSearch component, and WeatherBanner
- ✅ Dashboard with MetricCards (Framer Motion animations), Recharts visualizations, React Query integration
- ✅ React Query default fetcher with credentials: 'include' for authenticated API requests
- ✅ Shared API utilities (src/lib/api.ts): fetcher() for GET, apiRequest() for mutations
- ✅ Premium UI Components: BoatCard (glow hover effects), PricingCard (animated with ribbons), FeatureCard (Lucide iconography)
- ✅ Complete Loading State System: Skeleton component base, 7 specialized skeletons (BoatCard, PricingCard, FeatureCard, MetricCard, Table, Dashboard, Form), LoadingButton with spinner, integration in premium components
- ✅ Demo Loading Page (/demo-loading): Interactive showcase of all loading states with button microinteractions, skeleton components, and async operation simulations
- ✅ Comprehensive API Integration Layer (src/hooks/): 6 custom hook modules with 50+ hooks total covering all backend APIs (bookings, marine, pricing, accounting, maintenance, messages). All hooks follow React Query v5 best practices with hierarchical query keys for efficient cache invalidation, proper TypeScript typing, and strategic staleTime configuration.
- ✅ Dynamic Pricing Intelligence Page (/pricing): 4 animated tabs (Overview, Demand Forecast, Competitors, Market Events), Recharts AreaChart for 14-day ML demand forecasting, region + boat type filters (Miami/Keys/Tampa/Fort Lauderdale), competitor analysis grid, market event tracking, LoadingButton for AI recommendations, comprehensive loading states with DashboardSkeleton and TableRowSkeleton.
- ✅ Marine Conditions Real-Time Page (/marine): Live NOAA data integration with safety score indicator (dynamic color coding), 4 current conditions cards (temperature, wind, waves, visibility), weather forecast display (6 periods), tide chart (AreaChart with gradient), NDBC Buoy 41009 real-time data, alert banners for dangerous conditions, refresh functionality with cache clearing using React Query prefix-based invalidation.

**In Progress (React Migration):**
- Comprehensive accounting interface with transaction management
- Unified messaging center across 13 booking platforms
- Boat maintenance tracking system with expense synchronization
- Mobile optimization (Swiper.js, touch targets, viewport)
- PWA configuration (manifest, service worker, icons)
- E2E testing with Playwright

**Legacy System:**
The original Vanilla JavaScript application remains operational in the `public/` folder during the transition period. Backend Express APIs remain unchanged and compatible with both frontends.

## Backend Architecture

Built with Express.js (Node.js), the backend provides RESTful APIs, implements custom IP-based rate limiting (20 requests/min), and strict input validation. It integrates with OpenAI for AI services, Stripe for payments, and Twilio for WhatsApp notifications. The system handles webhooks from 13 different booking platforms. All administrative and data management endpoints are protected using Replit Auth with OpenID Connect, while customer-facing AI chat and platform webhooks are publicly accessible (with rate limiting where appropriate). Try/catch wrappers are used on all accounting operations for robustness. The messaging center (FASE 9) provides 9 RESTful endpoints for inbox management, thread conversations, manual message ingestion, sending via WhatsApp/Email, template CRUD, and analytics. It uses a hybrid ingestion model: automatic via webhooks for WhatsApp/Email and manual entry for platforms without public APIs (Airbnb, GetMyBoat, BoatSetter, Viator). The boat maintenance system (FASE 10) provides 14 RESTful endpoints for expense tracking, mechanic management, maintenance records, work orders, parts inventory, and analytics with automatic accounting sync that creates transactions with reference_type='other' in the transactions table. The marine conditions module provides 5 RESTful endpoints (/api/marine/summary, /current, /forecast, /tides, /alerts) with 5-minute caching, hourly safety alerts via cron, and integration with NOAA Weather API, Tides & Currents API, and NDBC Buoy 41009 for Biscayne Bay. The dynamic pricing system (FASE 11) provides 9 RESTful endpoints that are publicly accessible (no authentication required per user preference) for ML-based demand forecasting, competitor data management, market events tracking, pricing recommendations, market insights, and opportunity identification. All endpoints use intelligent caching (24-hour for demand forecasts, 5-minute for market data) and support region-based filtering (Miami, Keys, Tampa, Fort Lauderdale).

## Data Storage

PostgreSQL (Neon-backed via Replit) is the primary database, featuring a comprehensive schema across 30 tables. Key tables include `bookings`, `captains`, `users`, `chat_conversations`, `platform_sync_status`, `commission_rules`, `captain_availability`, `boats`, `platform_pricing_policies`, a full suite of accounting tables (`chart_of_accounts`, `transactions`, `bank_statements`, `reconciliation_sessions`, `categorization_rules`, `accounting_alerts`), FASE 9 messaging tables (`platform_configs`, `message_threads`, `platform_messages`, `message_templates`), and FASE 10 boat maintenance tables (`boat_expenses`, `mechanics`, `maintenance_records`, `parts_inventory`, `work_orders`). UUIDs are used for primary keys, and JSONB stores flexible data like chat messages.

## Authentication & Authorization

Replit Auth with OpenID Connect (OIDC) is implemented using `passport.js` and `connect-pg-simple` for PostgreSQL-backed session storage. Sessions have a 7-day TTL and use httpOnly and secure cookies. An `isAuthenticated` middleware protects all administrative and data management endpoints. The captain app uses dual authentication: Replit Auth for access control and a Captain ID selection for in-app role identification.

## System Design Patterns

Key patterns include:

**Frontend (React):**
- **React Query Default Fetcher Pattern**: Centralized API fetching via default queryFn in QueryClient configuration. All useQuery calls automatically include credentials: 'include' for session cookie authentication. Configured with 5-minute staleTime, retry: 1, and refetchOnWindowFocus: false for optimal performance.
- **Shared API Utilities (src/lib/api.ts)**: Two core functions - fetcher() for GET requests (React Query), apiRequest() for mutations (POST/PUT/DELETE). Both include credentials and proper error handling.
- **Custom Hooks Architecture (src/hooks/)**: Organized into 6 modules (use-bookings, use-marine, use-pricing, use-accounting, use-maintenance, use-messages) with barrel export via index.ts. Query keys use hierarchical arrays (e.g., ['/api/marine', 'summary']) enabling efficient prefix-based cache invalidation. Mutations include automatic queryClient.invalidateQueries for affected caches. Strategic staleTime configuration: 5-10 minutes for frequently updated data, 30-60 minutes for stable data, 24 hours for ML forecasts.
- **SPA Routing with wouter**: Lightweight routing using wouter's navigate() hook via useLocation() instead of nested anchor tags to avoid DOM nesting violations.
- **Component Composition**: Premium cards (BoatCard, PricingCard, FeatureCard) with Framer Motion stagger animations, reusable UI components from shadcn/ui library, dynamic theming with boat-type badges, price formatting helpers, interactive callbacks.

**Backend (Node.js/Express):**
- Chart.js lifecycle management for stable dashboards
- Robust transaction type system for accounting
- Priority-based auto-categorization engine with multiple operators
- Alert system for financial monitoring
- Smart matching algorithm for bank reconciliation supporting various import formats
- Data merging strategy for marine conditions that combines weather station air temperature with buoy water temperature to provide accurate safety assessments
- Dual-mode event filtering pattern for dynamic pricing: `activeOnly=false` for UI display (shows all events: past, present, future) and `activeOnly=true` for internal pricing calculations (only events where today falls within start_date and end_date range)
- Demand forecasts use 24-hour PostgreSQL UPSERT-based caching with unique constraints on (forecast_date, region, boat_type) to prevent duplicates and enable daily refresh cycles
- Error handling focuses on non-blocking failures with detailed logging and graceful degradation

# External Dependencies

## Third-Party Libraries

-   **Frontend Framework**: React 18.3.1, TypeScript 5.x
-   **Routing**: Wouter (lightweight React router)
-   **UI & Styling**: Tailwind CSS 4.1.16, @tailwindcss/postcss, class-variance-authority, clsx, tailwind-merge
-   **Component Library**: Shadcn/ui (Radix UI primitives)
-   **State Management**: TanStack Query v5 (React Query) with default fetcher configured in App.tsx, credentials: 'include' for auth
-   **Animations**: Framer Motion, Swiper.js
-   **Data Visualization**: Recharts (React charts), D3.js ecosystem
-   **Icons**: Lucide React (no emojis)
-   **Forms**: React Hook Form, Zod validation
-   **Build Tool**: Vite 7.x
-   **File Processing**: csv-parse, ofx-js

## External Services & Integrations

-   **AI Service**: OpenAI GPT-4 (via Replit AI Integrations) for the AI assistant.
-   **Payment Processing**: Stripe for secure payment collection.
-   **Messaging**: Twilio for WhatsApp notifications.
-   **Database**: PostgreSQL (Neon via Replit).
-   **Booking Platforms (13 total)**: Airbnb, GetMyBoat, BoatSetter, Viator, Expedia, TripAdvisor, Groupon, Booking.com, FareHarbor, Bokun, Rezdy, Peek, Xola.
-   **WordPress Integration**: Webhook endpoints for receiving bookings from WordPress forms on `nadakiexcursions.com`.
-   **Marine Data**: NOAA Weather API (free, no key), NOAA Tides & Currents API (free, no key), NOAA NDBC Buoy 41009 for Biscayne Bay real-time conditions.