const test = require("node:test");
const assert = require("node:assert/strict");

const { applyServerMatch, buildMatchUpdate } = require("../tournament-match.js");

test("buildMatchUpdate builds payload for start and in-progress score sync", () => {
  const game = {
    id: "game_123",
    status: "active",
    startedAt: "2026-09-13T10:00:00Z",
    createdBy: { displayName: "Admin" },
    teamA: { score: 4 },
    teamB: { score: 2 },
    events: [1, 2],
    tournamentMatch: {
      tournamentId: "open_play",
      matchId: "m1",
      round: 1,
      court: 1,
    },
  };

  const startUpdate = buildMatchUpdate(game, "in_progress");
  assert.equal(startUpdate.tournamentId, "open_play");
  assert.equal(startUpdate.matchId, "m1");
  assert.equal(startUpdate.court, 1);
  assert.equal(startUpdate.activeGameId, "game_123");
  assert.equal(startUpdate.status, "in_progress");
  assert.equal(startUpdate.scoreA, "4");
  assert.equal(startUpdate.scoreB, "2");
  assert.equal(startUpdate.winner, null);
  assert.equal(startUpdate.completedAt, null);
  assert.equal(startUpdate.gameId, null);
  assert.equal(startUpdate.startedAt, "2026-09-13T10:00:00Z");
});

test("buildMatchUpdate builds payload for completed match", () => {
  const game = {
    id: "game_123",
    status: "completed",
    winner: "A",
    startedAt: "2026-09-13T10:00:00Z",
    endedAt: "2026-09-13T10:15:00Z",
    teamA: { score: 11 },
    teamB: { score: 5 },
    tournamentMatch: {
      tournamentId: "open_play",
      matchId: "m1",
    },
  };

  const completedUpdate = buildMatchUpdate(game, "completed", { durationSeconds: 900, durationMinutes: 15 });
  assert.equal(completedUpdate.status, "completed");
  assert.equal(completedUpdate.winner, "A");
  assert.equal(completedUpdate.gameId, "game_123");
  assert.equal(completedUpdate.completedAt, "2026-09-13T10:15:00Z");
  assert.equal(completedUpdate.durationSeconds, 900);
  assert.equal(completedUpdate.durationMinutes, 15);
});

test("buildMatchUpdate does not invent a winner and sends the scoring rules", () => {
  const update = buildMatchUpdate({
    id: "game_124",
    teamA: { score: 3 },
    teamB: { score: 11 },
    targetScore: 11,
    winByTwo: true,
    endedEarly: true,
    endReason: "retirement_or_forfeit",
    retiredTeam: "A",
    tournamentMatch: { tournamentId: "open_play", matchId: "m2" },
  }, "completed");

  assert.equal(update.winner, null);
  assert.equal(update.targetScore, 11);
  assert.equal(update.winByTwo, true);
  assert.equal(update.endedEarly, true);
  assert.equal(update.endReason, "retirement_or_forfeit");
  assert.equal(update.retiredTeam, "A");
});

test("buildMatchUpdate builds payload for unlocking a match to scheduled", () => {
  const game = {
    id: "game_123",
    status: "active",
    teamA: { score: 0 },
    teamB: { score: 0 },
    tournamentMatch: {
      tournamentId: "open_play",
      matchId: "m1",
    },
  };

  const unlockUpdate = buildMatchUpdate(game, "scheduled");
  assert.equal(unlockUpdate.status, "scheduled");
  assert.equal(unlockUpdate.winner, null);
  assert.equal(unlockUpdate.gameId, null);
});

test("applyServerMatch adopts server tournament when starting a match", () => {
  const tournament = {
    id: "open_play",
    matches: [
      { id: "m1", status: "scheduled", scoreA: "", scoreB: "" },
      { id: "m2", status: "scheduled", scoreA: "", scoreB: "" },
    ],
  };

  const serverResponse = {
    ok: true,
    id: "open_play",
    matchId: "m1",
    tournament: {
      id: "open_play",
      matches: [
        { id: "m1", status: "in_progress", activeGameId: "game_1", scoreA: "0", scoreB: "0", startedAt: "2026-09-13T10:00:00Z" },
        { id: "m2", status: "scheduled", scoreA: "", scoreB: "" },
      ],
    },
  };

  const result = applyServerMatch(tournament, serverResponse);
  assert.equal(result.ok, true);
  assert.equal(result.match.status, "in_progress");
  assert.equal(result.match.activeGameId, "game_1");
  assert.equal(result.match.scoreA, "0");
  assert.equal(result.tournament.matches[0].status, "in_progress");
});

