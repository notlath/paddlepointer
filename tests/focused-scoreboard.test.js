const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8").replace(/\r\n/g, "\n");

function extract(name) {
  const source = appCode.match(new RegExp(`function ${name}\\(game, key\\) \\{[\\s\\S]*?\\n  \\}|function ${name}\\(game\\) \\{[\\s\\S]*?\\n  \\}`));
  assert.ok(source, `app.js must define ${name}`);
  return source[0];
}

const escapeHtml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Render the real Scoreboard tile and court board with the rally engine's answers stubbed per scenario.
function renderer(scenario) {
  const helpers = {
    escapeHtml,
    escapeAttr: escapeHtml,
    currentServerName: () => scenario.currentServer,
    ensureDoublesTracking: () => {},
    teamName: (game, key) => game[key === "A" ? "teamA" : "teamB"].name,
    otherTeam: (key) => (key === "A" ? "B" : "A"),
    actionText: () => scenario.lastRally,
    isSwitchEndsRally: () => Boolean(scenario.switchEnds),
    timeoutsLeft: (game, key) => (scenario.timeoutsLeft ? scenario.timeoutsLeft[key] : 2),
    servePosition: () => ({ side: scenario.side, label: scenario.side === "right" ? "Right" : "Left" }),
    scoreCall: () => scenario.call,
    canUndo: () => true,
    renderCourtSide: () => "",
  };
  const names = Object.keys(helpers);
  const build = new Function(...names, `${extract("renderTeamTile")}\n${extract("renderCourtBoard")}\nreturn { renderTeamTile, renderCourtBoard };`);
  return build(...names.map((n) => helpers[n]));
}

const count = (html, pattern) => (html.match(pattern) || []).length;
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const doubles = {
  type: "doubles",
  servingTeam: "A",
  serverNumber: 2,
  sideOuts: 3,
  events: [{ type: "point" }],
  teamA: { name: "Team Alpha", players: ["Alice", "Bob"], score: 5 },
  teamB: { name: "Team Beta", players: ["Carla", "Dante"], score: 4 },
};
const singles = {
  type: "singles",
  servingTeam: "B",
  serverNumber: 1,
  sideOuts: 0,
  events: [],
  teamA: { name: "Team Alpha", players: ["Alice"], score: 0 },
  teamB: { name: "Team Beta", players: ["Carla"], score: 0 },
};

test("doubles: the serving Team is marked once and the current server once, on the serving tile", () => {
  const { renderTeamTile } = renderer({ currentServer: "Alice", side: "right", call: "5-4-2", lastRally: "Point Team Alpha" });
  const serving = renderTeamTile(doubles, "A");
  const receiving = renderTeamTile(doubles, "B");

  assert.equal(count(serving, /class="serve-badge"/g), 1, "one serving badge");
  assert.equal(count(text(serving), /Serving/g), 1, "the word Serving appears once on the tile");
  assert.match(serving, /<span class="serving-player">Alice <span class="serving-tag">Server<\/span><\/span> \/ Bob/, "the current server is named once, with a text tag");
  assert.doesNotMatch(receiving, /serve-badge|serving-tag|serving-player/, "the receiving Team carries no serving marks");
  assert.equal(text(receiving).includes("Carla / Dante"), true);
});

test("singles: the badge alone marks the server, with no repeated player tag", () => {
  const { renderTeamTile } = renderer({ currentServer: "Carla", side: "right", call: "0-0", lastRally: "" });
  const serving = renderTeamTile(singles, "B");
  assert.equal(count(serving, /class="serve-badge"/g), 1);
  assert.doesNotMatch(serving, /serving-tag/);
  assert.equal(count(text(serving), /Serving/g), 1);
  assert.doesNotMatch(renderTeamTile(singles, "A"), /serve-badge|serving-tag/);
});

test("doubles court board states serve position once and keeps only details not shown elsewhere", () => {
  const { renderCourtBoard } = renderer({ currentServer: "Alice", side: "right", call: "5-4-2", lastRally: "Point Team Alpha" });
  const board = renderCourtBoard(doubles);
  const words = text(board);

  assert.match(board, /<span class="call">5-4-2<\/span>/, "the score call stays on the board");
  assert.equal(count(words, /Right court/g), 1, "serve position appears once");
  assert.match(board, /class="serve-from-card"[\s\S]*Partners switch only after points/, "doubles keeps the partner rule beside the serve position");
  assert.doesNotMatch(words, /Alice/, "the current server is not repeated on the board");
  for (const removed of ["Serving team", "Current server", "Serve from"]) {
    assert.doesNotMatch(board, new RegExp(`<span>${removed}</span>`), `${removed} is not repeated in the details list`);
  }
  assert.match(board, /<span>Receiving team<\/span><strong>Team Beta<\/strong>/);
  assert.match(board, /<span>Server<\/span><strong>2<\/strong>/);
  assert.match(board, /<span>Last rally<\/span><strong>Point Team Alpha<\/strong>/);
  assert.match(board, /<span>Side-outs<\/span><strong>3<\/strong>/);
  for (const action of ["undo", "end-early", "reset-active"]) assert.match(board, new RegExp(`data-action="${action}"`));
});

test("singles court board drops the doubles-only server number and partner rule", () => {
  const { renderCourtBoard } = renderer({ currentServer: "Carla", side: "right", call: "0-0", lastRally: "" });
  const board = renderCourtBoard(singles);
  assert.equal(count(text(board), /Right court/g), 1);
  assert.doesNotMatch(board, /<span>Server<\/span>/);
  assert.doesNotMatch(board, /Partners switch/);
  assert.match(board, /<span>Receiving team<\/span><strong>Team Alpha<\/strong>/);
  assert.match(board, /<span>Last rally<\/span><strong>Opening serve<\/strong>/, "a Match with no Rallies shows the opening serve");
});

test("the court board says to switch ends on the midpoint Rally, and not otherwise", () => {
  const scenario = { currentServer: "Alice", side: "left", call: "6-4-2", lastRally: "Point Team Alpha" };

  const cued = renderer({ ...scenario, switchEnds: true }).renderCourtBoard(doubles);
  assert.match(cued, /<span class="status-pill scheduled" role="status">Switch ends<\/span>/);

  const quiet = renderer({ ...scenario, switchEnds: false }).renderCourtBoard(doubles);
  assert.doesNotMatch(quiet, /Switch ends/);
});

test("each Team tile shows its timeouts left and a control to call one, off when none are left", () => {
  const scenario = { currentServer: "Alice", side: "right", call: "5-4-2", lastRally: "Point Team Alpha", timeoutsLeft: { A: 1, B: 0 } };
  const { renderTeamTile } = renderer(scenario);

  const alpha = renderTeamTile(doubles, "A");
  assert.match(alpha, /<button class="button ghost timeout-btn" data-action="timeout" data-value="A"\s*>Timeout · 1 left<\/button>/);

  const beta = renderTeamTile(doubles, "B");
  assert.match(beta, /<button class="button ghost timeout-btn" data-action="timeout" data-value="B" disabled>No timeouts left<\/button>/);
});
