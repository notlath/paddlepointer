const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rawCss = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
const css = rawCss.replace(/\r\n/g, "\n");
const cleanCss = css.replace(/\/\*[\s\S]*?\*\//g, "");

const appJs = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return cleanCss.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] || "";
}

function parseRootTokens() {
  const rootMatch = cleanCss.match(/:root\s*\{([\s\S]*?)\n\}/);
  const tokens = {};
  if (rootMatch) {
    for (const [, name, value] of rootMatch[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      tokens[name] = value.trim();
    }
  }
  return tokens;
}

const rootTokens = parseRootTokens();

test("selected segments and Live Board tabs use solid fill and heavier weight without text underline", () => {
  // Check no text-decoration: underline exists on segments, tabs, or nav items
  const underlineRule = rule(':is(.segment.active, .live-board-tab[aria-selected="true"], .side-nav-item[aria-current="page"])');
  assert.doesNotMatch(underlineRule, /text-decoration:\s*underline/, "underline must be removed from selected state");
  assert.doesNotMatch(cleanCss, /\.segment\.active[^{]*\{[^}]*text-decoration:\s*underline/);
  assert.doesNotMatch(cleanCss, /\.live-board-tab\.active[^{]*\{[^}]*text-decoration:\s*underline/);
  assert.doesNotMatch(cleanCss, /\.live-board-tab\[aria-selected="true"\][^{]*\{[^}]*text-decoration:\s*underline/);

  // Unselected segments have semibold weight
  const segmentRule = rule(".segment");
  assert.match(segmentRule, /font-weight:\s*var\(--font-weight-semibold\)/, "unselected segment should be semibold");

  // Selected segments have extrabold weight (non-color cue) and solid surface fill
  const segmentActiveRule = cleanCss.match(/\.segment\.active[^{]*\{([^}]*)\}/)?.[1] || "";
  assert.match(segmentActiveRule, /font-weight:\s*var\(--font-weight-extrabold\)/, "selected segment must have heavier weight cue");
  assert.match(segmentActiveRule, /background:\s*var\(--(?:surface|surface-panel)\)/, "selected segment must have solid surface fill");

  // Unselected Live Board tabs have semibold weight
  const tabRule = rule(".live-board-tab");
  assert.match(tabRule, /font-weight:\s*var\(--font-weight-semibold\)/, "unselected tab should be semibold");

  // Active Live Board tab has extrabold weight (non-color cue) and solid fill
  const tabActiveRule = cleanCss.match(/\.live-board-tab\.active[^{]*\{([^}]*)\}/)?.[1] || "";
  assert.match(tabActiveRule, /font-weight:\s*var\(--font-weight-extrabold\)/, "active tab must have heavier weight cue");
  assert.match(tabActiveRule, /background:\s*var\(--color-primary\)/, "active tab must have solid primary fill");
});

test("current navigation item keeps its lime pill and has no underline", () => {
  const activeNavRule = rule(".side-nav .side-nav-item.active");
  assert.match(activeNavRule, /background:\s*var\(--color-primary\)/, "active nav item must have the lime primary background");
  assert.match(activeNavRule, /color:\s*var\(--color-on-primary\)/, "active nav item must have navy on-primary text");
  assert.doesNotMatch(activeNavRule, /text-decoration:\s*underline/, "active nav item must not have underline");

  const navItemUnderline = cleanCss.match(/\.side-nav-item\[aria-current="page"\][^{]*\{([^}]*)\}/)?.[1] || "";
  assert.doesNotMatch(navItemUnderline, /text-decoration:\s*underline/, "nav item aria-current must not have underline");
});

test("disabled controls use muted fill, muted text, and not-allowed cursor without dashed borders", () => {
  const disabledGroup = cleanCss.match(/:is\(\.button,\s*\.table-action,\s*\.input,\s*\.textarea,\s*\.switch\):disabled\s*\{([^}]*)\}/)?.[1] || "";
  assert.doesNotMatch(disabledGroup, /border-style:\s*dashed/, "disabled controls must not have dashed borders");
  assert.match(disabledGroup, /cursor:\s*not-allowed/, "disabled controls must have cursor: not-allowed");

  // Contrast check for disabled tokens: --color-on-disabled on --color-disabled
  function hexToRgb(hex) {
    const clean = hex.replace("#", "");
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }
  function relLuminance([r, g, b]) {
    const [rs, gs, bs] = [r, g, b].map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }
  const fg = hexToRgb(rootTokens["--color-on-disabled"] || "#475467");
  const bg = hexToRgb(rootTokens["--color-disabled"] || "#e8edf5");
  const l1 = Math.max(relLuminance(fg), relLuminance(bg));
  const l2 = Math.min(relLuminance(fg), relLuminance(bg));
  const contrast = (l1 + 0.05) / (l2 + 0.05);
  assert.ok(contrast >= 4.5, `disabled contrast ratio must be at least 4.5:1 (got ${contrast.toFixed(2)}:1)`);
});

test("busy controls show an inline progress indicator and busy label without a dotted border", () => {
  const busyRule = cleanCss.match(/:is\(\.button,\s*\.table-action\)\[aria-busy="true"\]\s*\{([^}]*)\}/)?.[1] || "";
  assert.doesNotMatch(busyRule, /border-style:\s*dotted/, "busy controls must not have dotted border");
  assert.match(busyRule, /cursor:\s*wait/, "busy controls must have cursor: wait");

  // Inline progress indicator via ::before
  const busyBefore = cleanCss.match(/:is\(\.button,\s*\.table-action\)\[aria-busy="true"\]::before\s*\{([^}]*)\}/)?.[1] || "";
  assert.ok(busyBefore, "busy controls must have an inline ::before progress indicator");
  assert.match(busyBefore, /border:\s*2px solid currentColor/, "spinner must use currentColor border");
  assert.match(busyBefore, /border-radius:\s*50%/, "spinner must be circular");
  assert.match(busyBefore, /animation:\s*button-spinner/, "spinner must have animation");

  // Busy spinner animation stops under reduced motion
  const reducedMotion = cleanCss.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/g)?.join("\n") || "";
  assert.match(
    reducedMotion,
    /:is\(\.button,\s*\.table-action\)\[aria-busy="true"\]::before\s*\{[^}]*animation:\s*none/,
    "busy spinner must stop animating under reduced motion"
  );
});

