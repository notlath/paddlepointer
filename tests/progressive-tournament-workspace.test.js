const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const tournamentView = appCode.slice(
  appCode.indexOf("function renderTournament()"),
  appCode.indexOf("function renderRules()")
);

test("Tournament presents a progressive operations workspace", () => {
  assert.equal((tournamentView.match(/type="submit"/g) || []).length, 1, "only the configuration section offers the primary schedule action");
  assert.doesNotMatch(tournamentView, /disabledAttr/, "Admins are not shown disabled configuration fields");
  assert.match(tournamentView, /<details class="format-estimate"/, "format calculations can be expanded on demand");
  assert.match(tournamentView, /<details class="round-group/, "completed and future rounds can be collapsed");
});
