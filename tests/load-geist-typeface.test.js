const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");

test("index.html connects to Google Fonts with preconnect hints", () => {
  assert.match(
    html,
    /<link\s+rel=["']preconnect["']\s+href=["']https:\/\/fonts\.googleapis\.com["']\s*\/?>/i,
    "index.html must preconnect to https://fonts.googleapis.com"
  );
  assert.match(
    html,
    /<link\s+rel=["']preconnect["']\s+href=["']https:\/\/fonts\.gstatic\.com["']\s+crossorigin\s*\/?>/i,
    "index.html must preconnect to https://fonts.gstatic.com with crossorigin"
  );
});

test("index.html requests Geist for auth while retaining Inter for signed-in screens", () => {
  const fontLinkMatch = html.match(
    /<link\s+rel=["']stylesheet["']\s+href=["'](https:\/\/fonts\.googleapis\.com\/css2\?family=Geist[^"']+)["']/i
  );
  assert.ok(fontLinkMatch, "index.html must link to Google Fonts Geist stylesheet");

  const fontUrl = fontLinkMatch[1];
  assert.match(fontUrl, /family=Geist:wght@400;600;700;800/);
  assert.match(fontUrl, /family=Inter:ital,opsz,wght@0,14\.\.32,100\.\.900;1,14\.\.32,100\.\.900/);
  assert.match(fontUrl, /display=swap/);
});

test("Google Fonts link precedes styles.css in index.html for early font request", () => {
  const fontIndex = html.indexOf("fonts.googleapis.com/css2?family=Geist");
  const stylesIndex = html.indexOf("styles.css");

  assert.ok(fontIndex > -1, "Google Fonts link must be present");
  assert.ok(stylesIndex > -1, "styles.css link must be present");
  assert.ok(fontIndex < stylesIndex, "Google Fonts link must precede styles.css to minimize font swap latency");
});

test("index.html updates the stylesheet cache-busting version so venues pick up the change", () => {
  assert.match(
    html,
    /styles\.css\?v=\d{8}-[a-z0-9-]+/,
    "index.html must load styles.css with a dated cache-busting version parameter"
  );
});

test("styles.css enables font-optical-sizing auto on body", () => {
  const bodyRuleMatch = css.match(/body\s*\{([\s\S]*?)\n\}/);
  assert.ok(bodyRuleMatch, "body rule must exist in styles.css");
  assert.match(
    bodyRuleMatch[1],
    /font-optical-sizing:\s*auto;/,
    "body rule must enable font-optical-sizing: auto;"
  );
});

test("styles.css scopes Geist to auth and preserves Inter on signed-in screens", () => {
  const bodyRuleMatch = css.match(/body\s*\{([\s\S]*?)\n\}/);
  assert.ok(bodyRuleMatch, "body rule must exist in styles.css");
  assert.match(
    bodyRuleMatch[1],
    /font-family:\s*Inter,\s*ui-sans-serif,\s*system-ui,\s*-apple-system,\s*BlinkMacSystemFont,\s*["']Segoe UI["'],\s*sans-serif;/
  );

  assert.match(
    css,
    /body\.auth-mode\s*\{[^}]*font-family:\s*Geist,\s*ui-sans-serif,\s*system-ui,\s*-apple-system,\s*BlinkMacSystemFont,\s*["']Segoe UI["'],\s*sans-serif;/s
  );
});

test("headings, buttons, inputs, and score digits inherit font-family from their body mode", () => {
  // button, input, select must inherit the active body mode's family
  assert.match(css, /button,\s*input,\s*select\s*\{[^}]*font:\s*inherit/);

  // Ensure no elements override the family selected by body/body.auth-mode
  const rogueFontMatches = [...css.matchAll(/([^{}]+)\{\s*[^}]*font-family:\s*([^;}]+)/g)]
    .map(([, sel, fam]) => ({ selector: sel.trim(), family: fam.trim() }))
    .filter((entry) => !entry.selector.startsWith(":root") && !entry.selector.includes("body"));

  assert.deepEqual(
    rogueFontMatches,
    [],
    "No element should override the body mode font stack"
  );
});
