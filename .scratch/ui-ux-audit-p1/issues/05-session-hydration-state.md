# 05 — Show a stable state while the session is restored

**What to build:** Returning users see a brief branded loading state while their saved session is checked instead of seeing the sign-in page flash before the authenticated application appears.

Origin: UI/UX audit finding U-09, limited to application startup.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] The application does not render a sign-in portal until session restoration has completed or failed
- [x] Session restoration exposes a lightweight branded loading state with an accessible status message
- [x] A valid session proceeds directly to the correct role home view
- [x] An expired or invalid session proceeds to the correct sign-in portal with a clear message
- [x] The loading state does not trap focus or announce repeatedly
- [x] Startup remains usable when shared History or Tournament data loads more slowly than authentication
