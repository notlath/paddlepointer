const test = require("node:test");
const assert = require("node:assert/strict");

const RallyEngine = require("../rally-engine.js");

test("standalone and tournament Games are built by one shared function", () => {
  // Standalone game
  const standalone = RallyEngine.createGame({
    type: "doubles",
    scorerName: "Court 1",
    teamA: { name: "Team A", players: ["Alice", "Amy"] },
    teamB: { name: "Team B", players: ["Bob", "Bill"] },
    firstServer: "A",
    targetScore: 11,
    winByTwo: true,
    createdBy: { displayName: "Admin", role: "admin" },
    matchScope: "standard",
  });

  assert.equal(standalone.type, "doubles");
  assert.equal(standalone.scorerName, "Court 1");
  assert.equal(standalone.teamA.name, "Team A");
  assert.deepEqual(standalone.teamA.players, ["Alice", "Amy"]);
  assert.deepEqual(standalone.teamA.positions, { right: 0, left: 1 });
  assert.equal(standalone.teamA.score, 0);
  assert.equal(standalone.teamB.name, "Team B");
  assert.deepEqual(standalone.teamB.players, ["Bob", "Bill"]);
  assert.deepEqual(standalone.teamB.positions, { right: 0, left: 1 });
  assert.equal(standalone.teamB.score, 0);
  assert.equal(standalone.servingTeam, "A");
  assert.equal(standalone.firstServer, "A");
  assert.equal(standalone.serverNumber, 2);
  assert.equal(standalone.currentServerIndex, 0);
  assert.equal(standalone.status, "active");
  assert.equal(standalone.winner, null);
  assert.equal(standalone.matchScope, "standard");
  assert.equal(standalone.sideOuts, 0);
  assert.deepEqual(standalone.events, []);

  // Tournament game
  const tournamentGame = RallyEngine.createGame({
    type: "doubles",
    scorerName: "Admin",
    teamA: { name: "Alice / Amy", players: ["Alice", "Amy"] },
    teamB: { name: "Bob / Bill", players: ["Bob", "Bill"] },
    firstServer: "A",
    targetScore: 15,
    winByTwo: true,
    createdBy: { displayName: "Admin", role: "admin" },
    matchScope: "tournament",
    tournamentMatch: {
      tournamentId: "t1",
      tournamentName: "Summer Open",
      matchId: "m1",
      round: 1,
      court: 2,
    },
  });

  assert.equal(tournamentGame.matchScope, "tournament");
  assert.equal(tournamentGame.targetScore, 15);
  assert.deepEqual(tournamentGame.tournamentMatch, {
    tournamentId: "t1",
    tournamentName: "Summer Open",
    matchId: "m1",
    round: 1,
    court: 2,
  });
});

test("doubles Game starts at '0-0-2'", () => {
  const game = RallyEngine.createGame({
    type: "doubles",
    teamA: { name: "Team A", players: ["Alice", "Amy"] },
    teamB: { name: "Team B", players: ["Bob", "Bill"] },
    firstServer: "A",
  });

  assert.equal(RallyEngine.scoreCall(game), "0 - 0 - 2");
  assert.equal(game.serverNumber, 2);
  assert.equal(game.servingTeam, "A");
  assert.equal(game.teamA.score, 0);
  assert.equal(game.teamB.score, 0);
  assert.deepEqual(RallyEngine.servePosition(game), {
    side: "right",
    label: "Right",
    parity: "even",
  });
});

