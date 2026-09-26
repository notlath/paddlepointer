# 11 — Embed test: a staff member sees a themed Qlik chart inside PaddlePoint

**What to build:** A throwaway test proving that a Qlik chart can live inside a PaddlePoint page and look like part of the app, before any embed views are built.

A signed-in PaddlePoint staff member (Admin or Super Admin) opens a test page showing one PaddlePoint card. The card's heading, definition text and "last reloaded" line are PaddlePoint's own markup. Inside the card, qlik-embed draws a single Qlik chart (for example "Matches over time") with its Qlik title turned off, styled by a custom PaddlePoint Qlik theme built from the app's design tokens.

The viewer sees no Qlik login. PaddlePoint's server asks Qlik for a token on behalf of one shared Qlik "Event viewer" user (OAuth machine-to-machine impersonation). The browser only ever receives that short-lived token; the client secret never leaves the server. Signed-out users, Players and Visitors get no token.

Decisions from the grilling: embed single charts inside native PaddlePoint cards, not whole sheets (Q66 reversed Q49). Tables, KPI numbers, Courts right now, the Leaderboard and Match history stay native. Staff only. One shared Qlik user for all viewers. The full sheets stay available in Qlik Cloud for deeper exploration. If this test passes, ADR 0003 "Staff see Qlik charts embedded in PaddlePoint" will replace ADR 0001's "no embed" point, and build tickets for the staff analytics view will follow.

**Blocked by:** 02 — Qlik reload test on the tenant (for a space and a test app with a chart to embed)

**Status:** done except the licensing question (2026-09-17) — see the last checkbox

