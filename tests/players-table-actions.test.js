const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const appJs = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const rule = (selector) => css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] || "";

test("the Players table opts in to the action-column layout; the People table does not", () => {
  const players = appJs.match(/function renderPlayersTable[\s\S]*?<table class="([^"]*)"/)?.[1] || "";
  assert.match(players, /\bplayers-table\b/);
  assert.doesNotMatch(appJs.slice(appJs.indexOf("function renderPlayersTable") + 1200), /<table class="[^"]*players-table/);
});

test("Player row actions are a grid of equal touch-sized buttons that cannot collapse into a stack", () => {
  const actions = rule(".players-table .user-row-actions");
  assert.match(actions, /display:\s*grid/);
  assert.match(actions, /grid-auto-flow:\s*column/);
  assert.match(actions, /gap:\s*var\(--space-3\)/);
  assert.doesNotMatch(actions, /flex-wrap/);
  assert.match(css, /\.table-action\s*\{[^}]*min-height:\s*var\(--control-height-md\)/, "44px touch target");
});

test("the Skill Level select is capped so it cannot squeeze the Action column", () => {
  assert.match(rule(".players-table .player-skill-picker"), /max-width:\s*20rem/);
});
