const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rallyEngine = require("../rally-engine.js");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8").replace(/\r\n/g, "\n");

function source(name) {
  const found = appCode.match(new RegExp(`\\n  (?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}`));
  assert.ok(found, `app.js must define ${name}`);
  return found[0];
}

const tossGame = () => rallyEngine.createGame({
  type: "doubles",
  teamA: { name: "Alpha", players: ["Alice", "Amy"], startingRight: 1 },
  teamB: { name: "Bravo", players: ["Bob", "Bill"], startingRight: 1 },
  firstServer: "B",
});

test("the toss winner's choice sets who serves first and who starts on the right", () => {
  const game = tossGame();

  assert.equal(game.servingTeam, "B");
  assert.deepEqual(game.teamA.positions, { right: 1, left: 0 });
  assert.deepEqual(game.teamB.positions, { right: 1, left: 0 });
  assert.equal(rallyEngine.currentServerName(game), "Bill");
  assert.equal(rallyEngine.scoreCall(game), "0 - 0 - 2");
  assert.equal(rallyEngine.servePosition(game).side, "right");
});

test("a chosen starting side keeps serving correct through points and a side-out", () => {
  const game = tossGame();

  rallyEngine.recordRally(game, "B");
  assert.equal(rallyEngine.scoreCall(game), "1 - 0 - 2");
  assert.equal(rallyEngine.currentServerName(game), "Bill");
  assert.equal(rallyEngine.servePosition(game).side, "left");

  rallyEngine.recordRally(game, "A");
  assert.equal(game.servingTeam, "A");
  assert.equal(game.serverNumber, 1);
  assert.equal(rallyEngine.currentServerName(game), "Amy");
  assert.equal(rallyEngine.servePosition(game).side, "right");
});

test("undo and reset return to the chosen starting setup, not to Player 1 on the right", () => {
  const game = tossGame();
  rallyEngine.recordRally(game, "B");
  rallyEngine.recordRally(game, "B");
  rallyEngine.recordRally(game, "A");

  rallyEngine.undoRally(game);
  rallyEngine.undoRally(game);
  rallyEngine.undoRally(game);
  assert.deepEqual(game.teamB.positions, { right: 1, left: 0 });
  assert.equal(rallyEngine.currentServerName(game), "Bill");

  rallyEngine.recordRally(game, "B");
  rallyEngine.resetGame(game);
  assert.deepEqual(game.teamA.positions, { right: 1, left: 0 });
  assert.deepEqual(game.teamB.positions, { right: 1, left: 0 });
  assert.equal(game.servingTeam, "B");
  assert.equal(rallyEngine.currentServerName(game), "Bill");
});

test("a Tournament Match is built from the scorer's toss choice, and defaults to today's setup", () => {
  const tournamentGameFor = new Function(
    "rallyEngine",
    `const cleanName = (value, fallback) => String(value || "").trim() || fallback;
     const clampNumber = (value, min, max) => Math.min(max, Math.max(min, Number(value) || min));
     const session = { user: () => ({ displayName: "Admin" }) };
     const currentUserSummary = () => ({ displayName: "Admin", role: "admin" });
     ${source("tournamentGameFor")}
     return tournamentGameFor;`,
  )(rallyEngine);

  const tournament = { id: "event_1", name: "Friday Open Play", targetScore: 11, winByTwo: true };
  const match = { id: "match_1", round: 1, court: 2, teamA: ["Alice", "Amy"], teamB: ["Bob", "Bill"] };

  const chosen = tournamentGameFor(tournament, match, { firstServer: "B", startingRight: { A: 1, B: 0 } });
  assert.equal(chosen.servingTeam, "B");
  assert.equal(chosen.firstServer, "B");
  assert.deepEqual(chosen.teamA.positions, { right: 1, left: 0 });
  assert.deepEqual(chosen.teamB.positions, { right: 0, left: 1 });
  assert.equal(rallyEngine.currentServerName(chosen), "Bob");

  const fallback = tournamentGameFor(tournament, match);
  assert.equal(fallback.servingTeam, "A");
  assert.deepEqual(fallback.teamA.positions, { right: 0, left: 1 });
  assert.equal(rallyEngine.currentServerName(fallback), "Alice");
});

test("Match Setup keeps a chosen right-court Player for each Team", () => {
  const normalizeSetup = new Function(
    `const defaultSetup = { type: "doubles", scorerName: "Court 1", teamAPlayer1: "", teamAPlayer2: "", teamBPlayer1: "", teamBPlayer2: "", firstServer: "A", targetScore: 11, winByTwo: true, teamARight: 0, teamBRight: 0 };
     const cleanName = (value, fallback) => String(value || "").trim() || fallback;
     ${source("normalizeSetup")}
     return normalizeSetup;`,
  )();

  assert.equal(normalizeSetup({ teamARight: "1", teamBRight: 1 }).teamARight, 1);
  assert.equal(normalizeSetup({ teamARight: "1", teamBRight: 1 }).teamBRight, 1);
  assert.equal(normalizeSetup({ teamARight: "2" }).teamARight, 0);
  assert.equal(normalizeSetup({}).teamBRight, 0);
});

test("the start dialog offers the serving Team and each Team's right-court Player", () => {
  const renderStartMatchFields = new Function(
    `const escapeHtml = (value) => String(value);
     const escapeAttr = (value) => String(value);
     ${source("startMatchChoiceFields")}
     return startMatchChoiceFields;`,
  )();

  const fields = renderStartMatchFields({ teamA: ["Alice", "Amy"], teamB: ["Bob", "Bill"] });

  assert.deepEqual(fields.map((field) => field.key), ["firstServer", "rightA", "rightB"]);
  assert.deepEqual(fields[0].options, [["A", "Alice / Amy"], ["B", "Bob / Bill"]]);
  assert.deepEqual(fields[1].options, [["0", "Alice"], ["1", "Amy"]]);
  assert.deepEqual(fields[2].options, [["0", "Bob"], ["1", "Bill"]]);
  assert.deepEqual(fields.map((field) => field.value), ["A", "0", "0"]);
});
