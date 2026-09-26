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

const startedGame = () => {
  const game = rallyEngine.createGame({
    type: "doubles",
    teamA: { name: "Alpha", players: ["Alice", "Amy"] },
    teamB: { name: "Bravo", players: ["Bob", "Bill"] },
  });
  rallyEngine.recordRally(game, "A"); // 1-0-2, Alice serving from the left
  return game;
};

test("a correction moves the serve to the Player and side the court agrees on", () => {
  const game = startedGame();

  const result = rallyEngine.correctServe(game, { servingTeam: "B", serverIndex: 1, serverNumber: 1, rightB: 1 });

  assert.equal(result.event.action, "correction");
  assert.equal(game.servingTeam, "B");
  assert.equal(game.serverNumber, 1);
  assert.equal(rallyEngine.currentServerName(game), "Bill");
  assert.equal(rallyEngine.servePosition(game).side, "right");
  assert.equal(rallyEngine.scoreCall(game), "0 - 1 - 1");
});

test("later Rallies serve and swap from the corrected positions", () => {
  const game = startedGame();
  rallyEngine.correctServe(game, { servingTeam: "B", serverIndex: 1, serverNumber: 1, rightB: 1 });

  rallyEngine.recordRally(game, "B");
  assert.equal(rallyEngine.currentServerName(game), "Bill");
  assert.equal(rallyEngine.servePosition(game).side, "left");

  rallyEngine.recordRally(game, "A"); // first fault: partner serves where they stand
  assert.equal(game.serverNumber, 2);
  assert.equal(rallyEngine.currentServerName(game), "Bob");

  // Second fault: side-out to Alpha's right-court Player, which at their score of 1 is Amy.
  rallyEngine.recordRally(game, "A");
  assert.equal(game.servingTeam, "A");
  assert.equal(game.serverNumber, 1);
  assert.equal(rallyEngine.currentServerName(game), "Amy");
  assert.equal(rallyEngine.servePosition(game).side, "right");
});

test("a correction is a Rally-log entry that undo steps back over", () => {
  const game = startedGame();
  rallyEngine.correctServe(game, { servingTeam: "B", serverIndex: 1, serverNumber: 1, rightB: 1 });
  rallyEngine.recordRally(game, "B");

  assert.equal(game.events.length, 3);
  assert.deepEqual(game.events.map((event) => event.action), ["point", "correction", "point"]);
  assert.match(rallyEngine.actionText(game.events[1], game), /corrected/i);

  rallyEngine.undoRally(game); // undo the point played after the correction
  assert.equal(game.servingTeam, "B");
  assert.equal(rallyEngine.currentServerName(game), "Bill");
  assert.equal(rallyEngine.servePosition(game).side, "right");

  rallyEngine.undoRally(game); // undo the correction itself
  assert.equal(game.events.length, 1);
  assert.equal(game.servingTeam, "A");
  assert.equal(rallyEngine.currentServerName(game), "Alice");
  assert.equal(rallyEngine.servePosition(game).side, "left");
});

test("a correction survives a refresh, because the Rally log replays it", () => {
  const game = startedGame();
  rallyEngine.correctServe(game, { servingTeam: "B", serverIndex: 1, serverNumber: 1, rightB: 1 });
  rallyEngine.recordRally(game, "B");
  rallyEngine.recordRally(game, "B");

  const refreshed = JSON.parse(JSON.stringify(game));
  rallyEngine.undoRally(refreshed);

  assert.equal(refreshed.teamB.score, 1);
  assert.equal(refreshed.servingTeam, "B");
  assert.equal(rallyEngine.currentServerName(refreshed), "Bill");
  assert.equal(rallyEngine.servePosition(refreshed).side, "left");
});

test("the correction dialog offers every Player, the server number and each Team's right court", () => {
  const correctServeChoiceFields = new Function(
    "rallyEngine",
    `const escapeHtml = (value) => String(value);
     ${source("correctServeChoiceFields")}
     return correctServeChoiceFields;`,
  )(rallyEngine);

  const game = startedGame();
  const fields = correctServeChoiceFields(game);

  assert.deepEqual(fields.map((field) => field.key), ["server", "serverNumber", "rightA", "rightB"]);
  assert.deepEqual(fields[0].options, [["A0", "Alice"], ["A1", "Amy"], ["B0", "Bob"], ["B1", "Bill"]]);
  assert.deepEqual(fields[1].options, [["1", "First server"], ["2", "Second server"]]);
  assert.deepEqual(fields[2].options, [["0", "Alice"], ["1", "Amy"]]);
  assert.deepEqual(fields[3].options, [["0", "Bob"], ["1", "Bill"]]);
  // The dialog opens on the Match's current state: Alice serving as the second server, from the left.
  assert.deepEqual(fields.map((field) => field.value), ["A0", "2", "1", "0"]);
});

test("correcting the serve is a Match control, so Players cannot do it", () => {
  assert.match(appCode, /MATCH_CONTROL_ACTIONS = new Set\(\[[^\]]*"correct-serve"/);
  assert.match(appCode, /data-action="correct-serve"/);
});
