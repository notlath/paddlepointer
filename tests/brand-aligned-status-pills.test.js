const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
const rootBlock = css.match(/:root\s*\{([\s\S]*?)\n\}/)[1];
const tokens = Object.fromEntries(
  [...rootBlock.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()])
);

function resolvedColor(value) {
  const token = value.match(/^var\((--[a-z0-9-]+)\)$/)?.[1];
  return token ? resolvedColor(tokens[token]) : value;
}

function luminance(hex) {
  const channels = hex
    .slice(1)
    .match(/../g)
    .map((channel) => parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const values = [luminance(resolvedColor(foreground)), luminance(resolvedColor(background))].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("status colors are semantic brand tokens with readable text", () => {
  for (const status of ["active", "scheduled", "completed", "neutral"]) {
    const surface = tokens[`--status-${status}-surface`];
    const text = tokens[`--status-${status}-text`];
    const border = tokens[`--status-${status}-border`];
    assert.ok(surface && text && border, `${status} needs surface, text, and border tokens`);
    assert.ok(contrast(text, surface) >= 4.5, `${status} status text must meet 4.5:1 contrast`);
  }
  assert.notEqual(tokens["--status-neutral-surface"], "#f0f3f8", "neutral statuses must not reuse the retired stock slate");
});

test("Dashboard renders active, scheduled, completed, and neutral status labels", () => {
  const dashboard = appCode.slice(appCode.indexOf("function renderAdminDashboard()"), appCode.indexOf("function renderPlayerDashboard()"));
  for (const label of ["Scoring", "Ongoing", "Live", "Scheduled", "Completed", "Idle", "None", "Done"]) {
    assert.match(dashboard, new RegExp(`>${label}|\\$\\{[^}]+\\} ${label}`), `missing ${label} status label`);
  }
});

test("Dashboard, Tournament, and Live Board share the same status treatments", () => {
  for (const status of ["active", "scheduled", "completed"]) {
    const treatment = new RegExp(
      `[^{}]*status-pill[^{}]*[^{}]*match-card[^{}]*[^{}]*live-score-card[^{}]*\\{[^}]*background:\\s*var\\(--status-${status}-surface\\);[^}]*color:\\s*var\\(--status-${status}-text\\);`,
      "s"
    );
    assert.match(css, treatment, `${status} must share one treatment across all three surfaces`);
  }
});

test("active status pills add a static shape cue", () => {
  assert.match(css, /status-pill\.in_progress[^{}]*::before[^{}]*\{[^}]*content:\s*"";[^}]*background:\s*currentColor;/s);
});