test("server switch on fault during server 1 in doubles", () => {
  const game = RallyEngine.createGame({
    type: "doubles",
    teamA: { name: "Team A", players: ["Alice", "Amy"] },
    teamB: { name: "Team B", players: ["Bob", "Bill"] },
    firstServer: "A",
  });

  // Game starts 0-0-2. Team B wins rally -> Side-out to Team B at 0-0-1.
  RallyEngine.recordRally(game, "B");
  assert.equal(game.servingTeam, "B");
  assert.equal(game.serverNumber, 1);
  assert.equal(game.sideOuts, 1);
  assert.equal(RallyEngine.scoreCall(game), "0 - 0 - 1");

  // Team B is on server 1. Now Team A wins rally -> First fault (server-switch).
  const outcome = RallyEngine.recordRally(game, "A");
  assert.equal(outcome.event.action, "server-switch");
  assert.equal(game.servingTeam, "B", "Serving team stays Team B");
  assert.equal(game.serverNumber, 2, "Server number switches to 2");
  assert.equal(game.sideOuts, 1, "Side-outs count does not change");
  assert.equal(RallyEngine.scoreCall(game), "0 - 0 - 2");
});

test("side-out on fault during server 2 in doubles", () => {
  const game = RallyEngine.createGame({
    type: "doubles",
    teamA: { name: "Team A", players: ["Alice", "Amy"] },
    teamB: { name: "Team B", players: ["Bob", "Bill"] },
    firstServer: "A",
  });

  // Start is 0-0-2 for Team A. Team B wins rally -> side-out!
  const outcome = RallyEngine.recordRally(game, "B");
  assert.equal(outcome.event.action, "side-out");
  assert.equal(game.servingTeam, "B");
  assert.equal(game.serverNumber, 1);
  assert.equal(game.sideOuts, 1);
  assert.equal(RallyEngine.scoreCall(game), "0 - 0 - 1");
  assert.deepEqual(RallyEngine.servePosition(game), {
    side: "right",
    label: "Right",
    parity: "even",
  });
});

test("singles serving side by score", () => {
  const game = RallyEngine.createGame({
    type: "singles",
    teamA: { name: "Team A", players: ["Alice"] },
    teamB: { name: "Team B", players: ["Bob"] },
    firstServer: "A",
  });

  assert.equal(RallyEngine.scoreCall(game), "0 - 0");
  assert.equal(game.serverNumber, null);
  // Score 0: even -> right side
  assert.deepEqual(RallyEngine.servePosition(game), {
    side: "right",
    label: "Right",
    parity: "even",
  });

  // Team A scores 1st point -> 1 - 0
  RallyEngine.recordRally(game, "A");
  assert.equal(RallyEngine.scoreCall(game), "1 - 0");
  // Score 1: odd -> left side
  assert.deepEqual(RallyEngine.servePosition(game), {
    side: "left",
    label: "Left",
    parity: "odd",
  });

  // Team A scores 2nd point -> 2 - 0
  RallyEngine.recordRally(game, "A");
  assert.equal(RallyEngine.scoreCall(game), "2 - 0");
  // Score 2: even -> right side
  assert.deepEqual(RallyEngine.servePosition(game), {
    side: "right",
    label: "Right",
    parity: "even",
  });

  // Team B wins rally -> side-out!
  const outcome = RallyEngine.recordRally(game, "B");
  assert.equal(outcome.event.action, "side-out");
  assert.equal(game.servingTeam, "B");
  assert.equal(RallyEngine.scoreCall(game), "0 - 2");
  // Team B's score is 0: even -> right side
  assert.deepEqual(RallyEngine.servePosition(game), {
    side: "right",
    label: "Right",
    parity: "even",
  });
});

test("win-by-two: 11-10 keeps playing, 12-10 wins", () => {
  const game = RallyEngine.createGame({
    type: "doubles",
    teamA: { name: "Team A", players: ["Alice", "Amy"] },
    teamB: { name: "Team B", players: ["Bob", "Bill"] },
    targetScore: 11,
    winByTwo: true,
  });

  // Set scores to 10-10
  game.teamA.score = 10;
  game.teamB.score = 10;
  game.servingTeam = "A";

  // Team A scores -> 11 - 10
  const outcome1 = RallyEngine.recordRally(game, "A");
  assert.equal(game.teamA.score, 11);
  assert.equal(game.teamB.score, 10);
  assert.equal(RallyEngine.detectWinner(game), null, "11-10 does not win when winByTwo is true");
  assert.equal(game.status, "active");
  assert.equal(outcome1.winner, null);
  assert.equal(outcome1.isCompleted, false);

  // Team A scores again -> 12 - 10
  const outcome2 = RallyEngine.recordRally(game, "A");
  assert.equal(game.teamA.score, 12);
  assert.equal(game.teamB.score, 10);
  assert.equal(RallyEngine.detectWinner(game), "A", "12-10 wins by 2");
  assert.equal(game.status, "completed");
  assert.equal(game.winner, "A");
  assert.equal(outcome2.winner, "A");
  assert.equal(outcome2.isCompleted, true);
});

