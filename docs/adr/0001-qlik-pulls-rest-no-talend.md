---
status: accepted; one-Event scope and "no team table" superseded by ADR 0002
---

# Qlik pulls read-only REST endpoints; no Talend, no change data capture

For the Qlik-partnered pickleball Event, Qlik Cloud loads Scores through its REST connector from read-only `/api/qlik/*` endpoints on PaddlePoint, authenticated by an analytics key sent in a header. PaddlePoint's MySQL stays the only source of truth, nothing is written back, and dashboard freshness is whatever the reload cadence allows (reloads run only during Event hours). We chose this because it needs no new infrastructure for a one-Event deployment. Seconds-level Scores for the public stay on PaddlePoint's own Live board, and the dashboard is not embedded publicly.

## Considered Options

- **Talend CDC into PostgreSQL, Qlik Direct Query.** Met a latency of "a few seconds to a minute", but PostgreSQL is a replication-only target in Qlik Talend Cloud, so Talend could not do the transforms.
- **Talend pipeline into Snowflake, Qlik Direct Query.** Met "Talend ingests, transforms and stores" with about one minute of lag. Rejected as too much infrastructure for one Event: a Data Movement gateway, MySQL binlog and replication grants on production, and a Snowflake account.
- **Public embed of the dashboard.** Rejected: Direct Query apps cannot be embedded, and anonymous access needs a separate tenant in the Stockholm region, capped at 48 scheduled reloads per app per day.

## Consequences

- The original objective "Talend ingests, transforms and stores scoring data" is dropped.
- Dashboard data lags the Live board by up to one reload interval.
- The player-ranking rules exist twice, in PHP (`read_leaderboard`) and in the Qlik load script. A PHP test keeps the endpoint rows consistent with `read_leaderboard`'s player totals.
- The Event Leaderboard deliberately has no team table. Open Play rotates partners, so teams rarely recur. This differs from the app's all-time Leaderboard on purpose.
