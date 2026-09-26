const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");

// Parse :root tokens
const rootMatch = css.match(/:root\s*\{([\s\S]*?)\n\}/);
const tokens = {};
if (rootMatch) {
  for (const [, name, value] of rootMatch[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    tokens[name] = value.trim();
  }
}

// Relative luminance & contrast calculation helper (WCAG 2.1)
function parseHex(hex) {
  const clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function relativeLuminance([r, g, b]) {
  const [rs, gs, bs] = [r / 255, g / 255, b / 255].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(parseHex(hex1));
  const l2 = relativeLuminance(parseHex(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function blendRgbaOverHex(rgbaStr, bgHex) {
  const match = rgbaStr.match(/rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)/);
  if (!match) return bgHex;
  const [r, g, b] = [parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3])];
  const a = match[4] !== undefined ? parseFloat(match[4]) : 1;
  const [bgr, bgg, bgb] = parseHex(bgHex);
  const blended = [
    Math.round(r * a + bgr * (1 - a)),
    Math.round(g * a + bgg * (1 - a)),
    Math.round(b * a + bgb * (1 - a)),
  ];
  return "#" + blended.map((c) => c.toString(16).padStart(2, "0")).join("");
}

test("semantic tokens define feedback surfaces and foreground pairings", () => {
  assert.ok(tokens["--surface-danger"], "missing --surface-danger");
  assert.ok(tokens["--border-danger"], "missing --border-danger");
  assert.ok(tokens["--color-danger-text"], "missing --color-danger-text");
  assert.ok(tokens["--surface-updating"], "missing --surface-updating");
  assert.ok(tokens["--border-updating"], "missing --border-updating");

  // Danger tokens match the existing form failure values
  assert.equal(tokens["--surface-danger"], "#fff3f3");
  assert.equal(tokens["--border-danger"], "rgba(200, 50, 50, 0.3)");
  assert.equal(tokens["--color-danger-text"], "#a32020");
});

test("the updating badge text meets 4.5:1 contrast on light surfaces", () => {
  assert.match(
    css,
    /\.data-updating-badge\s*\{[^}]*color:\s*var\(--color-on-primary\)/,
    "updating badge must use var(--color-on-primary) for text"
  );
  assert.match(
    css,
    /\.data-updating-badge\s*\{[^}]*background:\s*var\(--surface-updating\)/,
    "updating badge must resolve background via var(--surface-updating)"
  );
  assert.match(
    css,
    /\.data-updating-badge\s*\{[^}]*border:[^;]*var\(--border-updating\)/,
    "updating badge must resolve border via var(--border-updating)"
  );

  const navyHex = tokens["--navy"] || "#0a1f54";
  // Contrast against pure white page
  const contrastOnWhite = contrastRatio(navyHex, "#ffffff");
  assert.ok(contrastOnWhite >= 4.5, `Navy text on white must exceed 4.5:1 (got ${contrastOnWhite.toFixed(2)})`);

  // Contrast against badge lime-tinted background over white
  const badgeBg = blendRgbaOverHex(tokens["--surface-updating"] || "rgba(182, 255, 59, 0.16)", "#ffffff");
  const contrastOnBadgeBg = contrastRatio(navyHex, badgeBg);
  assert.ok(contrastOnBadgeBg >= 4.5, `Navy text on badge background must exceed 4.5:1 (got ${contrastOnBadgeBg.toFixed(2)})`);
});

test("updating badge pulse maintains readable contrast and stops under prefers-reduced-motion", () => {
  const pulseMatch = css.match(/@keyframes\s+pulse-updating\s*\{([\s\S]*?)\}/);
  assert.ok(pulseMatch, "pulse-updating keyframes must exist");

  // Lowest opacity must be >= 0.70 to keep contrast above 4.5:1
  const opacityMatches = [...pulseMatch[1].matchAll(/opacity:\s*([0-9.]+)/g)].map((m) => parseFloat(m[1]));
  for (const op of opacityMatches) {
    assert.ok(op >= 0.7, `pulse opacity ${op} is too low for WCAG AA contrast`);
  }

  assert.match(
    css,
    /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)[\s\S]*?\.data-updating-badge\s*\{[^}]*animation:\s*none/,
    "prefers-reduced-motion must disable pulse-updating animation"
  );
});

test("refresh error banner text and Retry control meet 4.5:1 contrast and match form failure family", () => {
  assert.match(
    css,
    /\.data-refresh-error-banner\s*\{[^}]*background:\s*var\(--surface-danger\)/,
    "refresh error banner must use var(--surface-danger)"
  );
  assert.match(
    css,
    /\.data-refresh-error-banner\s*\{[^}]*color:\s*var\(--color-danger-text\)/,
    "refresh error banner must use var(--color-danger-text)"
  );
  assert.match(
    css,
    /\.data-refresh-error-banner\s*\{[^}]*border:[^;]*var\(--border-danger\)/,
    "refresh error banner must use var(--border-danger)"
  );

  // Form failure contrast
  const dangerText = tokens["--color-danger-text"] || "#a32020";
  const dangerSurface = tokens["--surface-danger"] || "#fff3f3";
  const bannerTextContrast = contrastRatio(dangerText, dangerSurface);
  assert.ok(
    bannerTextContrast >= 4.5,
    `Error banner text contrast must be >= 4.5:1 (got ${bannerTextContrast.toFixed(2)})`
  );

  // Retry control inside banner
  assert.match(
    css,
    /\.data-refresh-error-banner\s+\.button/,
    "styles.css must style Retry button within data-refresh-error-banner"
  );
  assert.match(
    css,
    /\.data-refresh-error-banner\s+\.button\s*\{[^}]*color:\s*var\(--color-danger-text\)/,
    "Retry button must use var(--color-danger-text)"
  );
  assert.match(
    css,
    /\.data-refresh-error-banner\s+\.button\s*\{[^}]*min-height:\s*var\(--control-height-sm\)/,
    "Retry button must use compact control height"
  );
});

test("session loading spinner uses brand navy and lime on light pages with no teal or undefined tokens", () => {
  assert.doesNotMatch(css, /#00a896/i, "must not contain off-brand teal #00a896");
  assert.doesNotMatch(css, /#00c9b7/i, "must not contain off-brand teal #00c9b7");
  assert.doesNotMatch(css, /var\(--primary[,)]/, "must not reference undefined --primary token");

  // Light page spinner
  assert.match(
    css,
    /\.session-loading-spinner\s*\{[^}]*border-top-color:\s*var\(--color-heading\)/,
    "spinner on light pages must use var(--navy) for top border"
  );
  assert.match(
    css,
    /\.session-loading-spinner\s*\{[^}]*border-right-color:\s*var\(--color-primary\)/,
    "spinner on light pages must use var(--color-primary) for right border"
  );
  assert.match(
    css,
    /\.session-loading-message\s*\{[^}]*color:\s*var\(--color-text-muted\)/,
    "session loading message must resolve through var(--color-text-muted)"
  );
});

test("dark auth shell provides readable loading treatment with the auth accent", () => {
  assert.match(
    css,
    /\.dark-auth-shell\s+\.session-loading-card\s*\{[^}]*background:\s*transparent/,
    "session loading card in dark auth shell must be transparent"
  );
  assert.match(
    css,
    /\.dark-auth-shell\s+\.session-loading-spinner\s*\{[^}]*border-top-color:\s*var\(--color-auth-accent\)/,
    "spinner in dark auth shell must use the shared auth accent"
  );

  // Light text against #00102d dark auth background
  const darkBg = "#00102d";
  const whiteContrast = contrastRatio("#ffffff", darkBg);
  assert.ok(whiteContrast >= 4.5, `White on dark auth must exceed 4.5:1 (got ${whiteContrast.toFixed(2)})`);

  const accentContrast = contrastRatio(tokens["--court"] || "#3f9b46", darkBg);
  assert.ok(accentContrast >= 4.5, `Auth accent on dark auth must exceed 4.5:1 (got ${accentContrast.toFixed(2)})`);
});
