import { strict as assert } from "node:assert";
import { planLegacyStructure, type LegacySnapshot } from "../scripts/legacy-structure";

const fixture: LegacySnapshot = {
  players: [
    { id: 1, name: "Ada", skill_level: "Advanced", created_at: "2025-01-01T00:00:00Z" },
    { id: 2, name: "Bob", skill_level: null },
    { id: 3, name: "Cal", skill_level: "beginner" },
    { id: 4, name: "Dee", skill_level: "intermediate" },
  ],
  tournaments: [{ id: "summer", name: "Summer", court_count: 2, tournament_json: JSON.stringify({ playersText: "Ada, Bob\nCal, Dee", matchesPerPlayer: 3, targetScore: 11, transitionMinutes: 2 }) }],
  matches: [{ tournament_id: "summer", id: "m1", round: 1, court: 2, status: "scheduled", team_a: JSON.stringify({ players: ["Ada", "Bob"] }), team_b: JSON.stringify(["Cal", "Dee"]) }],
  currentEventId: "summer",
};

const plan = planLegacyStructure(fixture);
assert.deepEqual(plan.rejected, []);
assert.deepEqual(plan.discrepancies, []);
assert.equal(plan.currentEventId, "legacy:event:summer");
assert.equal(plan.rows.rosters.length, 4);
assert.equal(plan.rows.rounds[0].id, "legacy:round:summer:1");
assert.equal(plan.rows.matches[0].round_id, plan.rows.rounds[0].id);
assert.equal(plan.rows.slots.length, 4);
assert.deepEqual(new Set(plan.rows.slots.map((slot) => slot.player_id)), new Set(plan.rows.players.map((player) => player.id)));

const broken = structuredClone(fixture);
broken.matches[0].team_b = JSON.stringify(["Cal", "Unknown"]);
const rejected = planLegacyStructure(broken);
assert.equal(rejected.rows.matches.length, 0);
assert.equal(rejected.rejected.length, 1);
assert.equal(rejected.discrepancies.length, 1);
const badCourt = structuredClone(fixture);
badCourt.matches[0].court = 3;
assert.equal(planLegacyStructure(badCourt).rejected.length, 1);
const missingRoster = structuredClone(fixture);
missingRoster.tournaments[0].tournament_json = JSON.stringify({ targetScore: 11 });
assert.equal(planLegacyStructure(missingRoster).rejected.length, 1);
console.log("Legacy structure fixture checks passed");
