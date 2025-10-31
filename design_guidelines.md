# Nadaki Excursions AI Chat Widget Design Guidelines

## Design Approach

**Hybrid Reference System**: Combining WhatsApp's conversational interface patterns with Intercom's professional widget structure, adapted for a nautical brand identity. The design balances friendly approachability with maritime professionalism.

## Core Design Principles

1. **Conversational Immediacy**: Interface responds instantly to user interaction with clear visual feedback
2. **Maritime Elegance**: Clean, flowing layouts that echo ocean waves and smooth sailing
3. **Spatial Clarity**: Generous breathing room prevents overwhelming users in the compact widget format

---

## Typography System

**Primary Font**: Inter or DM Sans (modern, readable)
**Secondary Font**: Outfit or Poppins (friendly headers)

### Hierarchy:
- **Widget Header**: 16px, semi-bold (600)
- **Message Text**: 14px, regular (400)
- **Timestamps**: 11px, medium (500)
- **Input Field**: 14px, regular (400)
- **Action Buttons**: 14px, medium (500)

---

## Layout System & Spacing

**Tailwind Units**: Consistently use 2, 3, 4, 6, 8, 12 for spacing primitives (p-4, m-6, gap-3, etc.)

### Widget Dimensions:
- **Collapsed State**: 60px × 60px circular trigger button
- **Expanded State**: 380px width × 600px height (desktop)
- **Mobile Responsive**: Full screen overlay (w-full h-full)
- **Positioning**: Fixed bottom-right, 24px from edges (bottom-6 right-6)

### Internal Spacing:
- Header padding: p-4
- Message bubbles padding: px-4 py-3
- Messages container padding: p-4
- Input area padding: p-4
- Gap between messages: gap-3
- Gap between message groups: gap-6

---

## Component Library

### 1. Floating Trigger Button
- **Shape**: Circular with shadow-xl
- **Size**: w-16 h-16
- **Icon**: Chat bubble or anchor symbol, 24px
- **Badge**: Unread count indicator (absolute top-0 right-0, w-6 h-6, text-xs)
- **Shadow**: Prominent drop shadow for depth
- **Interaction**: Pulse animation on new messages (subtle, 2s interval)

### 2. Widget Container
- **Structure**: Rounded corners (rounded-2xl)
- **Shadow**: shadow-2xl for elevation
- **Backdrop**: Semi-transparent backdrop blur for overlay states

### 3. Header Component
- **Layout**: Flex row with space-between
- **Left Side**: Assistant avatar (w-10 h-10, rounded-full) + Name/Status stack
- **Right Side**: Minimize and close buttons (w-8 h-8 each)
- **Assistant Name**: Semi-bold, 15px
- **Status Indicator**: "Online" text with dot indicator (w-2 h-2 rounded-full)
- **Border**: Bottom border separator (border-b)

### 4. Messages Container
- **Layout**: Flex column with flex-1 for height
- **Overflow**: overflow-y-auto with custom scrollbar styling
- **Scroll Behavior**: Auto-scroll to bottom on new messages
- **Loading State**: Centered spinner with "Thinking..." text

### 5. Message Bubbles (WhatsApp Style)

**User Messages (Right-aligned)**:
- Max width: max-w-[280px]
- Alignment: ml-auto (floats right)
- Padding: px-4 py-3
- Rounded: rounded-2xl with rounded-br-md (sharp bottom-right corner)
- Shadow: shadow-sm

**AI Messages (Left-aligned)**:
- Max width: max-w-[280px]
- Alignment: mr-auto (floats left)
- Padding: px-4 py-3
- Rounded: rounded-2xl with rounded-bl-md (sharp bottom-left corner)
- Avatar: Include small avatar (w-6 h-6, absolute, -left-8)
- Shadow: shadow-sm

**Message Metadata**:
- Timestamp: text-xs, mt-1, right-aligned for user, left-aligned for AI
- Read receipts: Two checkmarks for user messages (10px icons)

### 6. Quick Action Buttons
- **Display**: Horizontally scrollable container (overflow-x-auto)
- **Layout**: Flex row with gap-2, appears above input
- **Button Style**: Pill-shaped (rounded-full), px-4 py-2
- **Icon + Text**: 14px icon + 13px text
- **Suggestions**: "Book a tour", "Check availability", "Pricing info", "Contact captain"

### 7. Input Area
- **Container**: Border-t separator
- **Layout**: Flex row with gap-3
- **Text Area**: Flex-1, rounded-xl, px-4 py-3, min-height: 44px, max-height: 120px
- **Placeholder**: "Message Nadaki assistant..."
- **Send Button**: w-10 h-10, rounded-full, flex-center with send icon (20px)
- **Attachment Button**: w-9 h-9 (paperclip icon, positioned left of textarea)

### 8. Typing Indicator
- **Container**: Same styling as AI message bubble
- **Animation**: Three dots bouncing (w-2 h-2 each, gap-1)
- **Layout**: Inline-flex with items-center

### 9. Welcome Message (First Interaction)
- **Avatar**: Larger captain/boat icon (w-16 h-16)
- **Greeting**: "¡Bienvenido a Nadaki Excursions! 🌊"
- **Description**: "I'm here to help you plan the perfect ocean adventure."
- **Quick Actions**: Display 4 primary suggestion buttons (2×2 grid, gap-3)

---

## Interaction States

**Input Field**:
- Default: Border with subtle transparency
- Focused: Enhanced border, slight elevation (shadow-md)
- Disabled: Reduced opacity (opacity-60)

**Buttons**:
- Default: Solid with shadow-sm
- Hover: Slight elevation increase (shadow-md, -translate-y-0.5)
- Active: Scale down (scale-95)
- Disabled: Opacity-50, cursor-not-allowed

**Message Bubbles**:
- Entrance: Fade-in + slide-up animation (200ms, subtle)
- No hover state needed

---

## Responsive Behavior

**Desktop (lg and up)**:
- Fixed widget: 380px × 600px
- Bottom-right positioning: bottom-6 right-6

**Tablet (md)**:
- Slightly smaller: 360px × 550px
- Same positioning

**Mobile (base to sm)**:
- Full screen overlay: w-full h-full
- Header becomes sticky with back button instead of minimize
- Input area becomes sticky bottom
- Rounded corners removed for full-screen feel

---

## Accessibility Implementation

- All interactive elements: min-height 44px (touch-friendly)
- Focus indicators: 2px offset ring
- Skip navigation: Header close button tabbable first
- Screen reader labels: "Open chat", "Send message", "Close chat"
- Keyboard shortcuts: Escape to close, Enter to send (Shift+Enter for new line)
- ARIA live regions: Announce new messages

---

## Images

**Avatar Images**:
- **AI Assistant Avatar**: Friendly nautical mascot or captain illustration (circular, 40px header / 24px in messages)
- **User Avatar**: Generic placeholder or user profile image (circular, 32px)
- **Welcome Icon**: Boat or wave illustration for initial greeting (64px)

No large hero images needed - this is a compact widget interface focused on functional clarity.

---

## Special Features

**Message Enrichments**:
- **Links**: Underlined, inline with message text
- **Tour Cards**: Compact preview cards within AI messages (image thumbnail 80×80, title, price, "View Details" link)
- **Image Sharing**: User-uploaded images display at 200px width with rounded corners
- **Availability Calendar**: Inline mini-calendar widget in AI responses

**Notification Badge**: Unread message count on collapsed trigger (absolute positioning, -top-1 -right-1)

**Smooth Transitions**: All state changes use 200-300ms ease-in-out transitions for professional feel