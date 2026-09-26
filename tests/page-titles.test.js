const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const historyView = appCode.slice(appCode.indexOf("function renderHistory()"), appCode.indexOf("function historyDays("));
const leaderboardView = appCode.slice(appCode.indexOf("function renderLeaderboard()"), appCode.indexOf("function renderLeaderboardLeaders("));

test("History and Leaderboard titles match navigation", () => {
  assert.match(historyView, /<h1>\$\{isVisitor\(\) \|\| isStaff\(\) \? "Match History" : "My Matches"\}<\/h1>/);
  assert.doesNotMatch(historyView, /"(?:Shared Matches|Saved Matches|Visitor Matches)"/);
  assert.match(leaderboardView, /<h1>\$\{isVisitorBoard \|\| isStaff\(\) \? "Leaderboard" : "My match stats"\}<\/h1>/);
  assert.doesNotMatch(leaderboardView, /<h1>[^<]*Standings/);
  assert.doesNotMatch(appCode, /class="eyebrow">Doubles Mixer</);
});

test("all page refresh buttons use the same labels", () => {
  const buttons = appCode.match(/<button[^\n]*data-action="refresh-(?:users|tournament|history|leaderboard)"[^\n]*<\/button>/g) || [];
  assert.equal(buttons.length, 7);
  for (const button of buttons) assert.match(button, /\? "Refreshing…" : "Refresh"/);
});

test("Dashboard analytics is a secondary action", () => {
  assert.match(appCode, /<button class="button ghost" data-action="view" data-value="analytics">Open Full Analytics<\/button>/);
  assert.doesNotMatch(appCode, /<button class="button primary" data-action="view" data-value="analytics">Open Full Analytics<\/button>/);
});
