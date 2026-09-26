const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
const declarations = (selector) =>
  rules
    .filter(([, selectors]) => selectors.split(",").map((value) => value.trim()).includes(selector))
    .map(([, , body]) => body)
    .join("\n");

test("Live Board side cards size themselves to their populated rows", () => {
  assert.match(declarations(".live-tv-mode .live-side-panel"), /grid-template-rows:\s*repeat\(2,\s*minmax\(0,\s*max-content\)\)/);

  for (const selector of [".live-tv-mode .top-player-list", ".live-tv-mode .live-next-list"]) {
    const body = declarations(selector);
    assert.match(body, /grid-auto-rows:\s*minmax\(0,\s*max-content\)/, `${selector} uses content-sized rows`);
    assert.doesNotMatch(body, /grid-template-rows:\s*repeat\((?:4|5),/, `${selector} does not reserve empty slots`);
  }
});

test("Live score cards stay wider than the supporting rail on desktop", () => {
  for (const selector of [".live-view-grid", ".live-tv-mode .live-view-grid"]) {
    assert.match(
      declarations(selector),
      /grid-template-columns:\s*minmax\(0,\s*2fr\)\s+minmax\(320px,\s*0\.75fr\)/,
      `${selector} gives the live scores the dominant column`
    );
  }
});