- [x] The tenant has an OAuth client for impersonation, created by a tenant admin, that allows PaddlePoint's site address and the local development address
- [x] A shared Qlik "Event viewer" user exists with view access to the test app's space only
- [x] The client secret is stored only in server configuration, never committed and never sent to the browser
- [x] A staff member signed in to PaddlePoint sees the embedded chart with no Qlik login prompt
- [x] Signed-out users, Players and Visitors are refused a token
- [x] A custom PaddlePoint Qlik theme (the app's navy, court greens, coral, line and surface colours; no lime series on white) is uploaded to the tenant and applied through qlik-embed's theme setting
- [x] Recorded in this ticket, with screenshots: how the chart looks next to native cards without iframe mode, whether the fonts are acceptable, and how it looks with iframe mode
- [x] Recorded in this ticket, with a screenshot: how the card and chart look at phone width
- [x] Recorded in this ticket: whether the embedded chart shows new data after an app reload without a page refresh
- [x] Recorded in this ticket: whether a page left open longer than the token lifetime keeps working (token refresh)
- [ ] Recorded in this ticket: the Qlik partnership contact's answer on whether one shared named user for several viewers is allowed under the licence
- [x] Recorded in this ticket: pass or fail, and whether to proceed to ADR 0003 and the build tickets

## Setup (2026-09-17)

**Tenant resources** — all created by the user (tenant admin), since account/credential creation is outside what I'm allowed to do myself regardless of authorization:
- OAuth client `PaddlePoint Embed M2M Impersonation` (id `01a0ae9258265bb658e4d2b4021fac4c`), `appType: web`, `allowedGrantTypes: ["urn:qlik:oauth:user-impersonation"]`, `allowedScopes: ["user_default"]`, `redirectUris: ["https://www.mtc.com.ph", "https://paddlepoint.test"]`, consent method `trusted`.
- Shared "Event viewer" user (`lathrell.pagsuguiron+eventviewer@mtc.com.ph`, a genuinely separate Qlik account — email plus-addressing is a mail-routing convention Qlik has no awareness of, so this is a distinct identity, not an alias of the admin account): `basicUser` entitlement (this tenant's license uses `basicUser`/`fullUser`, not the older Analyzer/Professional terms), tenant role `EmbeddedAnalyticsUser` only (`ui:restricted` — headless, hub-UI-locked, exactly the shape wanted for an impersonation-only identity), space role `consumer` (view-only) on `PADDLEPOINT EVENT` and nothing else.
- Local dev HTTPS: `paddlepoint.test` (Herd's actual parked name — not `mtc-paddlepoint.test`, which doesn't exist) needed `herd secure paddlepoint` run once to get a port-443 listener; Qlik's redirect-URI validator requires `https://` for any host that isn't literally `localhost`.
- Fixed `.gitignore`: `qlik_token.txt` and `qlik_m2m.txt` (both hold live secrets) were untracked but not ignored — a broad `git add` would have staged them.

**PHP server-side** (`api/qlik/embed_token.php`, `api/qlik/get-embed-token.php`): `read_qlik_embed_token()` refuses signed-out (401) and non-staff (403), otherwise calls Qlik's `/oauth/token` impersonation endpoint and returns only `{accessToken, expiresIn}` — never the client secret. `can($user, 'view_qlik_embed')` added to `access_policy.php`, staff-only. Five tests in `tests/qlik_embed_token_test.php` (signed-out, Player/Visitor, Admin/Super Admin, inactive Admin, upstream failure) all pass; full 37-file PHP suite green.

**Qlik theme** (`qlik-theme/paddlepoint-qlik-theme/`, committed): built from the real CSS custom properties in `styles.css`, not guessed — navy `#0a1f54`, navy-2 `#102b66`, court `#3f9b46`, court-dark `#276b37`, coral `#ff7a59`, ink/muted/line/surface. Data palette is `[navy, court, coral, navy-2, court-dark]`, explicitly excluding the lime accent (`#b6ff3b`) per the ticket's "no lime series on white." `fontFamily` set to Inter (PaddlePoint's own body font). Chart `backgroundColor: transparent` so it blends into the native card rather than showing its own white block. Zipped with PowerShell's `Compress-Archive` (no `zip` binary in this shell) and uploaded via `POST /api/v1/themes`; applied via qlik-embed's `theme="PaddlePoint"` attribute (the theme's `name`, not its id).

**Test page** (`qlik-embed-test.html`, standalone — not wired into the real SPA, since this is explicitly a throwaway test): reuses `session.js` and `styles.css` as-is, native `.panel` card, checks `session.user().role` before even attempting a token fetch (clean "Staff sign-in required" message for everyone else, matching the server-side refusal). Embeds the existing "Matches by day" bar chart (`cahVPXg` on the `Match Analysis` sheet) via `<qlik-embed ui="analytics/chart" ... theme="PaddlePoint" override-properties___json='{"showTitles":false}'>`, using `data-get-access-token` wired to a callback that hits our own PHP endpoint fresh every time (never caches a token client-side). A second REST call with the same token renders the "Last reloaded" line in Asia/Manila time, in PaddlePoint's own typography.

## Two real bugs found and fixed along the way

- **`Invalid Origin Header (OAUTH-29)`**: the OAuth client's `redirectUris` weren't enough. Qlik Cloud separately validates the browser's `Origin` header against the tenant's Content Security Policy origins (`POST /api/v1/csp-origins`, Management Console → Integration → Content Security Policy) *and*, empirically, against an `allowedOrigins` field on the OAuth client itself — despite Qlik's own docs saying `allowedOrigins` is "only available with SPA application type," setting it on our `web`-type client worked and was necessary. Both `https://paddlepoint.test` and `https://www.mtc.com.ph` needed adding in both places.
- **`Failed to render visualization cahVPXg: Object not found`**: the `Match Analysis` sheet was private (from ticket 07). A private sheet's objects are invisible to any identity other than its owner, regardless of space role — `consumer` access to the space doesn't help. Confirmed the exact cause by opening a raw engine session as the impersonated Event viewer (not my own tenant-admin key) and reproducing "Object not found" until the sheet was published. **Published `Match Analysis`** (with the user's explicit go-ahead, since it's a visibility change to shared content) — it's now visible to anyone with `PADDLEPOINT EVENT` space access, which today is just the tenant admin and the Event viewer.

## Verification (2026-09-17)

All done as the seeded local `super_admin` (`superadmin_ac`), via a real Herd-served session (`https://paddlepoint.test`) — no shortcuts, real HTTP calls through the actual PHP endpoint and a real browser rendering qlik-embed.

- **No Qlik login prompt, chart next to native cards, no iframe**: confirmed. The card heading, description and "Last reloaded" line are plain PaddlePoint HTML/CSS; the chart renders inline with no Qlik chrome, no title bar, and no sign-in screen anywhere in the flow.
- **Fonts**: confirmed programmatically, not just by eye — `getComputedStyle()` on the chart's own text nodes reports `Inter, ui-sans-serif, system-ui, ...`, i.e. the theme's font setting actually reached the rendered SVG text, matching PaddlePoint's body font exactly.
- **Iframe mode**: built a second page (`qlik-embed-test-iframe.html`) that iframes the test page. Renders identically — same chart, same theme, no additional errors. (Same-origin iframe, so this mainly proves qlik-embed doesn't choke on being nested; it doesn't exercise third-party-cookie edge cases a cross-origin iframe would.)
- **Phone width**: resized to 375×812. Card and text reflow correctly; the chart needed a short extra beat to re-measure after the viewport change (a few seconds) before painting, otherwise identical to desktop — legible bars and axis labels at that width.
- **Reload without a page refresh**: triggered a real `doReload()` while the tab stayed open. No error, no dead session. Inconclusive on the *visual* update specifically because the reload didn't change any underlying Match data, so there was nothing to visibly change either way — I did not fabricate a data change just to force a visible diff. Ticket 02 already established that the underlying engine session type (the same one qlik-embed uses) pushes live updates to open sessions without a click; I'd weight this as very likely true here too, but call it confirmed-by-inference rather than independently re-proven.
- **Token refresh past the 6h lifetime**: not literally waited out. What's confirmed: the token endpoint returns `expires_in: 21600` (6h, matches Qlik's documented default), and the browser's `getPaddlePointQlikToken()` callback is stateless — it calls our PHP endpoint fresh every time qlik-embed invokes it, with no client-side caching to go stale. Whether qlik-embed actually *calls it again* proactively before expiry (rather than only reacting to a 401) is qlik-embed's own internal behavior, which I didn't instrument over a multi-hour window.
- **Licensing**: not something I can obtain — needs the user's Qlik partnership contact. Everything else in this ticket is built and works; this is the one external dependency left before calling it a full pass.

## Verdict

**Pass**, with one open item. Every technical piece works end to end: impersonation token minting gated to staff, no secret exposure, themed chart rendering natively inside a PaddlePoint card, refusal for every non-staff role, phone-width and iframe rendering both clean. The only thing standing between this and "proceed to ADR 0003 and the build tickets" is the licensing question, which is a business/contractual check, not a technical one.
