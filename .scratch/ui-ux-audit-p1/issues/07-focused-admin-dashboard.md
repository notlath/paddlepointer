# 07 — Separate People management from Match Operations

**What to build:** The Super Admin home view prioritizes current tournament and Match operations, while user creation and account management move to a dedicated People destination. Regular Admins see only the operational information and actions they can use.

Origin: UI/UX audit finding U-10, limited to the Admin Dashboard.

**Blocked by:** 04 — Preserve authenticated views in the browser URL

**Status:** completed

- [x] Super Admin navigation includes a dedicated People destination with a stable URL
- [x] User creation, account lists, role management, and account actions live in the People view
- [x] The Super Admin dashboard leads with active Match, next Match, Live, and Tournament status
- [x] The dashboard exposes one clear primary operational action based on the current state
- [x] Regular Admins do not see empty or disabled People-management controls
- [x] Moving account management does not change authorization, validation, or account data behavior
- [x] Dashboard and People empty, loading, success, and failure states remain clear
