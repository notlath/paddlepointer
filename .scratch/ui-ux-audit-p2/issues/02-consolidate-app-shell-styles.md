# 02 — Migrate the application shell to one responsive style path

**What to build:** The top bar, desktop sidebar, mobile drawer, scrim, user identity, logout action, and page offsets render through one responsive rule set. Later source order no longer changes whether labels, widths, or collapsed states appear.

Origin: UI/UX audit finding DS-03, limited to application chrome.

**Blocked by:** 01 — Expand the stylesheet with semantic UI tokens; P1-01 — Open a labeled mobile navigation drawer

**Status:** completed

- [x] Desktop expanded and collapsed sidebar layouts preserve their intended widths and page offsets
- [x] Tablet and mobile use the completed labeled-drawer behavior without a later icon-only override
- [x] Top-bar identity and logout controls retain readable, correctly sized states at every supported breakpoint
- [x] Scrim, drawer, and sidebar transitions consume the shared motion and layer tokens
- [x] Only one responsive rule path controls mobile drawer width, labels, logo treatment, and item alignment
- [x] Resizing across mobile, tablet, laptop, and wide desktop does not leave stale shell state or horizontal overflow
- [x] Shell keyboard behavior and role-specific navigation remain unchanged
