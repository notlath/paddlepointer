const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");

test("body.scoreboard-mode does not lock viewport with overflow: hidden or fixed 100dvh", () => {
  assert.doesNotMatch(
    css,
    /body\.scoreboard-mode\s*\{[^}]*overflow:\s*hidden/s,
    "body.scoreboard-mode should not have overflow: hidden"
  );
  assert.doesNotMatch(
    css,
    /body\.scoreboard-mode\s*\{[^}]*(?:^|[\s;])height:\s*100dvh/s,
    "body.scoreboard-mode should not be locked to fixed height: 100dvh"
  );
  assert.doesNotMatch(
    css,
    /body\.scoreboard-mode\s+\.page\s*\{[^}]*overflow:\s*hidden/s,
    "body.scoreboard-mode .page should not have overflow: hidden"
  );
});

test("mobile scoreboard maintains side-by-side team tiles with natural row sizing", () => {
  const mobileMatch = css.match(/body\.scoreboard-mode\s+\.scoreboard\s*\{([^}]+)\}/s);
  assert.ok(mobileMatch, "body.scoreboard-mode .scoreboard rules must exist");
  const rules = mobileMatch[1];

  assert.match(rules, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(rules, /grid-template-areas:/);
  assert.doesNotMatch(rules, /grid-template-rows:\s*minmax\(128px,\s*0\.58fr\)/, "Should not use rigid fractional viewport rows");
});

test("landscape layout maintains side-by-side team tiles and un-reversed court board", () => {
  const landscapeMatch = css.match(/@media\s*\(max-width:\s*980px\)\s*and\s*\(orientation:\s*landscape\)\s*\{([^}]+(?:\{[^}]+\}[^}]+)*)\}/s);
  assert.ok(landscapeMatch, "landscape media query for scoreboard-mode must exist");
  const landscapeContent = landscapeMatch[1];

  assert.match(landscapeContent, /body\.scoreboard-mode\s+\.scoreboard/);
  assert.match(landscapeContent, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(280px,\s*1\.1fr\)\s*minmax\(0,\s*1fr\)/);
});

test("rally actions have at least 44px touch targets with adequate font size", () => {
  const rallyBtnRules = css.match(/body\.scoreboard-mode\s+\.rally-btn\s*\{([^}]+)\}/s);
  assert.ok(rallyBtnRules, "body.scoreboard-mode .rally-btn rules must exist");
  const rules = rallyBtnRules[1];

  const minHeightMatch = rules.match(/min-height:\s*(\d+)px/);
  assert.ok(minHeightMatch, "rally-btn must have min-height");
  const minHeight = parseInt(minHeightMatch[1], 10);
  assert.ok(minHeight >= 44, `rally-btn min-height must be at least 44px, got ${minHeight}px`);

  // Font size should meet visual baseline (at least 0.875rem / 14px)
  assert.match(rules, /font-size:\s*clamp\(0\.875rem/);
});

test("score control buttons have at least 44px touch targets and visual separation", () => {
  const controlsMatch = css.match(/body\.scoreboard-mode\s+\.score-controls\s*\{([^}]+)\}/s);
  assert.ok(controlsMatch, "body.scoreboard-mode .score-controls rules must exist");
  const controlsRules = controlsMatch[1];

  // Visual separation from court metadata
  assert.match(controlsRules, /border-top|margin-top|padding-top/, "score-controls must have visual separation");

  const buttonRulesMatch = css.match(/body\.scoreboard-mode\s+\.score-controls\s+\.button\s*\{([^}]+)\}/s);
  assert.ok(buttonRulesMatch, "body.scoreboard-mode .score-controls .button rules must exist");
  const buttonRules = buttonRulesMatch[1];

  const minHeightMatch = buttonRules.match(/min-height:\s*(\d+)px/);
  assert.ok(minHeightMatch, "score-controls .button must have min-height");
  const minHeight = parseInt(minHeightMatch[1], 10);
  assert.ok(minHeight >= 44, `score-controls .button min-height must be at least 44px, got ${minHeight}px`);
});

test("court board text meets accessible visual baseline (at least 14px / 0.875rem)", () => {
  // serve-from-card small must not be hidden
  assert.doesNotMatch(
    css,
    /body\.scoreboard-mode\s+\.serve-from-card\s+small\s*\{[^}]*display:\s*none/s,
    "serve-from-card small must not be display: none"
  );

  // board-meta-row must not be hidden
  assert.doesNotMatch(
    css,
    /body\.scoreboard-mode\s+\.board-meta-row\s*\{[^}]*display:\s*none/s,
    "board-meta-row must not be display: none"
  );
  assert.doesNotMatch(
    css,
    /body\.scoreboard-mode\s+\.board-meta-row:nth-child\(5\)\s*\{[^}]*display:\s*none/s,
    "board-meta-row:nth-child(5) must not be display: none at small viewports"
  );

  // font size on serve-badge, court-service-zone small, and board-meta-row span must be >= 14px
  // 0.875rem is --font-size-sm (asserted in semantic-ui-tokens.test.js).
  const fourteenPx = "(?:0\\.875rem|var\\(--font-size-sm\\))";
  assert.match(css, new RegExp(`body\\.scoreboard-mode\\s+\\.serve-badge\\s*\\{[^}]*font-size:\\s*${fourteenPx}`, "s"));
  assert.match(css, new RegExp(`body\\.scoreboard-mode\\s+\\.court-service-zone\\.active\\s+small\\s*\\{[^}]*font-size:\\s*${fourteenPx}`, "s"));
  assert.match(css, new RegExp(`body\\.scoreboard-mode\\s+\\.board-meta-row\\s+span\\s*\\{[^}]*font-size:\\s*${fourteenPx}`, "s"));
});

test("styles.css defines serving-player and serving-tag styles", () => {
  assert.match(css, /\.serving-player/, "serving-player class should be styled");
  assert.match(css, /\.serving-tag/, "serving-tag class should be styled");
});

test("long player and team names use overflow-wrap anywhere", () => {
  const teamHeadMatch = css.match(/body\.scoreboard-mode\s+\.team-head\s+h2\s*\{([^}]+)\}/s);
  assert.ok(teamHeadMatch, "team-head h2 rules must exist");
  assert.match(teamHeadMatch[1], /overflow-wrap:\s*anywhere/);

  const playerLineMatch = css.match(/body\.scoreboard-mode\s+\.player-line\s*\{([^}]+)\}/s);
  assert.ok(playerLineMatch, "player-line rules must exist");
  assert.match(playerLineMatch[1], /overflow-wrap:\s*anywhere/);
});

test("app.js maintains all live scoring and destructive actions", () => {
  assert.match(appCode, /data-action="rally"/, "Must maintain rally data-action");
  assert.match(appCode, /data-action="undo"/, "Must maintain undo data-action");
  assert.match(appCode, /data-action="end-early"/, "Must maintain end-early data-action");
  assert.match(appCode, /data-action="reset-active"/, "Must maintain reset-active data-action");
});
