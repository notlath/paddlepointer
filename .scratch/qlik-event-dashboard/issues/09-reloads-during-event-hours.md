# 09 — Reloads during Event hours

**What to build:** During the Event, the dashboard keeps itself fresh without anyone remembering to reload it. A Qlik Automate schedule reloads the Event dashboard app at the interval chosen in ticket 02, only between a fixed start and end time set before the Event. Organisers can run a manual reload when the Event runs late. Every sheet shows when the data was last reloaded, so nobody mistakes it for the live Scores on the Live board.

**Blocked by:** 02 — Qlik reload test on the tenant; 04 — Courts right now

**Status:** done (2026-09-17); windowed schedule superseded 2026-09-21 — reloads now run on every Match finish (`dfbe426a…`) plus an always-on 15-minute backstop (`93b24961…`, until 2027-09-21). No per-Event window to set.

- [x] The automation reloads the Event dashboard app at the interval recorded in ticket 02
- [x] Reloads run only inside the fixed start and end times of the Event
- [x] Organisers have a manual "reload now" run
- [x] Every sheet shows the last reload time in Asia/Manila time

## Progress (2026-09-17)

- No PHP/backend work needed — this ticket is entirely Qlik Automate + sheet configuration.
- **Last reload time (all 3 sheets):** `Match Analysis`, `Leaderboard`, and `Courts right now (test)` each now show a KPI tile with `'Last reloaded: ' & Timestamp(ConvertToLocalTime(ReloadTime(), 'GMT+08:00'))`, reusing a shared master measure (`Last Reload (Manila)`) on Match Analysis/Leaderboard. Courts already had its own working text-image with the same expression from ticket 04.
  - Detour: first tried a `text-image` object (to match Courts' existing style) built from `getProperties()` on that working object as a template. It looked byte-identical but silently rendered "Add text and measures" with a console `TypeError: Cannot read properties of undefined (reading 'auto')` — some client-side extension-state Qlik keeps per-object beyond what `getProperties()`/`setProperties()` exposes, that a freshly `createObject()`-made object doesn't get. Engine's own `getLayout()` computed the correct string throughout; only the visual render was broken. Confirmed the engine forbids changing `qInfo.qType` on an existing object ("Can not change Type"), so fixing it meant creating a new `kpi` object (a type proven reliable all session) and swapping the sheet's cell to point at it, not converting in place.
  - Also discovered (unrelated to the bug above): saving an app renames freshly-`createObject()`-made objects from their UUID `qId` to Qlik's native short alphanumeric form. Any script that records a UUID and expects to reference it after a `doSave()` needs to re-read the sheet's cells first.
  - Separately, real concurrent edits happened: the user was in the Qlik Sense editor at the same time, which produced genuine duplicate objects (confirmed with them directly) — cleaned up 5 confirmed-orphaned objects that were mine and one leftover 4-measure KPI duplicate at their request, leaving their versions in place per their choice.
- **Automation:** repurposed the disabled `PaddlePoint Reload Test` scaffold from ticket 02 (id `93b24961-ac0f-4aab-bd42-19f2ff961ca3`) rather than building a second one — renamed to `PaddlePoint Event Dashboard Reload`, kept its 1-minute `RRULE:FREQ=MINUTELY;INTERVAL=1;BYSECOND=0` (ticket 02's chosen interval), and set a live 5-minute `startAt`/`stopAt` test window (2026-09-17 15:59–16:04 Asia/Manila) to prove the fixed-window behavior end to end, same rigor as ticket 02. Enabled via `POST .../actions/enable` (`PUT` alone updates the schedule fields but not `state`).

## Verification (2026-09-17)

- **Fixed window, proven live:** 5 scheduled runs landed inside the window — 08:00:03, 08:01:01, 08:02:02, 08:03:02, 08:04:03 UTC (all `finished`, no errors) — then `nextRunAt` went to `null` right after `stopAt` (08:04 UTC / 16:04 Manila). No runs before the window opened or after it closed.
- **Manual "reload now", proven independently of the schedule:** at 08:07 UTC — 3 minutes *after* the window had already closed — `POST /api/v1/automations/{id}/runs` with `{"context": "api"}` or `{"context": "webhook"}` (the accepted context values; `manual`/`designer`/`user` are all rejected as invalid) queued and finished two more runs successfully. This is what backs an organiser's "reload now" button/action regardless of whether the fixed window is currently open.
- **Resting state:** disabled, moved into the shared `PADDLEPOINT EVENT` space (via `POST .../actions/change-space`, `{spaceId}` on the generic `PUT` alone doesn't take) so organisers can find and manually run it there. The test window's `startAt`/`stopAt` were left as the just-tested values — **before a real Event, someone needs to `PUT` new `startAt`/`stopAt` values (Asia/Manila) and call `POST .../actions/enable`.**
- Could not verify a non-owner "organiser" account can actually click Run in the Automate UI — only tested with this session's owner-level API key. Space membership/role for real organiser accounts is a follow-up for whoever manages tenant access.
- Full detail on the reload-time display fix and the concurrent-edit cleanup is in the Progress entry above; PHP suite untouched by this ticket (no backend changes).
