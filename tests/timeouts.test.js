const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rallyEngine = require("../rally-engine.js");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8").replace(/\r\n/g, "\n");

function game(targetScore = 11) {
  return rallyEngine.createGame({
    type: "doubles",
    teamA: { name: "Alpha", players: ["Alice", "Amy"] },
    teamB: { name: "Bravo", players: ["Bob", "Bill"] },
    targetScore,
  });
}

// What a timeout must leave alone.
const serveState = (match) => JSON.stringify({
  score: [match.teamA.score, match.teamB.score],
  servingTeam: match.servingTeam,
  serverNumber: match.serverNumber,
  server: match.currentServerIndex,
  positions: [match.teamA.positions, match.teamB.positions],
  status: match.status,
});

test("each Team gets 2 timeouts in a game to 11 or 15, and 3 in a game to 21", () => {
  for (const [target, allowed] of [[11, 2], [15, 2], [21, 3]]) {
    const match = game(target);
    assert.equal(rallyEngine.timeoutsLeft(match, "A"), allowed, `Team A in a game to ${target}`);
    assert.equal(rallyEngine.timeoutsLeft(match, "B"), allowed, `Team B in a game to ${target}`);
  }
});

test("a timeout changes nothing but the Team's timeouts, and is logged", () => {
  const match = game(11);
  rallyEngine.recordRally(match, "A");
  const before = serveState(match);

  const result = rallyEngine.recordTimeout(match, "B");

  assert.equal(result.event.action, "timeout");
  assert.equal(result.event.team, "B");
  assert.equal(serveState(match), before);
  assert.equal(rallyEngine.timeoutsLeft(match, "B"), 1);
  assert.equal(rallyEngine.timeoutsLeft(match, "A"), 2);
  assert.match(rallyEngine.actionText(result.event, match), /Bravo.*timeout/i);
});

test("a Team with no timeouts left cannot take another", () => {
  const match = game(11);
  rallyEngine.recordTimeout(match, "A");
  rallyEngine.recordTimeout(match, "A");
  const eventsBefore = match.events.length;

  assert.equal(rallyEngine.recordTimeout(match, "A"), null);
  assert.equal(match.events.length, eventsBefore);
  assert.equal(rallyEngine.timeoutsLeft(match, "A"), 0);
  assert.equal(rallyEngine.timeoutsLeft(match, "B"), 2, "the other Team keeps its own");
});

test("undo gives a timeout back, and a refresh keeps the counts", () => {
  const match = game(21);
  rallyEngine.recordTimeout(match, "A");
  rallyEngine.recordRally(match, "A");
  rallyEngine.recordTimeout(match, "B");

  rallyEngine.undoRally(match);
  assert.equal(rallyEngine.timeoutsLeft(match, "B"), 3);
  assert.equal(rallyEngine.timeoutsLeft(match, "A"), 2);

  rallyEngine.recordRally(match, "A");
  const refreshed = JSON.parse(JSON.stringify(match));
  rallyEngine.undoRally(refreshed); // replays the Rally log from the start
  assert.equal(rallyEngine.timeoutsLeft(refreshed, "A"), 2);
  assert.equal(refreshed.teamA.score, 1);
});

test("the saved Match says how many timeouts each Team used", () => {
  const match = game(11);
  rallyEngine.recordTimeout(match, "A");
  rallyEngine.recordTimeout(match, "B");
  rallyEngine.recordTimeout(match, "B");

  const saved = JSON.parse(JSON.stringify(match));
  assert.deepEqual(saved.timeoutsUsed, { A: 1, B: 2 });

  rallyEngine.resetGame(match);
  assert.deepEqual(match.timeoutsUsed, { A: 0, B: 0 });
});

test("a timeout is not a Rally: it keeps the switch-ends cue", () => {
  const match = game(11);
  for (let index = 0; index < 6; index += 1) rallyEngine.recordRally(match, "A");
  rallyEngine.recordTimeout(match, "B");

  assert.equal(rallyEngine.isSwitchEndsRally(match), true);
  assert.equal(match.events.filter(rallyEngine.isRally).length, 6);
});

test("recording a timeout is a Match control, so Players cannot do it", () => {
  assert.match(appCode, /MATCH_CONTROL_ACTIONS = new Set\(\[[^\]]*"timeout"/);
});
