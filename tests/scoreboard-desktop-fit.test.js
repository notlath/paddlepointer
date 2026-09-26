const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");

function getDesktopScoreboardMediaBlock() {
  const matches = [...css.matchAll(/@media\s*\(\s*min-width:\s*981px\s*\)\s*\{([\s\S]*?\n)\}/g)];
  const scoreboardBlock = matches.find((m) => m[1].includes(".scoreboard"));
  assert.ok(scoreboardBlock, "An @media (min-width: 981px) block containing .scoreboard must exist");
  return scoreboardBlock[1];
}

const desktopBlock = getDesktopScoreboardMediaBlock();

function getRuleBody(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(?:^|[\\s,}])(${escaped})\\s*(?:,[^{]*)*\\{([^}]+)\\}`, "m");
  const match = desktopBlock.match(regex);
  assert.ok(match, `block must contain ${selector} rule`);
  return match[2];
}

test("desktop scoreboard block sets .scoreboard align-items: start", () => {
  const body = getRuleBody(".scoreboard");
  assert.match(body, /align-items:\s*start\b/);
});

test("desktop scoreboard block sets min-height: 0 for .score-tile and .court-board", () => {
  const tileBody = getRuleBody(".score-tile");
  assert.match(tileBody, /min-height:\s*0\b/);

  const courtBody = getRuleBody(".court-board");
  assert.match(courtBody, /min-height:\s*0\b/);
});

test("desktop scoreboard block sets .score-number font-size to min() with display token and vh", () => {
  const body = getRuleBody(".score-number");
  const fontMatch = body.match(/font-size:\s*([^;]+);/);
  assert.ok(fontMatch, "font-size declaration must exist");
  const value = fontMatch[1].trim();
  assert.match(value, /^min\(/, "font-size must use min(...)");
  assert.match(value, /var\(--display-digits-scoreboard\)/);
  assert.match(value, /\d+vh/);
});

test("desktop scoreboard block sets .court-team-label flex-direction: column", () => {
  const body = getRuleBody(".court-team-label");
  assert.match(body, /flex-direction:\s*column\b/);
});
