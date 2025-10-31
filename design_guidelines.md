# Design Guidelines: Boat Rental Management System

## Design Approach

**Selected Approach:** Design System (Utility-Focused)

This is a productivity-focused admin interface prioritizing efficiency, data clarity, and task completion. Drawing inspiration from modern SaaS dashboards like Linear, Stripe Dashboard, and Notion with clean data presentation and intuitive workflows.

**Key Design Principles:**
- Information hierarchy: Critical data immediately visible
- Task efficiency: Minimize clicks to complete common actions
- Data clarity: Clean tables, cards, and forms for managing inventory
- Responsive admin experience: Works seamlessly on desktop and tablet

## Typography

**Font Families:**
- Primary: 'Inter' (Google Fonts) - UI elements, headings, body text
- Monospace: 'JetBrains Mono' - IDs, reference numbers, technical data

**Type Scale:**
- Page Headers: text-3xl font-bold (36px)
- Section Headers: text-xl font-semibold (20px)
- Card Titles: text-lg font-medium (18px)
- Body Text: text-base (16px)
- Helper Text: text-sm text-gray-600 (14px)
- Labels: text-sm font-medium uppercase tracking-wide (14px)

## Layout System

**Spacing Primitives:** Tailwind units of 2, 4, 6, and 8
- Component padding: p-4, p-6
- Section spacing: space-y-6, space-y-8
- Card gaps: gap-4, gap-6
- Form field spacing: space-y-4

**Grid Structure:**
- Main container: max-w-7xl mx-auto px-6
- Dashboard cards: grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6
- Data tables: Full-width with horizontal scroll on mobile
- Forms: max-w-2xl for optimal readability

## Component Library

### Navigation
**Top Navigation Bar:**
- Fixed header with site branding on left
- Main navigation links (Dashboard, Boats, Rentals, Customers)
- User profile dropdown on right
- Height: h-16 with border-b

**Sidebar (Desktop):**
- Fixed left sidebar: w-64
- Grouped navigation items with icons from Heroicons
- Active state indicator with subtle accent
- Collapsible on tablet: transforms to mobile menu

### Dashboard Cards
**Stats Overview Cards:**
- Grid layout showing key metrics (Total Boats, Active Rentals, Revenue, Availability)
- Large number display with label and trend indicator
- Icon accent in top-right corner
- Card style: rounded-lg border bg-white p-6

**Quick Action Cards:**
- Prominent CTA buttons for common tasks
- "New Booking", "Add Boat", "View Calendar"
- Card with icon, title, description, and action button

### Data Tables
**Boat Inventory Table:**
- Columns: Thumbnail, Name, Type, Capacity, Price/Day, Status, Actions
- Row hover state for better scanning
- Sortable column headers
- Status badges: rounded-full px-3 py-1 text-xs font-medium
- Action buttons: Icon-only for Edit/Delete in last column
- Pagination controls at bottom

**Rental Bookings Table:**
- Columns: Booking ID, Customer, Boat, Dates, Duration, Total, Status, Actions
- Date range display with visual calendar icon
- Color-coded status (Pending, Confirmed, Active, Completed, Cancelled)
- Quick actions dropdown menu

### Forms
**Boat Management Form:**
- Two-column layout on desktop: grid grid-cols-1 md:grid-cols-2 gap-6
- Field groups: Basic Info, Specifications, Pricing, Availability
- Input fields: rounded-md border px-4 py-2.5
- Labels: Above inputs with required asterisk
- Helper text below fields
- Image upload with preview thumbnail
- Action buttons: Primary (Save) + Secondary (Cancel) aligned right

**Booking Form:**
- Step indicator for multi-step flow (Customer → Boat → Dates → Confirm)
- Date picker with calendar view showing availability
- Boat selection with visual cards showing thumbnails
- Price calculation summary card (sticky on scroll)
- Form validation with inline error messages

### Modals & Overlays
**Confirmation Dialogs:**
- Centered overlay: max-w-md
- Clear heading, description, and action buttons
- Destructive actions (delete) highlighted in red
- Cancel always available

**Detail Panels:**
- Slide-in from right for boat/booking details
- Full-height with close button
- Tabbed sections for organized information
- Quick edit mode toggle

### Buttons & Actions
**Primary Actions:** Solid background, rounded-md px-4 py-2 font-medium
**Secondary Actions:** Border style with transparent background
**Danger Actions:** Red accent for destructive operations
**Icon Buttons:** Circular or square, p-2, for compact actions

### Status Indicators
**Availability Badges:**
- Available: Green accent
- Rented: Blue accent
- Maintenance: Yellow accent
- Unavailable: Gray accent

**Booking Status:**
- Pending: Orange with clock icon
- Confirmed: Green with checkmark
- Completed: Gray with archive icon
- Cancelled: Red with X icon

### Calendar & Date Selection
**Availability Calendar:**
- Month view with date cells
- Color-coded availability states
- Hover tooltips showing booking details
- Range selection for booking dates

## Animations

**Minimal Approach - Use Sparingly:**
- Table row hover: Subtle background transition
- Button hover: Scale transform (scale-105)
- Modal entrance: Fade-in with slight scale
- Loading states: Spinner for data fetching
- Page transitions: None (instant navigation preferred)

## Images

**Where to Use:**
- Boat thumbnails in tables and cards (aspect-ratio-square, rounded-lg)
- Boat detail view gallery (3-5 images, carousel/grid)
- Empty states with illustration (e.g., "No boats added yet")

**Image Specifications:**
- Thumbnails: 80x80px in tables, 200x200px in cards
- Detail gallery: 800x600px optimal
- Use placeholder service during development
- Lazy loading for table images

---

**Critical Success Factors:**
- Fast data scanning with clean tables
- One-click access to common tasks
- Clear visual hierarchy for information density
- Responsive design that maintains functionality on tablet
- Consistent status indicators throughout the system