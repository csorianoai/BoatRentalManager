# Boat Rental Management System

## Overview

This is a full-stack boat rental management system built as a productivity-focused admin interface. The application allows administrators to manage boats, customers, and rental bookings through a modern SaaS-style dashboard. The system is designed for efficiency, with clean data presentation and streamlined workflows for common administrative tasks.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System:**
- React 18 with TypeScript for type-safe component development
- Vite as the build tool and development server for fast HMR and optimized production builds
- Wouter for lightweight client-side routing (alternative to React Router)

**UI Component Strategy:**
- Shadcn/ui component library (New York style variant) for consistent, accessible UI components
- Radix UI primitives as the foundation for interactive components (dialogs, dropdowns, menus, etc.)
- Tailwind CSS for utility-first styling with custom design tokens
- CVA (Class Variance Authority) for managing component variants

**Design System:**
- Custom color system using CSS variables (HSL-based) for theme flexibility
- Typography: Inter for UI elements, JetBrains Mono for technical data
- Spacing based on Tailwind's 4/8-point grid system
- Custom shadow and elevation utilities for depth perception

**State Management:**
- TanStack Query (React Query v5) for server state management, caching, and data synchronization
- React Hook Form with Zod resolvers for form state and validation
- Local component state with React hooks for UI-only state

**Form Handling Pattern:**
- Zod schemas define validation rules (shared between client and server)
- React Hook Form manages form state and submission
- Custom Form components from Shadcn provide consistent error display

### Backend Architecture

**Server Framework:**
- Express.js with TypeScript for RESTful API endpoints
- ES Modules throughout the codebase
- HTTP server created via Node's native `http` module

**API Design:**
- RESTful endpoints following resource-based URL patterns (`/api/boats`, `/api/customers`, `/api/rentals`)
- JSON request/response format
- Consistent error handling with appropriate HTTP status codes
- Input validation using Zod schemas before processing

**Development Experience:**
- Vite integration in development mode for HMR and fast client rebuilds
- Custom logging middleware for request/response tracking
- Runtime error overlay in development (Replit plugins)

### Data Storage Architecture

**Database Strategy:**
- PostgreSQL as the primary database (configured via Drizzle)
- Neon serverless PostgreSQL driver for connection pooling and serverless compatibility
- Current implementation uses in-memory storage (MemStorage class) as a development placeholder

**ORM & Schema:**
- Drizzle ORM for type-safe database queries and migrations
- Schema-first approach with TypeScript types inferred from Drizzle schemas
- Drizzle-Zod integration for automatic validation schema generation from database schemas

**Data Models:**
- Boats: Inventory management with name, type, capacity, pricing, status, and optional images
- Customers: Contact information storage (name, email, phone)
- Rentals: Booking records linking customers to boats with date ranges, pricing, and status tracking

**Storage Interface Pattern:**
- Abstract `IStorage` interface defines data operations (CRUD)
- `MemStorage` provides in-memory implementation for development/testing
- Design allows easy swapping to database-backed storage without changing API layer

### Authentication & Authorization

Currently not implemented. The application is designed as an internal admin tool without authentication requirements. Future implementations could add:
- Session-based authentication using express-session
- PostgreSQL session store (connect-pg-simple is already a dependency)
- Role-based access control for different admin levels

### External Dependencies

**UI Component Libraries:**
- @radix-ui/* family: Headless UI primitives for accessibility
- lucide-react: Icon system for consistent iconography
- cmdk: Command palette component
- embla-carousel-react: Carousel/slider functionality
- date-fns: Date manipulation and formatting

**Development Tools:**
- TypeScript for static type checking
- Drizzle Kit for database migrations
- ESBuild for server bundling in production
- Replit-specific plugins for development experience

**Build & Deployment:**
- Production build bundles client with Vite, server with ESBuild
- Client assets served from `dist/public`
- Server runs as ESM module in Node.js
- Environment variable: `DATABASE_URL` required for PostgreSQL connection

**Design Resources:**
- Google Fonts: Inter and JetBrains Mono fonts loaded from CDN
- Custom design guidelines documented in `design_guidelines.md`

**Key Architectural Decisions:**

1. **Monorepo Structure**: Client, server, and shared code in a single repository with TypeScript path aliases for clean imports
2. **Type Safety**: End-to-end TypeScript with shared types between client and server via the `/shared` directory
3. **Schema-Driven Development**: Zod schemas serve as single source of truth for data validation on both client and server
4. **Optimistic UI Updates**: TanStack Query enables optimistic updates for better perceived performance
5. **Component Composition**: Shadcn pattern allows copying components into codebase for full customization rather than npm package dependencies
6. **Serverless-Ready**: Neon driver and stateless design prepare for serverless deployment scenarios