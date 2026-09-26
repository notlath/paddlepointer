const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rallyEngine = require("../rally-engine.js");
const { buildMatchUpdate } = require("../tournament-match.js");
const { buildLiveBoard } = require("../live-board.js");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8").replace(/\r\n/g, "\n");

function game(targetScore = 11) {
  return rallyEngine.createGame({
    type: "doubles",
    teamA: { name: "Alpha", players: ["Alice", "Amy"] },
    teamB: { name: "Bravo", players: ["Bob", "Bill"] },
    targetScore,
    tournamentMatch: { tournamentId: "event_1", matchId: "match_1", round: 1, court: 2 },
  });
}

// Team A serves and wins every Rally, so its score climbs by one per Rally.
function pointsForA(match, count) {
  for (let index = 0; index < count; index += 1) rallyEngine.recordRally(match, "A");
  return match;
}

test("ends switch at half the target, rounded up", () => {
  assert.equal(rallyEngine.switchEndsScore(11), 6);
  assert.equal(rallyEngine.switchEndsScore(15), 8);
  assert.equal(rallyEngine.switchEndsScore(21), 11);
  assert.equal(rallyEngine.switchEndsScore(9), 5);
  assert.equal(rallyEngine.switchEndsScore(1), 1);
});

test("the cue shows on the Rally where the leading Team first reaches the midpoint", () => {
  for (const [target, midpoint] of [[11, 6], [15, 8], [21, 11]]) {
    const match = pointsForA(game(target), midpoint - 1);
    assert.equal(rallyEngine.isSwitchEndsRally(match), false, `no cue at ${midpoint - 1} in a game to ${target}`);

    pointsForA(match, 1);
    assert.equal(rallyEngine.isSwitchEndsRally(match), true, `cue at ${midpoint} in a game to ${target}`);

    pointsForA(match, 1);
    assert.equal(rallyEngine.isSwitchEndsRally(match), false, `cue is gone one Rally later in a game to ${target}`);
  }
});

test("the cue does not repeat when the other Team later reaches the midpoint", () => {
  const match = pointsForA(game(11), 6);
  rallyEngine.recordRally(match, "B"); // Alpha started at 0-0-2, so its first fault is the side-out
  for (let index = 0; index < 6; index += 1) rallyEngine.recordRally(match, "B");

  assert.equal(match.teamB.score, 6);
  assert.equal(rallyEngine.isSwitchEndsRally(match), false);
});

test("undoing back before the midpoint removes the cue", () => {
  const match = pointsForA(game(11), 6);
  assert.equal(rallyEngine.isSwitchEndsRally(match), true);

  rallyEngine.undoRally(match);
  assert.equal(match.teamA.score, 5);
  assert.equal(rallyEngine.isSwitchEndsRally(match), false);
});

test("the live score sync carries the cue, and a finished Match does not", () => {
  const match = pointsForA(game(11), 6);

  const live = buildMatchUpdate(match, "in_progress", { switchEnds: rallyEngine.isSwitchEndsRally(match) });
  assert.equal(live.switchEnds, true);

  rallyEngine.endGameEarly(match, { retiredTeam: "B" });
  assert.equal(buildMatchUpdate(match, "completed").switchEnds, false);
});

test("the Live Board card for that court shows the cue, from this device or from the server", () => {
  const match = pointsForA(game(11), 6);
  const tournament = {
    courts: 2,
    matches: [
      { id: "match_1", round: 1, court: 2, teamA: ["Alice", "Amy"], teamB: ["Bob", "Bill"], status: "in_progress", scoreA: "6", scoreB: "0" },
      { id: "match_2", round: 1, court: 1, teamA: ["Cid", "Dee"], teamB: ["Eli", "Fay"], status: "in_progress", scoreA: "8", scoreB: "3", switchEnds: true },
    ],
  };

  const board = buildLiveBoard(tournament, match, "2026-09-23T10:00:00.000Z");
  const byId = Object.fromEntries(board.liveMatches.map((card) => [card.id, card]));

  assert.equal(byId.match_1.switchEnds, true, "the Match scored on this device");
  assert.equal(byId.match_2.switchEnds, true, "a Match scored on another device");
});

test("the Live Board card renders the cue, and the live score sync sends it", () => {
  assert.match(appCode, /liveMatch\.switchEnds \? '<span class="status-pill scheduled">Switch ends<\/span>'/);
  assert.match(appCode, /switchEnds: isSwitchEndsRally\(game\)/);
});

test("correcting the serve on the midpoint Rally keeps the cue", () => {
  const match = pointsForA(game(11), 6);
  rallyEngine.correctServe(match, { serverNumber: 1 });
  assert.equal(rallyEngine.isSwitchEndsRally(match), true);
});
