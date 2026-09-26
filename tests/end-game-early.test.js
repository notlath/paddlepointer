const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rallyEngine = require("../rally-engine.js");
const { buildMatchUpdate } = require("../tournament-match.js");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8").replace(/\r\n/g, "\n");

function source(name) {
  const found = appCode.match(new RegExp(`\\n  (?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}`));
  assert.ok(found, `app.js must define ${name}`);
  return found[0];
}

function loadEndMatchFlow(game) {
  return new Function(
    "rallyEngine",
    "game",
    "assert",
    `const state = { currentGame: game };
     let confirmation = null;
     let completed = null;
     const requireMatchControlAccess = () => true;
     const gameTitle = () => "Match";
     const finalScore = (value) => value.teamA.score + " - " + value.teamB.score;
     const requestDestructiveConfirmation = (details, onConfirm) => { confirmation = { details, onConfirm }; return true; };
     const completeGame = (value, winner, endedEarly) => { completed = { value, winner, endedEarly }; };
     ${source("endGameEarly")}
     return {
       endGameEarly,
       confirmation: () => confirmation,
       completed: () => completed,
     };`,
  )(rallyEngine, game, assert);
}

test("End Match asks which Team retired and saves the other Team as winner", async () => {
  const game = rallyEngine.createGame({
    type: "doubles",
    teamA: { name: "Alpha", players: ["Alice", "Amy"] },
    teamB: { name: "Bravo", players: ["Bob", "Bill"] },
  });
  game.teamA.score = 8;
  game.teamB.score = 3;
  const flow = loadEndMatchFlow(game);

  flow.endGameEarly();
  const confirmation = flow.confirmation();

  assert.deepEqual(confirmation.details.choices, [
    { value: "A", label: "Alpha retired or forfeited" },
    { value: "B", label: "Bravo retired or forfeited" },
  ]);
  await confirmation.onConfirm("A");
  assert.equal(game.retiredTeam, "A");
  assert.equal(game.winner, "B");
  assert.deepEqual(flow.completed(), { value: game, winner: "B", endedEarly: true });
});

test("a 0-0 retirement produces a completed Tournament Match with a winner", () => {
  const game = rallyEngine.createGame({
    type: "doubles",
    teamA: { name: "Alpha", players: ["Alice", "Amy"] },
    teamB: { name: "Bravo", players: ["Bob", "Bill"] },
    tournamentMatch: { tournamentId: "event_1", matchId: "match_1", round: 1, court: 2 },
  });

  rallyEngine.endGameEarly(game, { retiredTeam: "A" });
  const update = buildMatchUpdate(game, "completed");

  assert.equal(update.status, "completed");
  assert.equal(update.winner, "B");
  assert.equal(update.scoreA, "0");
  assert.equal(update.scoreB, "0");
});

test("client normalization keeps a completed 0-0 retirement locked", () => {
  const normalizeTournamentMatchResult = new Function(
    `${source("normalizeTournamentMatchResult")}\nreturn normalizeTournamentMatchResult;`,
  )();
  const match = normalizeTournamentMatchResult({
    id: "match_1",
    status: "completed",
    scoreA: "0",
    scoreB: "0",
    winner: "B",
    gameId: "game_1",
    completedAt: "2026-09-22T08:00:00.000Z",
  });

  assert.equal(match.status, "completed");
  assert.equal(match.winner, "B");
  assert.equal(match.gameId, "game_1");
  assert.equal(match.completedAt, "2026-09-22T08:00:00.000Z");
});