test("an available court reads as a confirmed ready state instead of an empty placeholder", () => {
  const available = rule(".live-score-card.court-state.available");
  const status = rule(".live-score-card.court-state.available .live-status");
  const detail = rule(".live-score-card.court-state.available .live-court-state-detail");

  assert.match(available, /border-style:\s*solid/, "available courts use a confident solid boundary");
  assert.match(status, /background:\s*var\(--status-active-surface\)/, "availability has a semantic status surface");
  assert.match(status, /border-radius:\s*var\(--radius-pill\)/, "availability follows the existing status badge grammar");
  assert.match(detail, /font-weight:\s*var\(--font-weight-black\)/, "the ready message leads the state card");
});

test("warn buttons look like a normal filled variant without dashed borders", () => {
  const warnRule = rule(".button.warn");
  assert.match(warnRule, /background:\s*var\(--color-warning\)/, "warn button must use the warning background");
  assert.match(warnRule, /color:\s*var\(--color-heading\)/, "warn button must use navy heading text");

  // Verify no dashed border rule for warn buttons
  assert.doesNotMatch(cleanCss, /:is\(\.button\.warn[^{]*\{[^}]*border-style:\s*dashed/);
  assert.doesNotMatch(cleanCss, /\.button\.warn[^{]*\{[^}]*border-style:\s*dashed/);
});

test("destructive buttons use solid danger fill without inset rings and maintain spatial separation", () => {
  const dangerRule = rule(".button.danger");
  assert.match(dangerRule, /background:\s*var\(--color-destructive\)/, "danger button must use danger background");
  assert.match(dangerRule, /color:\s*var\(--color-on-destructive\)/, "danger button must use white text");

  // Verify no inset ring on danger button
  assert.doesNotMatch(cleanCss, /\.button\.danger[^{]*\{[^}]*box-shadow:\s*inset/);
  assert.doesNotMatch(cleanCss, /:is\(\.button\.danger[^{]*\{[^}]*box-shadow:\s*inset/);

  // Spatially separated in destructive confirmation actions
  const actionsRule = rule(".destructive-confirmation-actions");
  assert.match(actionsRule, /gap:\s*var\(--space-5\)/, "destructive actions must maintain spatial separation");
});

test("screen reader state attributes remain intact across interactive components", () => {
  assert.match(appJs, /aria-current="page"/, "navigation must use aria-current='page'");
  assert.match(appJs, /role:\s*["']tab["']/, "Live Board tabs must define role='tab'");
  assert.match(appJs, /aria-selected="\$\{props\.ariaSelected\}"/, "Live Board tabs must set aria-selected");
  assert.match(appJs, /aria-busy="true"/, "pending buttons must set aria-busy='true'");
  assert.match(appJs, /role="switch"/, "switches must use role='switch'");
  assert.match(appJs, /aria-checked=/, "switches must set aria-checked");
});
