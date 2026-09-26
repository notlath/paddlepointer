# 01 — Open a labeled mobile navigation drawer

**What to build:** On tablet and mobile, authenticated users open a full labeled navigation drawer rather than an icon-only rail. The menu button, scrim, active destination, and close behavior all communicate the drawer's real state.

Origin: UI/UX audit finding U-05.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] Opening the mobile menu displays the text label for every destination available to the signed-in role
- [x] The drawer is wide enough for labels without covering or truncating essential navigation text
- [x] The menu button's accessible name and expanded state match whether the mobile drawer is open
- [x] The active destination remains visually and programmatically identifiable
- [x] Selecting a destination or activating the scrim closes the drawer
- [x] Escape closes the drawer and returns focus to the menu button
- [x] The compact icon rail remains available only where the desktop layout intentionally uses it
