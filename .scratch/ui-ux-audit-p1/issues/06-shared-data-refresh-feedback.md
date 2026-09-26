# 06 — Make shared-data refreshes visible and retryable

**What to build:** When users refresh Users, History, Leaderboards, Live data, or Tournament data, the affected region communicates that it is updating, prevents duplicate refreshes, and keeps existing data visible when the network request fails.

Origin: UI/UX audit finding U-09, limited to shared-data refresh actions.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] Each manual refresh action exposes a pending state and ignores duplicate activation until the request finishes
- [x] Existing data remains visible and is identified as potentially stale while an update is pending
- [x] Successful refreshes announce completion without rebuilding unrelated page content
- [x] Failed refreshes preserve the last usable data and provide a visible retry action
- [x] Silent Live refreshes do not steal focus or repeatedly announce routine updates
- [x] A current data timestamp or equivalent freshness cue is available where stale data could affect operations
