---
status: accepted; supersedes the "no embed" point of ADR 0001 for staff
---

# Staff see Qlik charts and sheets embedded in PaddlePoint

PaddlePoint embeds Qlik Cloud visual analytics directly inside the application for authenticated staff members (Admins and Super Admins). This supersedes the "no embed" position from ADR 0001, which pertained to public/anonymous access. Public visitors and players continue to see only native views (Live Board, Leaderboard, History) without any Qlik login or embed.

## Context and Decision

1. **OAuth M2M User Impersonation**: PaddlePoint's server (`api/qlik/embed_token.php`) exchanges server-held OAuth credentials for a short-lived access token on behalf of a dedicated headless user (`lathrell.pagsuguiron+eventviewer@mtc.com.ph`). The browser receives only this short-lived token via `api/qlik/get-embed-token.php`; client secrets never leave the server.
2. **Access Control**: Embed token issuance is strictly staff-only (`admin` and `super_admin`). Unauthenticated requests receive HTTP 401, while player and visitor requests receive HTTP 403.
3. **Licensing Confirmation**: The Qlik Cloud tenant (`mtcmarketing.sg.qlikcloud.com`) has 100,000 Full User licenses purchased with only 60 assigned, with JWT authentication and M2M impersonation enabled. There is no licensing capacity bottleneck or multiplexing non-compliance risk.
4. **Embedding Surfaces**:
   - **Admin Dashboard (`home`)**: A summary section containing an operational User Accounts breakdown (Super Admins, Admins, Players, Visitors) and an embedded Qlik trend chart (*Matches Over Time*).
   - **Dedicated Staff Analytics View (`analytics`)**: A dedicated tab in the navigation displaying all 6 Qlik sheets with a tab switcher:
     - Overview (`a74a9d96-0a3f-4f7d-b9f1-f91c7153dd46`)
     - Match Analysis (`SAhNFmP`)
     - Leaderboard (`fYjcmpj`)
     - Player Performance (`e1aac6a4-1c2f-49f9-a8c8-7ae4be857b3c`)
     - Partnership Analysis (`eb45cb51-48e5-47c6-9226-90690f626f9b`)
     - Event / Court Analytics (`7cc85fc7-1896-4127-be10-b1731f626c6c`)
   - The full sheets also remain directly accessible in Qlik Cloud for deep exploratory analysis.

## Consequences

- Staff members experience embedded Qlik sheets without seeing any Qlik login prompt.
- The web app dynamically loads `@qlik/embed-web-components` only when a staff member visits an embedded view, preserving light payload sizes for visitors and players.
- Data freshness in embedded charts reflects the Qlik Cloud reload cadence, displayed clearly to staff in Asia/Manila time.

## Amendment (2026-09-20): this reversed ticket 11's own recommendation

Recorded because the original text above reads as though whole-Sheet embedding was always
the plan. It was not. Ticket 11 concluded the opposite — "embed single charts inside native
PaddlePoint cards, not whole sheets (Q66 reversed Q49)" — and the shipped Analytics view
embeds whole Sheets anyway.

Whole Sheets are kept. Six Sheets rebuilt as native PaddlePoint cards is weeks of work, and
the brand gap that motivated Q66 closes with a theme swap instead. The single-chart pattern
Q66 recommended survives where it fits: the trend chart on the Admin dashboard.

Consequence: Sheet composition is now Qlik's responsibility, not PaddlePoint's CSS. See
`docs/qlik-sheet-design.md` for the standard that follows from that.