test("undoing a Rally restores exactly the previous Game", () => {
  const game = RallyEngine.createGame({
    type: "doubles",
    teamA: { name: "Team A", players: ["Alice", "Amy"] },
    teamB: { name: "Team B", players: ["Bob", "Bill"] },
    firstServer: "A",
  });

  const undoStack = [];
  const stateBeforeRally1 = RallyEngine.cloneGame(game);

  // Score rally 1
  RallyEngine.recordRally(game, "A", { undoStack });
  assert.equal(game.teamA.score, 1);
  const stateBeforeRally2 = RallyEngine.cloneGame(game);

  // Score rally 2
  RallyEngine.recordRally(game, "B", { undoStack });
  assert.equal(game.servingTeam, "B");

  // Undo rally 2
  const restored1 = RallyEngine.undoRally(undoStack);
  assert.deepEqual(restored1, stateBeforeRally2, "Restores exactly state before rally 2");

  // Undo rally 1
  const restored0 = RallyEngine.undoRally(undoStack);
  assert.deepEqual(restored0, stateBeforeRally1, "Restores exactly state before rally 1 (initial game)");
});

test("resetGame restores game back to 0-0", () => {
  const game = RallyEngine.createGame({
    type: "doubles",
    teamA: { name: "Team A", players: ["Alice", "Amy"] },
    teamB: { name: "Team B", players: ["Bob", "Bill"] },
  });

  RallyEngine.recordRally(game, "A");
  RallyEngine.recordRally(game, "A");
  assert.equal(game.teamA.score, 2);

  RallyEngine.resetGame(game);
  assert.equal(game.teamA.score, 0);
  assert.equal(game.teamB.score, 0);
  assert.equal(game.servingTeam, "A");
  assert.equal(game.serverNumber, 2);
  assert.equal(game.status, "active");
  assert.equal(game.events.length, 0);
  assert.equal(RallyEngine.scoreCall(game), "0 - 0 - 2");
});

test("endGameEarly marks completed and assigns winner based on higher score", () => {
  const game = RallyEngine.createGame({
    type: "doubles",
    teamA: { name: "Team A", players: ["Alice", "Amy"] },
    teamB: { name: "Team B", players: ["Bob", "Bill"] },
  });

  game.teamA.score = 7;
  game.teamB.score = 4;

  RallyEngine.endGameEarly(game);
  assert.equal(game.status, "completed");
  assert.equal(game.winner, "A");
  assert.equal(game.endedEarly, true);
  assert.ok(game.endedAt);
});

test("ending a Match early records the retiring Team and awards the other Team the win", () => {
  const game = RallyEngine.createGame({
    type: "doubles",
    teamA: { name: "Team A", players: ["Alice", "Amy"] },
    teamB: { name: "Team B", players: ["Bob", "Bill"] },
  });
  game.teamA.score = 7;
  game.teamB.score = 4;

  RallyEngine.endGameEarly(game, { retiredTeam: "A" });

  assert.equal(game.status, "completed");
  assert.equal(game.winner, "B");
  assert.equal(game.endedEarly, true);
  assert.equal(game.endReason, "retirement_or_forfeit");
  assert.equal(game.retiredTeam, "A");
});

