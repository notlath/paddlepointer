# Load test — largest expected Event

**Status:** passed 2026-09-21

**Scenario:** 8 courts each send a score-sync every 3 s, 50 Live Board viewers poll every 2 s,
5 Analytics users each fetch one Qlik token — 10 minutes against local Herd (nginx + PHP) on a
throwaway `paddlepoint_loadtest` database. **Pass:** p95 < 300 ms, zero 5xx, zero lock timeouts,
zero other errors. The Qlik token round-trips to Qlik Cloud and is reported, not held to the limit.

## Result (run 3, 15:18–15:29)

| Request | n | p50 | p95 | max | 5xx | lock | other |
|---|---|---|---|---|---|---|---|
| score-sync | 1568 | 52 ms | 81 ms | 1749 ms | 0 | 0 | 0 |
| live-board-poll | 14628 | 39 ms | 62 ms | 1782 ms | 0 | 0 | 0 |
| qlik-token | 5 | 1548 ms | 2304 ms | 2304 ms | 0 | 0 | 0 |

Headroom: p95 is roughly a quarter of the limit. Maxes near 1.8 s are isolated spikes.

## Runs 1–2: a harness fault, not an app fault

Both failed on transport resets only (1, then 3 at the same millisecond, `UND_ERR_INFO fetch
failed`), with nothing in Herd's nginx-error.log. Cause: all 63 simulated users shared Node's one
fetch connection pool, so ~16 sockets each carried ~1000 requests and hit nginx's default
`keepalive_requests 1000` together near the end. Real devices each keep their own connections
(≤300 requests per 10 min) and browsers retry a reset reused connection. Fixed by giving each
simulated device its own keep-alive agent; the pass criteria were not loosened.

## How to rerun

Sign-in to the local site fails while the override is in place — tell anyone using it.

```powershell
php -r "(new PDO('mysql:host=127.0.0.1;port=3306','root',''))->exec('DROP DATABASE IF EXISTS paddlepoint_loadtest');"
$env:PP_DB_NAME = 'paddlepoint_loadtest'; php .scratch/load-test/setup.php > $env:TEMP\lt_setup.json
# append PP_DB_NAME=paddlepoint_loadtest to .env, confirm /api/health.php reports it, then:
node .scratch/load-test/run.mjs $env:TEMP\lt_setup.json
# remove the .env line immediately; /api/health.php must report ac_pickle_score_new_app again
```

Afterwards run one manual Qlik reload: the 15-minute backstop may have loaded the throwaway data.
