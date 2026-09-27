import type { LegacySnapshot } from "./legacy-structure";
import type { MatchSnapshot } from "./legacy-matches";

type FullSnapshot = LegacySnapshot & MatchSnapshot;
const engine = require("../../rally-engine.js");

export const fixtureIds = {
  sourceEvent: "rehearsal_v1",
  visitorUser: "rehearsal:visitor:v1",
  playerUser: "rehearsal:player:v1",
};

export function rehearsalFixture(): FullSnapshot {
  const names = ["Rehearsal Ada", "Rehearsal Bob", "Rehearsal Cal", "Rehearsal Dee"];
  const game = (id: string, startedAt: string) => engine.createGame({ id, type: "doubles", now: startedAt, targetScore: 3, firstServer: "A", teamA: { name: "Team A", players: names.slice(0, 2), startingRight: 0 }, teamB: { name: "Team B", players: names.slice(2), startingRight: 0 } });
  const done = game("rehearsal_done", "2025-01-01T09:00:00Z");
  for (let n = 1; n <= 3; n++) engine.recordRally(done, "A", { eventId: `rehearsal_r${n}`, now: `2025-01-01T09:0${n}:00Z` });
  const active = game("rehearsal_active", "2025-01-01T10:00:00Z");
  engine.recordRally(active, "A", { eventId: "rehearsal_active_r1", now: "2025-01-01T10:01:00Z" });
  const visitor = engine.createGame({ id: "rehearsal_visitor", type: "doubles", now: "2025-01-02T09:00:00Z", targetScore: 11, firstServer: "A", teamA: { name: "Team A", players: ["Visitor One", "Visitor Two"], startingRight: 0 }, teamB: { name: "Team B", players: ["Visitor Three", "Visitor Four"], startingRight: 0 } });
  engine.recordRally(visitor, "A", { eventId: "rehearsal_visitor_r1", now: "2025-01-02T09:01:00Z" });
  const sourceGame = (value: typeof done, slot: string | null, role: string | null = null) => ({
    id: value.id, match_scope: role === "visitor" ? "visitor" : "tournament", created_by_user_id: role === "visitor" ? 7 : null, created_by_role: role,
    tournament_id: slot ? fixtureIds.sourceEvent : null, tournament_match_id: slot,
    team_a_score: value.teamA.score, team_b_score: value.teamB.score, winner_team: value.winner, target_score: value.targetScore,
    duration_seconds: value.endedAt ? Math.round((Date.parse(value.endedAt) - Date.parse(value.startedAt)) / 1000) : 0,
    started_at: value.startedAt, ended_at: value.endedAt, game_json: JSON.stringify(value),
  });
  return {
    players: names.map((name, index) => ({ id: index + 1, name, skill_level: ["advanced", "intermediate", "beginner", null][index], created_at: "2025-01-01T00:00:00Z" })),
    tournaments: [{ id: fixtureIds.sourceEvent, name: "Rehearsal Event", court_count: 1, updated_at: "2025-01-01T00:00:00Z", tournament_json: JSON.stringify({ playersText: names.join(","), targetScore: 3, matchesPerPlayer: 3, transitionMinutes: 2 }) }],
    matches: [
      { tournament_id: fixtureIds.sourceEvent, id: "slot_done", round: 1, court: 1, status: "completed", team_a: JSON.stringify(names.slice(0, 2)), team_b: JSON.stringify(names.slice(2)), started_at: done.startedAt, completed_at: done.endedAt },
      { tournament_id: fixtureIds.sourceEvent, id: "slot_active", round: 2, court: 1, status: "in_progress", team_a: JSON.stringify(names.slice(0, 2)), team_b: JSON.stringify(names.slice(2)), started_at: active.startedAt, completed_at: null },
      { tournament_id: fixtureIds.sourceEvent, id: "slot_scheduled", round: 3, court: 1, status: "scheduled", team_a: JSON.stringify(names.slice(0, 2)), team_b: JSON.stringify(names.slice(2)), started_at: null, completed_at: null },
    ],
    currentEventId: fixtureIds.sourceEvent,
    games: [sourceGame(done, "slot_done"), sourceGame(active, "slot_active"), sourceGame(visitor, null, "visitor")],
    gamePlayers: [done.id, active.id, visitor.id].flatMap((gameId) => (gameId === visitor.id ? ["Visitor One", "Visitor Two", "Visitor Three", "Visitor Four"] : names).map((name, index) => ({ game_id: gameId, team: index < 2 ? "A" : "B", player_name: name, player_id: gameId === visitor.id ? null : index + 1 }))),
    legacyUsers: [{ id: 7, role: "visitor", player_id: null }, { id: 8, role: "player", player_id: 1 }],
  };
}
