# 07 — One sign-in portal family

**What to build:** Admin, Player, and Visitor sign-in look like three doors into the same product. Switching portals changes only the copy and the fields, not the theme or layout. Today Admin and Visitor are a dark navy page with a compact card and centered heading, while Player is a light page with a much larger left-aligned heading (about 4.2rem against about 2.2rem).

Decision (user): all three portals use the dark navy shell that matches the logo.

Origin: UI polish audit finding M1, plus the sign-in copy and icon items from the low-priority list.

**Blocked by:** 03 — Load Inter as the application typeface; 04 — Reduce the type system to a small scale

**Status:** completed

- [x] All three portals render in the dark navy shell with the white logo, the same card size, padding, radius, heading size, and alignment
- [x] Portal identity comes from the heading and a restrained accent, not from a theme change
- [x] Each portal states who it is for once: the separate "access" eyebrow, the heading, and the "Active portal" line no longer repeat the same fact
- [x] Button and heading verbs are consistent: "Sign in" wording across all portals, replacing "Login as Admin", "Enter Player Page", and "Enter Visitor Page" (confirm final labels against the product vocabulary)
- [x] The optional Visitor name field is labeled "Full name (optional)"
- [x] The Player "Password not needed" helper stays but matches the dark-shell card styling
- [x] The lock glyph uses the app's consistent icon style and inherits the heading color instead of a hardcoded fill
- [x] Switching portals keeps focus on a sensible control and does not flash a different background
- [x] Validation errors, sign-in failure, pending state, and session restore still display correctly in the dark shell
- [x] Short-viewport and 375px mobile layouts keep the primary action visible without horizontal scroll
- [x] A focused visual check covers each portal at rest, with field errors, with a sign-in failure, and while pending, on desktop and mobile
