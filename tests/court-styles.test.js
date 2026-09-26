const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rawCss = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");

// Court drawing classes only; Live Board tab/subhead classes like .live-court-tabs are not courts.
const COURT_SELECTOR = /\.(live-court|court-team(-[ab])?|court-team-label|court-service-zone|court-preview|court-lines)(?![\w-])/;

// Top-level rules (outside @media) as { selector, body, index }.
function topLevelRules(source) {
  const rules = [];
  let depth = 0;
  let selectorStart = 0;
  let mediaDepth = 0;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") {
      const selector = source.slice(selectorStart, i).trim();
      if (depth === 0 && selector.startsWith("@media")) mediaDepth = 1;
      if (depth === mediaDepth && !selector.startsWith("@")) {
        const end = source.indexOf("}", i);
        if (depth === 0) rules.push({ selector, body: source.slice(i + 1, end), index: selectorStart });
      }
      depth += 1;
      selectorStart = i + 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) mediaDepth = 0;
      selectorStart = i + 1;
    }
  }
  return rules;
}

const rules = topLevelRules(css);
const rule = (selector) => {
  const found = rules.filter((r) => r.selector.split(/\s*,\s*/).includes(selector));
  assert.equal(found.length, 1, `exactly one top-level rule must declare ${selector}, found ${found.length}`);
  return found[0].body;
};

const hex = (name) => {
  const match = rawCss.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i"));
  assert.ok(match, `${name} must be a hex brand token`);
  return match[1];
};
const luminance = (value) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test("every court declaration lives in the Scoreboard & Court section, so no late layer can reverse it", () => {
  const start = rawCss.indexOf("07. SCOREBOARD & COURT UI");
  const end = rawCss.indexOf("08. HISTORY, SHARING & LEADERBOARD");
  assert.ok(start > 0 && end > start, "section markers must exist");
  const strays = rules.filter((r) => COURT_SELECTOR.test(r.selector) && (r.index < start || r.index > end));
  assert.deepEqual(strays.map((r) => r.selector), []);
});

test("setup preview and Scoreboard court share one color and line model", () => {
  const shared = rules.find((r) => /^\.court-preview,\s*\.live-court$/.test(r.selector));
  assert.ok(shared, ".court-preview and .live-court must declare the model together");
  for (const token of ["--court-surface", "--court-kitchen", "--court-line", "--court-line-width", "--court-net-width", "--kitchen-width"]) {
    assert.match(shared.body, new RegExp(`${token}:`), `${token} belongs to the shared court model`);
  }
  assert.match(rule(".court-team::before"), /background:\s*var\(--court-kitchen\)/);
  assert.match(rule(".court-preview .court-lines::after"), /background:\s*var\(--court-kitchen\)/);
});

test("net and service lines sit on the true center line", () => {
  for (const selector of [".live-court::before", ".court-preview .court-lines::before"]) {
    const body = rule(selector);
    assert.match(body, /left:\s*calc\(50% - var\(--court-net-width\) \/ 2\)/, `${selector} is centered`);
    assert.match(body, /width:\s*var\(--court-net-width\)/, `${selector} uses the net width`);
  }
  assert.match(rule(".court-team::after"), /top:\s*calc\(50% - var\(--court-line-width\) \/ 2\)/);
});

test("court labels meet the 4.5:1 contrast baseline on the playing surface", () => {
  const shared = rules.find((r) => /^\.court-preview,\s*\.live-court$/.test(r.selector));
  const surfaceToken = shared.body.match(/--court-surface:\s*var\((--[a-z0-9-]+)\)/)[1];
  assert.ok(contrast("#ffffff", hex(surfaceToken)) >= 4.5, `white text on ${surfaceToken} must reach 4.5:1`);
  for (const selector of [".court-service-zone", ".court-service-zone em", ".court-service-zone.active small"]) {
    assert.match(rule(selector), /(^|[\s;])color:\s*(?:#fff|var\(--color-on-dark\));/, `${selector} text is opaque white`);
  }
});

test("serving state is conveyed by text, not color alone", () => {
  assert.match(appCode, /\$\{isServing \? "Serving" : "Receiving"\}/);
  assert.match(appCode, /<small>Serve here<\/small>/);
  assert.match(appCode, /<span class="serve-badge">Serving<\/span>/);
});

test("score numerals share one typography across preview, Scoreboard, summary, and Live", () => {
  const scoreRule = rules.find((r) => /\.score-number/.test(r.selector) && /tabular-nums/.test(r.body));
  assert.ok(scoreRule, "a shared score numeral rule must exist");
  for (const selector of [".score-number", ".preview-score strong", ".final-score strong", ".live-score-number strong"]) {
    assert.ok(scoreRule.selector.split(/\s*,\s*/).includes(selector), `${selector} uses the shared score typography`);
  }
  assert.match(scoreRule.body, /font-weight:\s*(950|var\(--font-weight-black\))/);
});
