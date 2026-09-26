const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rawCss = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
// Strip comments to avoid false positives
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, "");

const rootMatch = css.match(/:root\s*\{([\s\S]*?)\n\}/);
assert.ok(rootMatch, ":root must be declared in styles.css");
const rootBody = rootMatch[1];
const rootTokens = {};
for (const [, name, value] of rootBody.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
  rootTokens[name] = value.trim();
}

test("weight tokens define only the four agreed weights and no 850 or 950", () => {
  // Agreed weights: 400, 600, 700, 800
  assert.equal(rootTokens["--font-weight-regular"], "400");
  assert.equal(rootTokens["--font-weight-semibold"], "600");
  assert.equal(rootTokens["--font-weight-bold"], "700");
  assert.equal(rootTokens["--font-weight-extrabold"], "800");

  // Re-pointed tokens for backward compatibility without promising unreachable weights
  assert.equal(rootTokens["--font-weight-heavy"], "800");
  assert.equal(rootTokens["--font-weight-black"], "800");

  // Verify no token in :root promises 850 or 950
  for (const [token, value] of Object.entries(rootTokens)) {
    if (token.startsWith("--font-weight-")) {
      assert.notEqual(value, "850", `${token} must not promise 850`);
      assert.notEqual(value, "950", `${token} must not promise 950`);
      assert.ok(
        ["400", "600", "700", "800"].includes(value),
        `${token} value ${value} must be one of the four agreed weights (400, 600, 700, 800)`
      );
    }
  }
});

test("every font-weight declaration across the stylesheet resolves to one of the four agreed weights", () => {
  const allowed = new Set(["400", "600", "700", "800"]);
  const weightDeclarations = [...css.matchAll(/font-weight\s*:\s*([^;]+);/g)].map((m) => m[1].trim());

  assert.ok(weightDeclarations.length > 0, "font-weight declarations must exist");

  const invalidWeights = [];
  for (const weight of weightDeclarations) {
    let resolved = weight;
    if (weight.startsWith("var(")) {
      const varName = weight.match(/var\((--[a-z0-9-]+)\)/)?.[1];
      resolved = rootTokens[varName] || weight;
    }
    if (!allowed.has(resolved)) {
      invalidWeights.push({ raw: weight, resolved });
    }
  }

  assert.deepEqual(
    invalidWeights,
    [],
    `Found font weights outside the agreed four (400, 600, 700, 800): ${JSON.stringify(invalidWeights)}`
  );
});

test("named size scale covers caption, label, body, lead, section heading, page heading, and display", () => {
  assert.ok(rootTokens["--font-size-caption"], "missing --font-size-caption");
  assert.ok(rootTokens["--font-size-label"], "missing --font-size-label");
  assert.ok(rootTokens["--font-size-body"], "missing --font-size-body");
  assert.ok(rootTokens["--font-size-lead"], "missing --font-size-lead");
  assert.ok(rootTokens["--font-size-section-heading"] || rootTokens["--font-size-section"], "missing --font-size-section-heading");
  assert.ok(rootTokens["--font-size-page-heading"] || rootTokens["--font-size-heading"], "missing --font-size-page-heading");
  assert.ok(rootTokens["--font-size-display"], "missing --font-size-display");
});

test("task-specific display sizes exist as a small named set", () => {
  const taskTokens = [
    "--display-digits-scoreboard",
    "--display-digits-scoreboard-mobile",
    "--display-score-call",
    "--display-tv-digits-1",
    "--display-tv-digits-2",
    "--display-tv-digits-4",
    "--display-tv-digits-all",
    "--display-tv-digits-default",
  ];
  for (const token of taskTokens) {
    assert.ok(rootTokens[token], `missing task-specific token ${token}`);
  }
});

test("body text is at least 16px and secondary text is at least 14px", () => {
  assert.equal(rootTokens["--font-size-body"], "1rem", "body baseline must be 1rem (16px)");
  assert.equal(rootTokens["--font-size-label"], "0.875rem", "secondary baseline must be 0.875rem (14px)");
  assert.equal(rootTokens["--font-size-md"], "1rem", "legacy body token must be 1rem (16px)");
  assert.equal(rootTokens["--font-size-sm"], "0.875rem", "legacy secondary token must be 0.875rem (14px)");
});

test("line heights come from a small semantic set", () => {
  assert.ok(rootTokens["--line-height-tight"], "missing --line-height-tight");
  assert.ok(rootTokens["--line-height-heading"], "missing --line-height-heading");
  assert.ok(rootTokens["--line-height-body"], "missing --line-height-body");
});

test("mobile Scoreboard and TV-mode Live Board viewing-distance legibility is preserved", () => {
  assert.match(css, /\.score-number\s*\{[^}]*font-size:\s*(?:var\(--display-digits-scoreboard\)|clamp\(6rem,\s*17vw,\s*12rem\))/);
  assert.match(css, /body\.scoreboard-mode\s+\.score-number\s*\{[^}]*font-size:\s*(?:var\(--display-digits-scoreboard-mobile\)|clamp\(3\.2rem,\s*14vw,\s*5\.2rem\))/);
  assert.match(css, /\.live-tv-mode\s+\.live-score-grid\.count-1\s+\.live-score-number\s+strong\s*\{[^}]*font-size:\s*(?:var\(--display-tv-digits-1\)|clamp\(7rem,\s*15vw,\s*15rem\))/);

  function evalClampPx(clampStr, viewportWidth) {
    const match = clampStr.match(/clamp\(\s*([\d.]+)rem\s*,\s*([\d.]+)vw\s*,\s*([\d.]+)rem\s*\)/);
    if (!match) return null;
    const minPx = parseFloat(match[1]) * 16;
    const valPx = (parseFloat(match[2]) / 100) * viewportWidth;
    const maxPx = parseFloat(match[3]) * 16;
    return Math.min(Math.max(valPx, minPx), maxPx);
  }

  // 375px mobile scoreboard
  const mobileDigitsPx = evalClampPx(rootTokens["--display-digits-scoreboard-mobile"], 375);
  assert.ok(mobileDigitsPx >= 50, `mobile score digits at 375px must be >= 50px (got ${mobileDigitsPx}px)`);

  // 768px tablet scoreboard
  const tabletDigitsPx = evalClampPx(rootTokens["--display-digits-scoreboard"], 768);
  assert.ok(tabletDigitsPx >= 120, `tablet score digits at 768px must be >= 120px (got ${tabletDigitsPx}px)`);

  // 1280px desktop scoreboard
  const desktopDigitsPx = evalClampPx(rootTokens["--display-digits-scoreboard"], 1280);
  assert.ok(desktopDigitsPx >= 180, `desktop score digits at 1280px must be >= 180px (got ${desktopDigitsPx}px)`);

  // 1920px TV mode
  const tvDigitsPx = evalClampPx(rootTokens["--display-tv-digits-1"], 1920);
  assert.ok(tvDigitsPx >= 200, `TV mode score digits at 1920px must be >= 200px (got ${tvDigitsPx}px)`);
});
