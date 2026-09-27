import { strict as assert } from "node:assert";
import { planLegacyMatches, type MatchSnapshot } from "../scripts/legacy-matches";

const engine = require("../../rally-engine.js");
const makeGame = (id: string) => engine.createGame({ id, type: "doubles", now: "2025-01-01T00:00:00Z", targetScore: 11, firstServer: "A", teamA: { name: "Team A", players: ["Ada", "Bob"], startingRight: 0 }, teamB: { name: "Team B", players: ["Cal", "Dee"], startingRight: 0 } });
const game = makeGame("g1");
engine.recordRally(game, "A", { eventId: "r1", now: "2025-01-01T00:01:00Z" });
const visitor = makeGame("v1");
engine.recordRally(visitor, "A", { eventId: "vr1", now: "2025-01-01T00:01:00Z" });
const snapshot: MatchSnapshot = {
  games: [
    { id: "g1", match_scope: "tournament", tournament_id: "summer", tournament_match_id: "m1", team_a_score: game.teamA.score, team_b_score: game.teamB.score, winner_team: game.winner, game_json: JSON.stringify(game) },
    { id: "v1", match_scope: "visitor", created_by_user_id: 7, created_by_role: "visitor", team_a_score: visitor.teamA.score, team_b_score: visitor.teamB.score, winner_team: visitor.winner, game_json: JSON.stringify(visitor) },
  ],
  gamePlayers: ["Ada", "Bob", "Cal", "Dee"].map((name, index) => ({ game_id: "g1", team: index < 2 ? "A" : "B", player_name: name, player_id: index + 1 })),
  legacyUsers: [{ id: 7, role: "visitor" }],
};
const plan = planLegacyMatches(snapshot);
assert.deepEqual(plan.rejected, []);
assert.deepEqual(plan.discrepancies, []);
assert.equal(plan.regular[0].eventId, "legacy:event:summer");
assert.equal(plan.regular[0].tournamentMatchId, "legacy:match:summer:m1");
assert.equal(plan.regular[0].players.length, 4);
assert.deepEqual(plan.regular[0].rallyLog.map((event) => event.id), ["r1"]);
assert.equal(plan.visitors[0].legacyOwnerId, "7");
const bad = structuredClone(snapshot);
bad.games[0].team_a_score = 99;
assert.equal(planLegacyMatches(bad).discrepancies.length, 1);
const reversed = structuredClone(snapshot);
const reversedGame = JSON.parse(String(reversed.games[0].game_json));
reversedGame.events[0].createdAt = "2024-01-01T00:00:00Z";
reversed.games[0].game_json = JSON.stringify(reversedGame);
assert.equal(planLegacyMatches(reversed).rejected.length, 1);
console.log("Legacy match fixture checks passed");
