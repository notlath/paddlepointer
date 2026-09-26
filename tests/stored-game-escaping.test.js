const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Games shown in History and the Match summary come from the server, which stored whatever a scorer's
// browser sent before save_game started normalising it. Every field those views print must be escaped.
const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const between = (start, end) => appCode.slice(appCode.indexOf(start), appCode.indexOf(end));
const views = {
  "Match summary": between("function renderSummary", "function renderHistory("),
  "History item": between("function renderHistoryItem", "function renderLeaderboard"),
};

for (const [name, source] of Object.entries(views)) {
  test(`${name} escapes the stored Game's type, scores and side-outs`, () => {
    for (const raw of [/\$\{capitalize\(game\.type\)\}/, /\$\{game\.team[AB]\.score\}/, /\$\{team\.score\}/, /\$\{game\.sideOuts\}/]) {
      assert.doesNotMatch(source, raw, `${name} prints ${raw} unescaped`);
    }
  });
}
