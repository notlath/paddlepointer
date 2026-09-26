const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const tournamentView = appCode.slice(
  appCode.indexOf("function renderTournament()"),
  appCode.indexOf("function renderRules()")
);

test("Start a new Event is a state-backed disclosure after Tournament setup", () => {
  const details = tournamentView.indexOf('<details class="start-event-details" data-start-event-details');
  const form = tournamentView.indexOf('data-start-event-form novalidate');
  const playerCreator = tournamentView.indexOf("${renderTournamentPlayerCreator()}");
  assert.ok(playerCreator >= 0 && details > playerCreator);
  assert.ok(form > details && form < tournamentView.indexOf("</details>", details));
  assert.match(tournamentView, /data-start-event-details\$\{state\.startEventForm\.open \|\| state\.startEventForm\.failure \|\| state\.startEventForm\.pending/);
  assert.match(appCode, /const defaultStartEventForm = \{[^}]*open: false,/);
  assert.match(appCode, /app\.addEventListener\("toggle",[\s\S]*?state\.startEventForm = \{ \.\.\.state\.startEventForm, open: event\.target\.open \};[\s\S]*?\}, true\);/);
  assert.match(tournamentView, /<span class="label">Courts for the new Event<\/span>/);
  assert.equal((tournamentView.match(/<span class="label">Courts to use<\/span>/g) || []).length, 1);
});
