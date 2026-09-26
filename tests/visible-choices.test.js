const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rawCss = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
const css = rawCss.replace(/\r\n/g, "\n");
const cleanCss = css.replace(/\/\*[\s\S]*?\*\//g, "");
const appJs = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");

test("global reset rule selector includes textarea alongside button, input, select with font: inherit", () => {
  const resetMatch = cleanCss.match(/(?:^|\n)([\w\s,]+)\{\s*font:\s*inherit;\s*letter-spacing:\s*0;\s*\}/);
  assert.ok(resetMatch, "reset rule with font: inherit must exist");
  const selectors = resetMatch[1].split(",").map((s) => s.trim());
  assert.ok(selectors.includes("button"), "reset must include button");
  assert.ok(selectors.includes("input"), "reset must include input");
  assert.ok(selectors.includes("select"), "reset must include select");
  assert.ok(selectors.includes("textarea"), "reset must include textarea");
});

test(".segment.active has a box-shadow containing inset and var(--color-heading)", () => {
  const segmentActiveRule = cleanCss.match(/\.segment\.active[^{]*\{([^}]*)\}/)?.[1] || "";
  assert.ok(segmentActiveRule, ".segment.active rule must exist");
  assert.match(segmentActiveRule, /box-shadow:\s*[^;]*inset[^;]*var\(--color-heading\)/);
});

test("app.js contains no segment-row, and new-user-role radios sit inside a class='segmented' container", () => {
  assert.doesNotMatch(appJs, /segment-row/, "app.js should not contain segment-row");
  assert.doesNotMatch(cleanCss, /segment-row/, "styles.css should not contain segment-row");
  assert.match(
    appJs,
    /<div class="segmented">\s*<label class="segment \${form\.role === "player" \? "active" : ""}">\s*<input type="radio" name="new-user-role"/,
    "new-user-role radios must sit inside class='segmented'"
  );
});