test("applyServerMatch adopts server match when score syncing", () => {
  const tournament = {
    id: "open_play",
    matches: [
      { id: "m1", status: "in_progress", activeGameId: "game_1", scoreA: "2", scoreB: "1" },
    ],
  };

  const serverResponse = {
    ok: true,
    id: "open_play",
    matchId: "m1",
    tournament: {
      id: "open_play",
      matches: [
        { id: "m1", status: "in_progress", activeGameId: "game_1", scoreA: "3", scoreB: "1" },
      ],
    },
  };

  const result = applyServerMatch(tournament, serverResponse);
  assert.equal(result.ok, true);
  assert.equal(result.match.scoreA, "3");
  assert.equal(result.tournament.matches[0].scoreA, "3");
});

test("applyServerMatch adopts server match when completing", () => {
  const tournament = {
    id: "open_play",
    matches: [
      { id: "m1", status: "in_progress", activeGameId: "game_1", scoreA: "10", scoreB: "4" },
    ],
  };

  const serverResponse = {
    ok: true,
    id: "open_play",
    matchId: "m1",
    tournament: {
      id: "open_play",
      matches: [
        { id: "m1", status: "completed", winner: "A", gameId: "game_1", scoreA: "11", scoreB: "4", activeGameId: null },
      ],
    },
  };

  const result = applyServerMatch(tournament, serverResponse);
  assert.equal(result.ok, true);
  assert.equal(result.match.status, "completed");
  assert.equal(result.match.winner, "A");
  assert.equal(result.match.gameId, "game_1");
  assert.equal(result.match.activeGameId, null);
});

test("applyServerMatch adopts server match when resetting or unlocking", () => {
  const tournament = {
    id: "open_play",
    matches: [
      { id: "m1", status: "in_progress", activeGameId: "game_1", scoreA: "5", scoreB: "3" },
    ],
  };

  const serverResponse = {
    ok: true,
    id: "open_play",
    matchId: "m1",
    tournament: {
      id: "open_play",
      matches: [
        { id: "m1", status: "scheduled", activeGameId: null, scoreA: "5", scoreB: "3", startedAt: null },
      ],
    },
  };

  const result = applyServerMatch(tournament, serverResponse);
  assert.equal(result.ok, true);
  assert.equal(result.match.status, "scheduled");
  assert.equal(result.match.activeGameId, null);
  assert.equal(result.match.startedAt, null);
});

test("applyServerMatch leaves tournament unchanged on refused start and reports error", () => {
  const originalMatch = { id: "m1", status: "scheduled", scoreA: "", scoreB: "", activeGameId: null };
  const tournament = {
    id: "open_play",
    matches: [{ ...originalMatch }],
  };

  const refusalResponse = {
    ok: false,
    error: "Match is already ongoing on another scoreboard",
  };

  const result = applyServerMatch(tournament, refusalResponse);
  assert.equal(result.ok, false);
  assert.equal(result.error, "Match is already ongoing on another scoreboard");
  assert.deepEqual(result.tournament.matches[0], originalMatch, "Tournament match was left completely unchanged");
});

test("applyServerMatch leaves tournament unchanged on completed lock conflict", () => {
  const completedMatch = { id: "m1", status: "completed", winner: "A", gameId: "game_1", scoreA: "11", scoreB: "4" };
  const tournament = {
    id: "open_play",
    matches: [{ ...completedMatch }],
  };

  const refusalResponse = {
    ok: false,
    error: "Match is already completed and locked",
  };

  const result = applyServerMatch(tournament, refusalResponse);
  assert.equal(result.ok, false);
  assert.equal(result.error, "Match is already completed and locked");
  assert.deepEqual(result.tournament.matches[0], completedMatch, "Completed match is completely unchanged");
});
