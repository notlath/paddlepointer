const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");

test("Criterion 1: Leaderboard rank, wins, win rate, and point differential columns use tabular numbers and align consistently", () => {
  // Tabular numbers applied to table cells and rank badge
  assert.match(
    styles,
    /\.leaderboard-table\s+th,\s*\n?\.leaderboard-table\s+td\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/s,
    "leaderboard table headers and data cells must declare font-variant-numeric: tabular-nums"
  );
  assert.match(
    styles,
    /\.rank-badge\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/s,
    "rank-badge must declare font-variant-numeric: tabular-nums"
  );

  // Column alignments and minimum widths
  assert.match(
    styles,
    /\.leaderboard-table\s+th:first-child,\s*\n?\.leaderboard-table\s+td:first-child,\s*\n?\.leaderboard-rank\s*\{[^}]*min-width:\s*56px;[^}]*text-align:\s*center;/s,
    "rank column must have min-width: 56px and text-align: center"
  );
  assert.match(
    styles,
    /\.leaderboard-table\s+th:nth-child\(2\),\s*\n?\.leaderboard-table\s+td:nth-child\(2\)\s*\{[^}]*min-width:\s*220px;[^}]*text-align:\s*left;/s,
    "identity column must have min-width: 220px and text-align: left"
  );
  assert.match(
    styles,
    /\.leaderboard-table\s+th:nth-child\(n\s*\+\s*3\),\s*\n?\.leaderboard-table\s+td:nth-child\(n\s*\+\s*3\)\s*\{[^}]*min-width:\s*72px;[^}]*text-align:\s*right;/s,
    "stat columns (W, L, Win %, Diff, Minutes) must have min-width: 72px and text-align: right"
  );
});

