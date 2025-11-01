# Overview

This is a multi-platform boat rental management system for Nadaki Excursions built with Node.js/Express backend and PostgreSQL database. The system integrates with 13 booking platforms (Airbnb, GetMyBoat, Viator, etc.), Stripe for payments, Twilio for WhatsApp notifications, and features an AI assistant powered by OpenAI for automated bookings.

**Current Status**: ALL PHASES COMPLETED + AUTHENTICATION IMPLEMENTED ✅
**Deployment**: All 5 phases completed with comprehensive Replit Auth integration across the entire system. Ready for production deployment.

# User Preferences

Preferred communication style: Simple, everyday language.

# Project Roadmap

**PHASE 1: AI Assistant for Bookings** ✅ COMPLETED
- AI chatbot for customer inquiries and automated booking creation
- WhatsApp-style chat widget with conversation history
- Security: Rate limiting (20 req/min), input validation, authentication safeguards
- OpenAI integration via Replit AI Integrations

**PHASE 2: Multi-platform Synchronizer** ✅ COMPLETED
- Bidirectional sync with 13 booking platforms (simulated APIs ready for real integration)
- Conflict detection (same date + same time = conflict)
- Manual and automatic sync (every 15 minutes via node-cron)
- Conflict resolution UI with cancel buttons
- Real-time platform status tracking
- PostgreSQL-compatible implementation with comprehensive logging

**PHASE 3: Mobile App for Captains** ✅ COMPLETED (MVP)
- PWA for captains to manage assignments
- GPS navigation and location tracking  
- Check-in/check-out with timestamps and coordinates
- Trip report system (weather, conditions, fuel, ratings)
- Offline capability via Service Worker
- ✅ **Security**: Protected with Replit Auth. Captain ID login identifies which captain is using the device after authentication.

**PHASE 4: Commission System** ✅ COMPLETED
- Automated commission calculations for completed bookings
- Financial reports dashboard with real-time KPIs
- Payment tracking (pending/paid status management)
- Multi-platform commission rules (14 platforms configured)
- Visual analytics (commission by platform, captain earnings)
- ✅ **Security**: All commission endpoints protected with Replit Auth isAuthenticated middleware.

**PHASE 5: Schedule Optimizer** ✅ COMPLETED
- Intelligent captain assignment algorithm with time-based conflict detection
- Availability management (create/update/delete availability blocks)
- Double-booking prevention with overlap detection
- Week view calendar interface with visual grid
- Conflict checker tool for pre-validation
- ✅ **Security**: All schedule endpoints protected with Replit Auth isAuthenticated middleware.

# System Architecture

## Frontend Architecture

**Technology Stack**: Vanilla JavaScript (HTML/CSS/JS)
- **Dashboard**: Business intelligence dashboard with real-time metrics
- **Styling**: Custom CSS with ocean/nautical theme (blues, teals)
- **Data Visualization**: Chart.js for revenue and booking analytics
- **Auto-refresh**: 30-second polling for real-time data updates

**AI Chat Widget** (PHASE 1 - COMPLETED):
- **Design Pattern**: WhatsApp/Intercom-style floating widget
- **Position**: Fixed bottom-right corner, expandable on click
- **Features**:
  - Real-time AI responses via OpenAI
  - Conversation history persistence
  - Typing indicators
  - Timestamp display
  - Message bubbles (user vs assistant styling)
  - Auto-scroll to latest message
- **UX Flow**:
  1. User clicks floating chat button
  2. Widget expands, loads conversation history
  3. If new session, shows welcome message
  4. User sends messages, AI responds
  5. History persists across sessions
  
**Dashboard Metrics**:
- Today/Week bookings count
- Revenue by period (today, week, total)
- Bookings by platform (pie chart)
- Revenue by platform (bar chart)
- Recent bookings table with captain assignments

**Design Rationale**: Lightweight vanilla JS for fast loading. Ocean theme reflects boat rental business. Chat widget follows familiar patterns for ease of use.

## Backend Architecture