test("retirement decides the winner while trailing and at 0-0", () => {
  for (const [scoreA, scoreB] of [[4, 7], [0, 0]]) {
    const game = RallyEngine.createGame({
      type: "doubles",
      teamA: { name: "Team A", players: ["Alice", "Amy"] },
      teamB: { name: "Team B", players: ["Bob", "Bill"] },
    });
    game.teamA.score = scoreA;
    game.teamB.score = scoreB;

    RallyEngine.endGameEarly(game, { retiredTeam: "A" });

    assert.equal(game.winner, "B");
    assert.equal(game.status, "completed");
  }
});

test("undoing a Rally directly on game rebuilds from events and gives the same Game as never having played it", () => {
  const game = RallyEngine.createGame({
    type: "doubles",
    teamA: { name: "Team A", players: ["Alice", "Amy"] },
    teamB: { name: "Team B", players: ["Bob", "Bill"] },
    firstServer: "A",
  });

  const state0 = RallyEngine.cloneGame(game);

  // Play rally 1: Team A scores
  RallyEngine.recordRally(game, "A");
  const state1 = RallyEngine.cloneGame(game);
  assert.equal(game.teamA.score, 1);
  assert.equal(game.events.length, 1);

  // Play rally 2: Team B scores (side-out)
  RallyEngine.recordRally(game, "B");
  const state2 = RallyEngine.cloneGame(game);
  assert.equal(game.servingTeam, "B");
  assert.equal(game.events.length, 2);

  // Play rally 3: Team B scores
  RallyEngine.recordRally(game, "B");
  assert.equal(game.teamB.score, 1);
  assert.equal(game.events.length, 3);

  // Undo rally 3 directly on game
  const undone2 = RallyEngine.undoRally(game);
  assert.equal(undone2, game);
  assert.deepEqual(game, state2, "Game after undoing rally 3 matches exactly state 2");
  assert.equal(RallyEngine.scoreCall(game), RallyEngine.scoreCall(state2));
  assert.deepEqual(RallyEngine.servePosition(game), RallyEngine.servePosition(state2));

  // Undo rally 2 directly on game
  const undone1 = RallyEngine.undoRally(game);
  assert.equal(undone1, game);
  assert.deepEqual(game, state1, "Game after undoing rally 2 matches exactly state 1");

  // Undo rally 1 directly on game -> back to 0-0
  const undone0 = RallyEngine.undoRally(game);
  assert.equal(undone0, game);
  assert.deepEqual(game, state0, "Game after undoing rally 1 matches exactly state 0 (0-0)");
  assert.equal(game.events.length, 0);
  assert.equal(RallyEngine.canUndo(game), false);

  // Calling undo on 0-0 returns null and leaves game untouched
  const noUndo = RallyEngine.undoRally(game);
  assert.equal(noUndo, null);
  assert.deepEqual(game, state0);
});

