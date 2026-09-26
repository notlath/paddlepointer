# 03 — Make every sign-in portal discoverable

**What to build:** A user who lands on the Admin, Player, or Visitor sign-in page can switch directly to either of the other access modes without editing the URL or finding a separate QR code.

Origin: UI/UX audit finding U-07.

**Blocked by:** P0-02 — Keep every sign-in portal usable on short viewports; P0-03 — Make sign-in validation contextual and keyboard friendly

**Status:** completed

- [x] Admin, Player, and Visitor sign-in pages each expose links or controls for the other two portals
- [x] The active portal is identified without presenting a redundant link to itself
- [x] Portal controls use consistent placement, labels, focus treatment, and keyboard behavior
- [x] Switching portals updates the browser URL and preserves only values that are valid for the destination portal
- [x] Direct Player and Visitor links used by QR access still open the intended portal
- [x] Adding the portal controls does not reintroduce short-viewport clipping
