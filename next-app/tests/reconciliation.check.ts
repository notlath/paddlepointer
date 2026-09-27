import { strict as assert } from "node:assert";
import { digest, expectedQlikRows } from "../scripts/reconciliation";
import { fixtureIds, rehearsalFixture } from "../scripts/rehearsal-fixture";

const snapshot = rehearsalFixture();
assert.equal(digest(snapshot), digest(rehearsalFixture()), "fixture must be reproducible");
const events = expectedQlikRows(snapshot, fixtureIds.sourceEvent, "get-events");
assert.deepEqual(events[0].eventWindow, { start: "2025-01-01T09:00:00.000Z", end: "2025-01-01T09:03:00.000Z" });
assert.equal(events[0].matchCount, 3);
const matches = expectedQlikRows(snapshot, fixtureIds.sourceEvent, "get-matches");
assert.deepEqual(matches.map((item) => item.status), ["completed", "in_progress", "scheduled"]);
const results = expectedQlikRows(snapshot, fixtureIds.sourceEvent, "get-leaderboard-results");
assert.equal(results.length, 1);
assert.deepEqual([results[0].teamAScore, results[0].rallyCount, results[0].teamALongestRun], [3, 3, 3]);
const players = expectedQlikRows(snapshot, fixtureIds.sourceEvent, "get-leaderboard-players");
assert.equal(players.length, 12);
assert(players.every((item) => item.matchId !== "legacy:visitor:rehearsal_visitor"));
console.log("Reconciliation fixture contract passed");
