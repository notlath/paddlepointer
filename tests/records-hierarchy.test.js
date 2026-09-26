const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8").replace(/\r\n/g, "\n");
const css = fs
  .readFileSync(path.join(__dirname, "../styles.css"), "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));

const between = (start, end) => appCode.slice(appCode.indexOf(start), appCode.indexOf(end, appCode.indexOf(start)));
const historyItem = between("function renderHistoryItem(game)", "function renderLeaderboard()");
const rulesView = between("function renderRules()", "function updateSetup(");
const playerView = between("function renderPlayerDashboard()", "function renderVisitorDashboard()");
const visitorView = between("function renderVisitorDashboard()", "function renderVisitorOtherGame(");

// Base-cascade declarations: rules inside @media blocks are ignored, later rules win.
const topLevel = [...css.replace(/@(media|supports)[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "").matchAll(/([^{}]+?)\{([^{}]*)\}/g)].map((m) => ({
  selectors: m[1].split(",").map((s) => s.trim().replace(/\s+/g, " ")),
  body: m[2],
}));
function declared(selector, property) {
  let value = null;
  for (const rule of topLevel) {
    if (!rule.selectors.includes(selector)) continue;
    const found = [...rule.body.matchAll(new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+);`, "g"))];
    if (found.length) value = found[found.length - 1][1].trim();
  }
  return value;
}
const hasSelector = (pattern) => topLevel.some((rule) => rule.selectors.some((s) => pattern.test(s)));

test("History rows separate identity, outcome, metadata, and View Summary without a surface per value", () => {
  const order = ['class="history-teams"', 'class="history-outcome"', 'class="history-meta"', "history-summary-action"].map((marker) => historyItem.indexOf(marker));
  assert.ok(order.every((index) => index >= 0), "each part of a History row is rendered");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "identity, outcome, metadata, then the action, in reading and keyboard order");

  const meta = historyItem.slice(historyItem.indexOf('class="history-meta"'), historyItem.indexOf("</div>", historyItem.indexOf('class="history-meta"')));
  assert.doesNotMatch(meta, /winner-badge/, "the outcome is not mixed into the metadata line");
  assert.match(historyItem.slice(historyItem.indexOf('class="history-outcome"')), /^class="history-outcome"><span class="winner-badge">/, "the outcome carries the winner");

  assert.equal(declared(".history-list", "gap"), "0", "History reads as one list");
  assert.equal(declared(".history-item", "box-shadow"), "none");
  assert.equal(declared(".history-item", "border"), "0");
  assert.equal(declared(".history-item", "border-bottom"), "1px solid var(--border-subtle)", "rows are separated by a restrained divider");
  assert.match(declared(".history-meta span + span::before", "content") || "", /·/, "metadata values are joined as text, not boxed");
});

test("Leaderboard emphasizes rank, identity, and wins before secondary statistics", () => {
  assert.equal(declared(".leaderboard-card", "box-shadow"), "none", "standings are an ordinary content group");
  assert.equal(declared(".leaderboard-summary .stat", "border"), "0", "summary counts are not boxed tiles");
  assert.equal(declared(".leaderboard-table td:nth-child(3)", "font-weight"), "var(--font-weight-black)", "wins are the primary record");
  assert.equal(declared(".leaderboard-table td:nth-child(n + 4)", "color"), "var(--color-text-muted)", "losses, win rate, differential, and minutes support the record");
  assert.equal(declared(".leaderboard-table tbody th strong", "font-size"), "var(--font-size-md)", "identity stays prominent");
});

test("Rules are grouped by real rule topic instead of repeated generic cards", () => {
  assert.doesNotMatch(rulesView, /rule-card|rules-grid/, "no generic rule cards remain");
  assert.ok((rulesView.match(/class="rules-topic"/g) || []).length >= 3, "rules are grouped into topic sections");
  for (const topic of ["Score calls", "Serving positions", "Winning a Match"]) {
    assert.match(rulesView, new RegExp(`<h2 id="[\\w-]+">${topic}</h2>`), `${topic} is a topic heading`);
  }
  for (const rule of ["Call server score - receiver score - server number.", "No server number is used.", "The receiving side does not switch sides.", "The app detects the winner immediately after a scoring rally."]) {
    assert.ok(rulesView.includes(rule), `rule text is preserved: ${rule}`);
  }
  assert.ok(!hasSelector(/\.rule-card|\.rules-grid/), "styles for the retired rule cards are removed");
  assert.equal(declared(".rules-topic", "border-top"), "1px solid var(--border-subtle)", "topics are separated by a restrained divider");
});

test("Player and Visitor results share one record row pattern and section rhythm", () => {
  for (const [name, view] of [["Player", playerView], ["Visitor", visitorView]]) {
    assert.match(view, /renderCompactGame\)/, `${name} results use the compact record row`);
    assert.match(view, /<section class="dashboard-grid section">/, `${name} results use the shared section grid`);
  }
  assert.equal(declared(".compact-row", "border-bottom"), "1px solid var(--border-subtle)", "record rows are separated by dividers");
  assert.equal(declared(".compact-row", "box-shadow"), null, "record rows are not elevated");
});

test("records views keep elevation exceptional and give empty states the same flat hierarchy", () => {
  assert.equal(declared(".summary-layout > .panel", "box-shadow"), "none", "the score timeline is an ordinary content group");
  assert.match(declared(".result-card", "box-shadow") || "", /^var\(--elevation-/, "the final result remains the exceptional elevated surface");
  assert.equal(declared(".timeline-event", "border"), "0", "timeline events are not boxed");
  assert.match(declared(".timeline-event", "border-bottom"), /1px solid var\(--(?:line|border-subtle)\)/);
  assert.equal(declared(".empty-state", "border"), "0", "empty states are not dashed boxes");
  assert.equal(declared(".empty-state", "border-top"), "1px solid var(--border-subtle)", "empty states use the same divider as populated sections");
  assert.equal(declared(".empty-state", "background"), "transparent");
});
