# 02 — Qlik reload test on the tenant

**What to build:** A throwaway test in the Qlik tenant that answers how fresh the Event dashboard can really be. A small app in the new shared space `PADDLEPOINT EVENT` loads from one of PaddlePoint's existing public read endpoints through the REST connector. A Qlik Automate automation reloads it every minute for at least 30 minutes while a sheet stays open in a browser. The findings decide the reload interval for ticket 09.

See ADR 0001: freshness equals the reload cadence. The native scheduler only goes down to hourly, and nothing documents whether an open sheet updates without a click.

**Blocked by:** None — can start immediately

**Status:** done (2026-09-16, on `mtcmarketing.sg.qlikcloud.com` — see tenant note below)

- [x] The shared space `PADDLEPOINT EVENT` exists on the tenant, and organisers have view access
- [x] A 1-minute reload automation ran for at least 30 minutes
- [x] Findings recorded in this ticket: typical reload duration, whether runs overlapped or queued, whether an open sheet showed new data without a click, and any capacity or quota warnings
- [x] The chosen interval is recorded: 1 minute if it held, otherwise 5 minutes
- [x] The test automation is switched off afterwards

## Findings (2026-09-16)

Tenant used: `mtcmarketing.sg.qlikcloud.com` (sandbox, not `ssi.sg`) — see the handoff's tenant-ambiguity note; this ticket does not resolve which tenant is the real production target, it only proves the mechanism.

**Setup:** Created the `PADDLEPOINT EVENT` shared space and moved the existing throwaway app ("PaddlePoint Event – Reload Test") into it. Built a Qlik Automate automation (Qlik Cloud Services connector's "Do reload" block) on a 1-minute schedule via the REST API directly (`POST /api/v1/automations`, `schedules[].interval: 60`), rather than through the Automate UI.

**Reload cadence, duration, overlap:** Ran cleanly from 03:09:35 to 03:41:35 UTC — 32 consecutive 1-minute ticks, all `SUCCEEDED`, comfortably over the 30-minute minimum. Reload duration (Qlik-reported engine time) was consistently 0.7–1.9 seconds, one outlier at ~6 seconds. Every run finished 55+ seconds before the next one started — no overlap, no queueing, no `EXCEEDED_LIMIT` or other capacity/quota warnings at any point.

**Open sheet auto-update:** Confirmed by hand — with a sheet already open in a browser and never refreshed, values changed on their own as reloads landed. No click needed.

**Native scheduler vs Automate:** Confirmed firsthand why Automate is required — Automate's schedule accepted and honored `FREQ=MINUTELY;INTERVAL=1` without complaint (visible in the automation's own `recurrence` field), which the ticket's premise says the native reload-task scheduler cannot do.

**Gotcha worth carrying into ticket 03+:** Moving the REST data connection ("PaddlePoint API", `qLogOn: 1` / current-user auth) into the new shared space broke reload immediately — `LIB CONNECT TO 'PaddlePoint API'` failed with `EngineConnectorError: connection not found`, even with the app in that same shared space. Reverting the connection to its owner's personal/default space (app still in the shared space) fixed it instantly, confirmed by both a manual reload and the automation's subsequent scheduled runs succeeding. Current live state: app lives in `PADDLEPOINT EVENT`, the `PaddlePoint API` connection stays in the personal/default space. Whoever builds the real ticket-03 connection should keep it out of the shared space (or budget time to root-cause why a shared-space REST connection with current-user auth isn't resolving — this ticket didn't dig further since the personal-space workaround was sufficient for the throwaway test).

**Chosen interval: 1 minute.** It held for the full window with zero failures, no overlap, and no quota warnings.

**Cleanup:** The test automation was deleted after data collection (its schedule had already gone inert once `stopAt` passed). The shared space, and the app + connection now split across it and the personal space, were left in place per the checklist above.