test("Criterion 2: Round numbers, court numbers, Tournament progress counts, timers, and freshness times use tabular numbers", () => {
  // Round numbers and round summary
  assert.match(
    styles,
    /\.round-head\s+h3\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/s,
    ".round-head h3 must use tabular numbers"
  );
  assert.match(
    styles,
    /\.round-head\s+span\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/s,
    ".round-head span must use tabular numbers"
  );
  assert.match(
    styles,
    /\.round-group\s*>\s*summary\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/s,
    ".round-group > summary must use tabular numbers"
  );

  // Court & match head
  assert.match(
    styles,
    /\.match-card-head\s+span\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/s,
    ".match-card-head span must use tabular numbers"
  );

  // Tournament progress counts ("3/12 Done", "4 Live", status pills)
  assert.match(
    styles,
    /\.status-pill,\s*\n?\.match-card-head\s+strong[^{]*\{[^}]*font-variant-numeric:\s*tabular-nums;/s,
    ".status-pill must use tabular numbers for progress counts"
  );
  assert.match(
    styles,
    /\.match-result-pill\s+strong\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/s,
    ".match-result-pill strong must use tabular numbers"
  );

  // Freshness times and timers
  assert.match(
    styles,
    /\.data-freshness-cue\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/s,
    ".data-freshness-cue must use tabular numbers"
  );
  assert.match(
    styles,
    /\.live-score-meta\s+span\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/s,
    ".live-score-meta span must use tabular numbers for timers and score call"
  );
  assert.match(
    styles,
    /\.live-score-card-head\s+strong\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/s,
    ".live-score-card-head strong must use tabular numbers"
  );
  assert.match(
    styles,
    /\.meta-list\s+strong\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/s,
    ".meta-list strong must use tabular numbers"
  );
  assert.match(
    styles,
    /\.history-meta\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/s,
    ".history-meta must use tabular numbers for durations and timestamps"
  );
  assert.match(
    styles,
    /\.recovery-match-card\s+span\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/s,
    ".recovery-match-card span must use tabular numbers"
  );
});

test("Criterion 3: Page headings, dialog titles, and short intro paragraphs use balanced wrapping; long body copy keeps normal wrapping", () => {
  // Page headings
  assert.match(
    styles,
    /\.hero-copy\s+h1,\s*\n?\.page-title\s+h1\s*\{[^}]*text-wrap:\s*balance;/s,
    "page headings (.hero-copy h1, .page-title h1) must declare text-wrap: balance"
  );
  assert.match(
    styles,
    /\.auth-card\s+h1,\s*\n?\.dark-auth-shell\s+\.auth-card\s+h1\s*\{[^}]*text-wrap:\s*balance;/s,
    "auth card headings must declare text-wrap: balance"
  );

  // Dialog titles
  assert.match(
    styles,
    /\.destructive-confirmation-dialog\s+h2[^{]*\{[^}]*text-wrap:\s*balance;/s,
    "dialog titles must declare text-wrap: balance"
  );

  // Short intro paragraphs
  assert.match(
    styles,
    /\.hero-copy\s+p,\s*\n?\.page-title\s+p\s*\{[^}]*text-wrap:\s*balance;/s,
    "hero/page title intro paragraphs must declare text-wrap: balance"
  );
  assert.match(
    styles,
    /\.auth-card\s+p,\s*\n?\.dark-auth-shell\s+\.auth-card\s+p\s*\{[^}]*text-wrap:\s*balance;/s,
    "auth card intro paragraphs must declare text-wrap: balance"
  );
  assert.match(
    styles,
    /\.lead-status-body\s+p\s*\{[^}]*text-wrap:\s*balance;/s,
    "lead card status paragraphs must declare text-wrap: balance"
  );
  assert.match(
    styles,
    /\.destructive-confirmation-dialog\s+p[^{]*\{[^}]*text-wrap:\s*balance;/s,
    "destructive dialog description paragraphs must declare text-wrap: balance"
  );

  // Body copy is not globally forced to balance
  assert.doesNotMatch(
    styles,
    /(?:^|\})\s*body\s*\{[^}]*text-wrap:\s*balance/m,
    "body must not force text-wrap: balance globally"
  );
  assert.doesNotMatch(
    styles,
    /(?:^|\})\s*p\s*\{[^}]*text-wrap:\s*balance/m,
    "general paragraph selector p must not force text-wrap: balance globally"
  );
});

test("Criterion 4: All interface icons use one stroke weight (stroke-width: 2) and inherit the current text color", () => {
  // CSS side nav icon
  assert.match(
    styles,
    /\.side-nav-icon\s+svg\s*\{[^}]*stroke:\s*currentColor;[^}]*stroke-width:\s*2;/s,
    "side-nav-icon svg must have stroke: currentColor and stroke-width: 2"
  );

  // No rogue stroke widths in styles.css
  assert.doesNotMatch(
    styles,
    /stroke-width:\s*(?:1\.8|1\.9|2\.2)/,
    "styles.css must not define stroke-width 1.8, 1.9, or 2.2"
  );

  // No rogue stroke-width in app.js SVGs
  assert.doesNotMatch(
    appCode,
    /stroke-width="(?:1\.8|1\.9|2\.2)"/,
    "app.js must not contain stroke-width=\"1.8\", 1.9, or 2.2"
  );

  // Navigation icons in app.js use currentColor and stroke-width 2
  assert.match(appCode, /navIconSvg/, "navIconSvg exists");
  assert.match(appCode, /trophyIconSvg/, "trophyIconSvg exists");

  // Verify specific icons that previously had 1.8 now have 2
  assert.match(
    appCode,
    /live:\s*'<svg[^>]*>.*?stroke-width="2".*?<\/svg>'/,
    "live icon must use stroke-width=2"
  );
  assert.match(
    appCode,
    /history:\s*'<svg[^>]*>.*?stroke-width="2".*?stroke-width="2".*?<\/svg>'/,
    "history icon paths must all use stroke-width=2"
  );
  assert.match(
    appCode,
    /trophyIconSvg[\s\S]*?stroke-width="2"[\s\S]*?stroke-width="2"/,
    "trophyIconSvg paths must all use stroke-width=2"
  );
});

test("Criterion 5: TV-mode Live Board uses dynamic viewport height (100dvh)", () => {
  assert.match(
    styles,
    /body\.live-tv-mode\s*\{[^}]*height:\s*100dvh;/s,
    "body.live-tv-mode must declare height: 100dvh"
  );
  assert.match(
    styles,
    /\.live-tv-mode\s+\.app-shell\s*\{[^}]*height:\s*100dvh;/s,
    ".live-tv-mode .app-shell must declare height: 100dvh"
  );
});

test("Criterion 6: No column widths or row heights shift when numbers update", () => {
  // Desktop table preserves 720px minimum and tabular numbers
  assert.match(styles, /\.leaderboard-table \{\s*width: 100%;\s*min-width: 720px;/);
  assert.match(styles, /\.leaderboard-table\s+th,\s*\n?\.leaderboard-table\s+td\s*\{[^}]*white-space:\s*nowrap;/);

  // Column width constraints prevent jump on numeric digits
  assert.match(styles, /\.leaderboard-table\s+th:first-child[^{]*\{[^}]*min-width:\s*56px;/);
  assert.match(styles, /\.leaderboard-table\s+th:nth-child\(2\)[^{]*\{[^}]*min-width:\s*220px;/);
  assert.match(styles, /\.leaderboard-table\s+th:nth-child\(n\s*\+\s*3\)[^{]*\{[^}]*min-width:\s*72px;/);
  assert.match(styles, /\.status-pill[^{]*\{[^}]*min-width:\s*68px;/);
});