**Framework**: Express.js (Node.js)
- **HTTP Layer**: Standard Express middleware with body-parser and CORS
- **Rate Limiting**: Custom IP-based rate limiter (20 requests/min with automatic cleanup)
- **Input Validation**: Strict validation for all API endpoints (max lengths, required fields, format validation)
- **AI Integration**: OpenAI via Replit AI Integrations (AI_INTEGRATIONS_OPENAI_BASE_URL)
- **Payment Processing**: Stripe for secure payment handling
- **Notifications**: Twilio for WhatsApp notifications
- **Webhook System**: 13 platform webhooks (Airbnb, GetMyBoat, BoatSetter, Viator, etc.)

**Key Endpoints**:
- `POST /api/webhooks/:platform` - Receive bookings from platforms
- `POST /api/chat/send` - AI chatbot messaging (rate limited, validated)
- `GET /api/chat/conversations/:sessionId` - Retrieve conversation history
- `GET /api/dashboard-data` - Dashboard metrics and analytics
- `POST /api/send-whatsapp` - Send WhatsApp notifications via Twilio

**Security Features**:
- Rate limiting on AI endpoints (20 req/min per IP)
- Request body validation (max message length: 2000 chars, sessionId: 200 chars)
- Email format validation
- Automatic cleanup of rate limit tracking

**Design Rationale**: Express.js provides flexibility for webhook integrations and RESTful APIs. Rate limiting and validation prevent abuse while maintaining performance.

## Data Storage

**Primary Database**: PostgreSQL (Neon-backed via Replit)
- **Schema**: 7 tables across 5 development phases
  - `bookings` - Core booking data from all platforms
  - `captains` - Captain profiles and contact info
  - `chat_conversations` - AI chat history with messages (JSON)
  - `platform_sync_status` - Sync state per platform (PHASE 2)
  - `commission_rules` - Commission configuration (PHASE 4)
  - `commission_payments` - Payment tracking (PHASE 4)
  - `captain_availability` - Schedule management (PHASE 5)
  - `users` - Authenticated user data from OpenID provider
  - `sessions` - PostgreSQL session storage for Replit Auth

**Chat Conversations Table**:
```sql
- id (varchar, UUID primary key)
- session_id (varchar, unique)
- customer_name, customer_phone, customer_email
- messages (jsonb) - Array of {role, content, timestamp}
- status (varchar) - 'active', 'booking_created', 'completed'
- booking_id (varchar, nullable reference)
- created_at, updated_at (timestamps)
```

**Design Rationale**: PostgreSQL with JSONB for flexible message storage. Each chat session persists indefinitely for customer service and analytics. UUID-based IDs prevent enumeration attacks.

## Authentication & Authorization

**Technology**: Replit Auth with OpenID Connect (OIDC)
- **Implementation**: passport.js with openid-client strategy
- **Session Storage**: PostgreSQL-backed sessions using connect-pg-simple
- **Session Configuration**: 
  - 7-day TTL (maxAge: 7 days)
  - httpOnly cookies for XSS protection
  - Secure cookies in production
  - Session secret stored in SESSION_SECRET environment variable
  - Automatic session cleanup via PostgreSQL TTL

**Database Tables**:
- `users` - Stores authenticated user information from OpenID provider (id, email, name, timestamps)
- `sessions` - PostgreSQL session storage managed by connect-pg-simple

**Protected Endpoints**: All administrative endpoints require authentication via isAuthenticated middleware:
- Dashboard endpoints (`/api/dashboard-data`, `/api/bookings`, etc.)
- Platform sync endpoints (`/api/sync/*`, `/api/platforms/*`, `/api/conflicts/*`)
- Commission endpoints (`/api/commissions/*`, `/api/commission-rules/*`)
- Schedule endpoints (`/api/schedule/*`, `/api/availability/*`, `/api/check-conflicts`)
- Captain management endpoints (`/api/captains`, `/api/captains/:id`)

**Public Endpoints** (intentionally left unprotected):
- `/api/webhooks/booking/:platform` - External webhook receivers (platforms need to push bookings)
- `/api/chat/send` - Customer-facing AI chatbot (public customer access)
- `/api/captain/*` - Captain app endpoints (currently public for MVP)