test("undo survives page refresh (JSON serialization/deserialization) and can go all the way back to 0-0", () => {
  const game = RallyEngine.createGame({
    type: "doubles",
    teamA: { name: "Team A", players: ["Alice", "Amy"] },
    teamB: { name: "Team B", players: ["Bob", "Bill"] },
    firstServer: "A",
  });

  // Play 3 rallies
  RallyEngine.recordRally(game, "A"); // 1-0-2
  RallyEngine.recordRally(game, "B"); // side-out -> 0-1-1
  RallyEngine.recordRally(game, "A"); // server switch -> 0-1-2

  assert.equal(game.events.length, 3);
  assert.equal(RallyEngine.scoreCall(game), "0 - 1 - 2");

  // Simulate page refresh: serialize to JSON (as stored in localStorage ACTIVE_KEY) and parse back
  const serialized = JSON.stringify(game);
  const refreshedGame = JSON.parse(serialized);

  // Verify canUndo is true on refreshed game
  assert.equal(RallyEngine.canUndo(refreshedGame), true);

  // Undo rally 3 on refreshed game
  const afterUndo1 = RallyEngine.undoRally(refreshedGame);
  assert.ok(afterUndo1);
  assert.equal(refreshedGame.events.length, 2);
  assert.equal(RallyEngine.scoreCall(refreshedGame), "0 - 1 - 1");
  assert.equal(refreshedGame.servingTeam, "B");
  assert.equal(refreshedGame.serverNumber, 1);
  assert.deepEqual(RallyEngine.servePosition(refreshedGame), { side: "right", label: "Right", parity: "even" });

  // Simulate another page refresh mid-game
  const refreshedGame2 = JSON.parse(JSON.stringify(refreshedGame));
  assert.equal(RallyEngine.canUndo(refreshedGame2), true);

  // Undo rally 2 on refreshed game
  RallyEngine.undoRally(refreshedGame2);
  assert.equal(refreshedGame2.events.length, 1);
  assert.equal(RallyEngine.scoreCall(refreshedGame2), "1 - 0 - 2");
  assert.equal(refreshedGame2.servingTeam, "A");
  assert.equal(refreshedGame2.serverNumber, 2);

  // Undo rally 1 on refreshed game -> all the way back to 0-0
  RallyEngine.undoRally(refreshedGame2);
  assert.equal(refreshedGame2.events.length, 0);
  assert.equal(refreshedGame2.teamA.score, 0);
  assert.equal(refreshedGame2.teamB.score, 0);
  assert.equal(refreshedGame2.servingTeam, "A");
  assert.equal(refreshedGame2.serverNumber, 2);
  assert.equal(RallyEngine.scoreCall(refreshedGame2), "0 - 0 - 2");
  assert.equal(RallyEngine.canUndo(refreshedGame2), false);
});

test("undoing winning rally restores active status and clears winner", () => {
  const game = RallyEngine.createGame({
    type: "doubles",
    teamA: { name: "Team A", players: ["Alice", "Amy"] },
    teamB: { name: "Team B", players: ["Bob", "Bill"] },
    targetScore: 2,
    winByTwo: true,
  });

  // Score 1st point -> 1-0-2
  RallyEngine.recordRally(game, "A");
  assert.equal(game.teamA.score, 1);
  assert.equal(game.status, "active");

  // Score 2nd point -> 2-0-2 (winning point!)
  RallyEngine.recordRally(game, "A");
  assert.equal(game.teamA.score, 2);
  assert.equal(game.status, "completed");
  assert.equal(game.winner, "A");
  assert.ok(game.endedAt);

  // Undo winning point
  RallyEngine.undoRally(game);
  assert.equal(game.teamA.score, 1);
  assert.equal(game.status, "active");
  assert.equal(game.winner, null);
  assert.equal(game.endedAt, null);
  assert.equal(game.endedEarly, false);
});

test("undoing a rally in a tournament match updates score and event count for match sync", () => {
  const { buildMatchUpdate } = require("../tournament-match.js");

  const game = RallyEngine.createGame({
    type: "doubles",
    teamA: { name: "Alice / Amy", players: ["Alice", "Amy"] },
    teamB: { name: "Bob / Bill", players: ["Bob", "Bill"] },
    firstServer: "A",
    tournamentMatch: {
      tournamentId: "open_play",
      tournamentName: "Open Play",
      matchId: "m1",
      round: 1,
      court: 1,
    },
  });

  // Play two rallies: 1-0-2, then 2-0-2
  RallyEngine.recordRally(game, "A");
  RallyEngine.recordRally(game, "A");
  assert.equal(game.teamA.score, 2);

  const updateBeforeUndo = buildMatchUpdate(game, "in_progress");
  assert.equal(updateBeforeUndo.scoreA, "2");
  assert.equal(updateBeforeUndo.liveEventCount, 2);

  // Undo one rally
  RallyEngine.undoRally(game);
  assert.equal(game.teamA.score, 1);
  assert.equal(game.events.length, 1);

  const updateAfterUndo = buildMatchUpdate(game, "in_progress");
  assert.equal(updateAfterUndo.scoreA, "1");
  assert.equal(updateAfterUndo.liveEventCount, 1);
});
