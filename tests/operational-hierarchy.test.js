const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8").replace(/\r\n/g, "\n");
const rawCss = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8").replace(/\r\n/g, "\n");
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));

const between = (start, end) => appCode.slice(appCode.indexOf(start), appCode.indexOf(end, appCode.indexOf(start)));
const dashboardView = between("function renderAdminDashboard()", "function renderPlayerDashboard()");
const tournamentView = between("function renderTournament()", "function renderRules()");

// Top-level rules in source order; declarations of a selector resolve to the last one that sets them.
const topLevel = (() => {
  // Drop rules nested in @media / @supports blocks so base cascade is checked.
  const stripped = css.replace(/@(media|supports)[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  return [...stripped.matchAll(/([^{}]+?)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1].split(",").map((s) => s.trim().replace(/\s+/g, " ")),
    body: m[2],
  }));
})();
function declared(selector, property) {
  let value = null;
  for (const rule of topLevel) {
    if (!rule.selectors.includes(selector)) continue;
    const found = [...rule.body.matchAll(new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+);`, "g"))];
    if (found.length) value = found[found.length - 1][1].trim();
  }
  return value;
}

function loadPrimaryMatchHelper() {
  const source = appCode.match(/function tournamentPrimaryMatchId\(matches, activeMatchId\) \{[\s\S]*?\n  \}/);
  assert.ok(source, "app.js must define tournamentPrimaryMatchId(matches, activeMatchId)");
  return new Function(`${source[0]}\nreturn tournamentPrimaryMatchId;`)();
}

const match = (id, round, status) => ({ id, round, court: 1, status });

test("Tournament offers one primary Match action for its current state", () => {
  const primaryMatchId = loadPrimaryMatchHelper();
  const schedule = [match("r1c1", 1, "completed"), match("r1c2", 1, "in_progress"), match("r2c1", 2, "scheduled"), match("r2c2", 2, "scheduled")];

  assert.equal(primaryMatchId(schedule, "r1c2"), "r1c2", "the Match being scored on this device is the one to resume");
  assert.equal(primaryMatchId(schedule, ""), "r2c1", "otherwise the next scheduled Match is the one to start");
  assert.equal(primaryMatchId(schedule, "not-in-schedule"), "r2c1", "an unrelated active Match does not claim the primary action");
  assert.equal(primaryMatchId([match("a", 1, "completed")], ""), "", "a finished Schedule has no primary Match action");
  assert.equal(primaryMatchId([], ""), "", "no Schedule, no primary Match action");
});

test("Tournament keeps the schedule form, player link, and other Match cards secondary once play is scheduled", () => {
  assert.match(tournamentView, /type="submit"/);
  assert.match(tournamentView, /class="button \$\{hasSchedule \? "ghost" : "primary"\}" type="submit"/, "Generate Schedule is primary only before a Schedule exists");
  assert.doesNotMatch(tournamentView, /class="button primary" data-action="copy-player-link"/, "Copy Player Link is not a primary action");
  assert.match(tournamentView, /tournamentPrimaryMatchId\(/, "Match cards ask which single Match holds the primary action");
  assert.doesNotMatch(tournamentView, /class="button primary" data-action="start-tournament-match"/, "Start Match is not primary on every card");
  const playerCreator = between("function renderTournamentPlayerCreator()", "\n  }\n");
  assert.ok(playerCreator.length > 0, "renderTournamentPlayerCreator must exist");
  assert.doesNotMatch(playerCreator, /class="button primary"/, "adding a player inside configuration is a secondary action");
});

test("once a Schedule exists, the active Schedule reads before configuration and review", () => {
  assert.match(tournamentView, /\$\{hasSchedule \? `\$\{scheduleBoard\}\$\{workspace\}` : `\$\{workspace\}\$\{scheduleBoard\}`\}/);
});

test("Dashboard header does not repeat destinations that the lead cards already offer", () => {
  const header = dashboardView.slice(dashboardView.indexOf('<section class="page-title">'), dashboardView.indexOf("</section>"));
  assert.equal((header.match(/class="button primary"/g) || []).length, 0, "the primary action is injected once via primaryAction");
  assert.match(header, /\$\{primaryAction\}/);
  assert.doesNotMatch(header, /data-value="live">Live Board</, "Live Board is reached from the Live Courts card");
  assert.doesNotMatch(header, /data-value="tournament">Tournament</, "Tournament is reached from the Tournament card");
});

test("shadows on operational surfaces follow the elevation scale and mark only elevated or temporary content", () => {
  const operational = /dashboard|lead-status|tournament|round-|match-card|format-|coverage|live-|leaderboard-card|top-player|next-match|\.stat\b|\.panel\b|toast/;
  const offenders = [];
  for (const rule of topLevel) {
    const shadow = (rule.body.match(/box-shadow\s*:\s*([^;]+);/) || [])[1];
    if (!shadow || !rule.selectors.some((s) => operational.test(s))) continue;
    if (shadow.trim() !== "none" && !/^var\(--elevation-[123]\)$/.test(shadow.trim())) offenders.push(`${rule.selectors.join(", ")} { box-shadow: ${shadow.trim()} }`);
  }
  assert.deepEqual(offenders, [], "operational shadows are none or an --elevation token");

  assert.equal(declared(".dashboard-grid > .panel", "box-shadow"), "none", "routine Dashboard lists are flat");
  assert.equal(declared(".lead-status-card", "box-shadow"), "none", "routine status cards are flat");
  assert.match(declared(".lead-status-card.is-live", "box-shadow") || "", /^var\(--elevation-/, "the current Match stays elevated");
  assert.equal(declared(".tournament-summary-card", "box-shadow"), "none", "format review is not a floating card");
  assert.equal(declared(".round-card", "box-shadow"), "none", "collapsed rounds are flat");
  assert.match(declared(".round-group.current-round .round-card", "box-shadow") || "", /^var\(--elevation-/, "the active round is elevated");
  assert.equal(declared(".live-side-panel .leaderboard-card", "box-shadow") ?? declared(".leaderboard-card", "box-shadow"), "none", "rankings and queue are quieter than court cards");
  assert.match(declared(".live-score-card", "box-shadow") || "", /^var\(--elevation-/, "Live court cards stay prominent");
  assert.equal(declared(".match-card.completed", "box-shadow"), "none", "Match state is shown without shadows");
  assert.equal(declared(".match-card.in-progress", "box-shadow"), "none", "Match state is shown without shadows");
});

test("format review groups its metrics with spacing and type, not nested bordered cards", () => {
  for (const selector of [".tournament-summary-card", ".tournament-summary-card .stat", ".tournament-summary-card .format-card", ".tournament-summary-card .format-grid div"]) {
    assert.equal(declared(selector, "border"), "0", `${selector} is not boxed`);
  }
  assert.equal(declared(".live-side-panel .leaderboard-card-head", "background"), "transparent", "side-panel headings do not use a heavy navy band");
});