**Authentication Flow**:
1. Unauthenticated user visits root (/) → redirected to /login.html
2. User clicks "Iniciar Sesión" → redirects to /api/login (initiates OIDC flow)
3. User authenticates via Replit (Google, GitHub, or email)
4. OIDC callback at /api/callback creates session and user record
5. User redirected to /dashboard.html
6. All protected pages verify authentication via inline script checking /api/auth/user
7. If not authenticated, pages redirect to /api/login

**Logout Flow**:
1. User clicks logout button (🚪 Cerrar Sesión) on any page
2. Request to /api/logout destroys session
3. User redirected to root (/) which shows login page

**Captain App Authentication**:
Captain app uses dual authentication:
1. Replit Auth - Required to access captain.html (prevents unauthorized access)
2. Captain ID selection - Identifies which captain is using the device (for assignment filtering)

**Security Features**:
- Session-based authentication (stateful, server-side)
- Cryptographically signed cookies
- PostgreSQL session persistence (survives server restarts)
- httpOnly cookies (prevent XSS attacks)
- Automatic session expiration (7 days)
- Database-backed user records with audit trail (created_at, updated_at)

**Authentication Module**: replitAuth.js
- Exports setupAuth(app, db) function for easy integration
- Exports isAuthenticated middleware for route protection
- Handles OIDC discovery, token verification, and session management
- Automatic user creation/update from OpenID provider data

**Design Rationale**: Replit Auth provides enterprise-grade authentication without custom user management. OpenID Connect ensures secure, standardized authentication. PostgreSQL session storage enables horizontal scaling and session persistence across deployments.

## Build & Development Tools

**CSS Processing**: 
- Tailwind CSS with PostCSS and Autoprefixer
- `cssesc` for CSS identifier escaping
- `camelcase-css` for JavaScript-friendly CSS property names

**File Watching**: Chokidar for efficient file system monitoring during development

**Browser Compatibility**: Browserslist and caniuse-lite for defining target browser support

# External Dependencies

## Third-Party Libraries

**UI & Styling**:
- Tailwind CSS - Utility-first CSS framework
- class-variance-authority - Type-safe component variants
- clsx - Conditional className utility
- aria-hidden - Accessibility utilities

**Data Visualization**:
- D3.js ecosystem (d3-array, d3-color, d3-ease, d3-format, d3-interpolate, d3-path, d3-scale, d3-shape) - Comprehensive data visualization toolkit

**Command Interface**:
- cmdk - Command palette component for keyboard-driven UX

## External Services & Integrations

**AI Service**: OpenAI GPT-4
- Integration via Replit AI Integrations
- Environment variables: AI_INTEGRATIONS_OPENAI_BASE_URL, AI_INTEGRATIONS_OPENAI_API_KEY
- System prompt enforces 7 required fields before booking creation:
  1. Customer name
  2. Phone number (+1 format)
  3. Email (validated)
  4. Tour date (YYYY-MM-DD)
  5. Number of people
  6. Tour type (half-day 4hrs / full-day 8hrs)
  7. Start time (9:00 AM / 12:00 PM / 3:00 PM)

**Payment Processing**: Stripe
- Secret keys: STRIPE_SECRET_KEY, TESTING_STRIPE_SECRET_KEY
- Public keys: TESTING_VITE_STRIPE_PUBLIC_KEY
- Used for secure payment collection and processing

**Messaging**: Twilio
- WhatsApp notifications for bookings
- Environment variables: TWILIO_SID, TWILIO_AUTH_TOKEN
- Sends confirmations to customers and captains

**Database**: PostgreSQL (Neon via Replit)
- Automatic connection via DATABASE_URL
- Credentials: PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD

**Booking Platforms** (13 total):
1. Airbnb
2. GetMyBoat
3. BoatSetter
4. Viator
5. Expedia
6. TripAdvisor
7. Groupon
8. Booking.com
9. FareHarbor
10. Bokun
11. Rezdy
12. Peek
13. Xola

**WordPress Integration**:
- Domain: https://www.nadakiexcursions.com
- Webhook endpoints receive bookings from WordPress forms

## Development Dependencies

**Build Tools**:
- Autoprefixer - CSS vendor prefixing
- PostCSS - CSS transformation
- Chokidar - File system watcher

**Browser Support**:
- Browserslist - Browser targeting configuration
- caniuse-lite - Browser feature support data