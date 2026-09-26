const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
const historyItem = appCode.slice(appCode.indexOf("function renderHistoryItem"), appCode.indexOf("function renderLeaderboard"));

test("History items expose an explicit accessible summary action", () => {
  assert.match(historyItem, /<span class="winner-badge">/, "winner is displayed as information, not a hidden control");
  assert.match(historyItem, /class="button ghost history-summary-action"[^>]*data-action="history-summary"[^>]*aria-label="View summary for/, "each item has a named View Summary action");
  assert.ok(historyItem.indexOf('class="history-main"') < historyItem.indexOf("history-summary-action"), "keyboard focus follows the visual reading order");
  assert.match(styles, /\.history-summary-action\s*\{[\s\S]*?min-height:\s*44px/, "View Summary meets the mobile touch-target baseline");
});

test("History identifies the Team that retired or forfeited", () => {
  assert.match(historyItem, /game\.endedEarly && game\.retiredTeam/);
  assert.match(historyItem, /retired or forfeited/);
});
