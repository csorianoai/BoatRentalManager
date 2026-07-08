---
name: Platform access gate
description: How the Nadaki Excursions management portal enforces single-code access, and which endpoints must remain public.
---

The entire management/dashboard portal (all HTML pages, /app SPA, and internal APIs) is gated behind a single shared secret stored in the `PLATFORM_ACCESS_CODE` env var. There is no per-user login — anyone with the code gets full access. This was a deliberate choice per the owner's request ("only I can access via a code"), not a partial/role-based auth system.

**Why:** Replit Auth (`replitAuth.js`) was already fully disabled project-wide (dummy `isAuthenticated` middleware), and the owner wanted the simplest possible lockdown without reintroducing a session/user system.

**How it works:** Stateless signed cookie (`nadaki_access`), no cookie-parser/session-store dependency. Token = `expiryTimestamp.HMAC` where the HMAC key is derived from `sha256(PLATFORM_ACCESS_CODE + ':nadaki-gate-v1')`. This means cookies stay valid across server restarts (since the key only depends on the code), but ALL cookies are invalidated the moment `PLATFORM_ACCESS_CODE` is rotated — by design.

**How to apply:** A gate middleware runs early in `server.js` (right after `express.json()`, before the HTML-serving middleware). Any new endpoint meant for external systems that can't supply the code (booking-platform webhooks, WhatsApp/email webhooks, public AI chat) must be added to the `ACCESS_GATE_WHITELIST` prefix array, or it will start returning 401/redirecting. Known consequence: the captain-facing app (`captain.html`) is also gated — captains need the same shared code to log in; there is no separate captain credential.
