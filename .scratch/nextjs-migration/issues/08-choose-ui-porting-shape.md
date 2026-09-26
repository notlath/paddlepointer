Type: grilling
Status: resolved
Blocked by: 02

Decision: Build route-level Next.js App Router pages with server-loaded data and small client interaction islands. Port domain behavior and useful interaction rules from the existing modules, but rebuild the monolithic `app.js` view renderer and browser-owned data store as role-specific components. Keep public views and protected role surfaces addressable by URL, preserve active Match recovery, and prototype the Scoreboard before applying the visual direction to the rest of the UI.

## Question

How should the existing browser application be divided into Next.js routes and components, and which existing JavaScript modules should remain client-side? Decide the porting approach for the scorer, Live Board, tournament setup, player/admin tools, history/leaderboard, and staff analytics shell, including how to preserve URL-backed views, browser-held active-match state, and current interaction behavior without turning the migration into an unrelated UI redesign.

## Route and component boundary

| Surface | Route shape | Initial read and client behavior |
| --- | --- | --- |
| Entry and account | `/`, `/sign-in`, `/visitor/sign-in`, `/account` | The server resolves current session and role for the landing page. Client forms handle input and feedback; Better Auth owns session state. Player sign-in stays disabled until its separate account transition is approved. |
| Staff home and administration | `/staff`, `/staff/people`, `/staff/players`, `/staff/profile` | Server pages load current Event and permitted records. Small client forms, tables, confirmation dialogs, and filters submit authorized Server Actions. People management is Super Admin only. |
| Tournament and scorer | `/staff/tournament`, `/matches/new`, `/matches/[matchId]/score`, `/matches/[matchId]/summary` | The server loads the relevant Event, Schedule, Tournament Match, and Match and checks role and ownership. A client Scoreboard owns in-progress interaction state and save feedback; server operations own durable Match and Rally state. Visitor Match creation and scoring use the same scorer component under `/visitor/matches/...` with Visitor ownership checks. |
| Shared views | `/live`, `/history`, `/leaderboard`, `/rules` | Server pages load the first public or authorized view. Live Board client code handles Broadcast invalidation, refetch, poll fallback, tabs, and expanded cards. History and Leaderboard client controls handle filters and paging; server queries enforce Event and Visitor scope. |
| Visitor and Player | `/visitor`, `/visitor/history`, `/visitor/leaderboard`, `/player`, `/player/matches` | Distinct role shells and server-scoped reads keep Visitor history private and Player summaries tied to the approved account-to-Player link. Existing username-only Player access is not ported. |
| Analytics | `/staff/analytics` | Server gate and shell load for staff only; a client island owns the Qlik session, selections, filters, charts, retry, and cleanup. Qlik token exchange stays server-side. |

Use nested layouts for shared role navigation and visual shells, with authorization in each protected read and mutation. The route names above are the proposed public URL contract for delivery; detail routes may be added when a view needs a stable record URL. Use links for ordinary navigation and client routing for imperative transitions. Preserve Back/Forward, focus restoration, and useful deep links. Redirect old `?view=` URLs and portal query links to their equivalent routes when replacing the PHP app; do not keep query parameters as the new navigation model. Unknown or forbidden destinations return a safe role landing page or access response without loading protected data.

## Client state and module port

- Keep Rally scoring, serve position, undo, and Scoreboard interaction in a client component for immediate feedback. Reuse or translate the pure `rally-engine.js` behavior and its public tests without changing scoring rules. Keep the current active Match draft in browser storage keyed by authenticated account and Match ID, with a schema version and a clear/replace path. On refresh or navigation, load the server's latest saved Match, compare the draft's Match ID and revision, and offer explicit recovery or conflict handling before sending another write. A draft is a recovery aid, never the authoritative Match; server-side ownership and concurrency checks still govern save and resume. Clear the draft only after confirmed persistence or explicit discard, including sign-out/account change.
- Port the pure Schedule and Tournament Match rules from `open-play-scheduler.js` and `tournament-match.js` into shared domain modules used by server operations where appropriate. Do not carry `shared-store.js`, `session.js`, or `app.js` as a second application runtime: their browser copies of Tournament, History, and session state conflict with the new server-owned model. Translate the relevant form validation, focus, dialog, and status feedback behavior into the new components.
- Keep Live Board polling and presentation behavior in a client island, using only authorized Next.js refetch routes after Broadcast notices. The server owns the public payload. Keep Qlik's native rendering and interactions in a staff-only client island; port `qlik-mashup.js` behavior while retaining its server-held token flow. No account, Visitor-private, or database credentials enter those client modules.

## Delivery order and checks

1. Build the shared role shells, route authorization, and landing/deep-link behavior. Carry current permissions into server checks rather than copying `view-access.js` as the security boundary.
2. Prototype the desktop and phone Scoreboard, review it with scorer workflows, then deliver Match lifecycle, Rally/undo, refresh recovery, and save status. Use the feedback to set the visual and interaction pattern for staff, Live Board, Visitor/Player, History, and analytics surfaces.
3. Port Tournament setup, Player and account tools, public and role-scoped views, and analytics in vertical journeys. Keep the established operational hierarchy, PaddlePointer brand, accessible feedback/focus behavior, and scoring/scheduling semantics while redesigning layout and components.

Browser journeys must cover direct URLs and Back/Forward, role denial, responsive Scoreboard scoring and recovery, Tournament setup and correction, Live Board refresh/fallback, Player and Visitor isolation, and staff analytics. The new routes replace old DOM-shape assertions; the old browser tests remain behavioral reference cases. Final route details and prototype visuals are delivery work, not a reason to preserve the single-page renderer.

Sources: [Next.js Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components), [Next.js navigation](https://nextjs.org/docs/app/api-reference/functions/use-router), [Next.js authorization guidance](https://nextjs.org/docs/app/guides/authentication).
