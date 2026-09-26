const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8").replace(/\r\n/g, "\n");

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] || "";
}
test("shared controls distinguish hover, keyboard focus, press, selection, loading, disabled, warning, and destructive states", () => {
  assert.match(css, /--state-pressed:\s*scale\(0\.96\)/);
  assert.match(css, /\.button:hover:not\(:disabled\)[^{]*\{/);
  assert.doesNotMatch(css, /button:hover:not\(:disabled\)[^{]*\{[^}]*var\(--state-hover\)/);
  assert.match(css, /button:focus-visible[^{]*\{/);
  assert.match(css, /button:active:not\(:disabled\)[^{]*\{/);
  assert.doesNotMatch(css, /:is\(\.segment\.active[^{]*\{[^}]*text-decoration:\s*underline/);
  assert.doesNotMatch(css, /:is\(\.button,\s*\.table-action\)\[aria-busy="true"\][^{]*\{[^}]*border-style:\s*dotted/);
  assert.doesNotMatch(css, /:is\(\.button,\s*\.table-action,\s*\.input,\s*\.textarea,\s*\.switch\):disabled[^{]*\{[^}]*border-style:\s*dashed/);
  assert.doesNotMatch(css, /:is\(\.button\.warn,\s*\.table-action\.deactivate\)[^{]*\{[^}]*border-style:\s*dashed/);
  assert.doesNotMatch(css, /:is\(\.button\.danger,\s*\.table-action\.delete\)[^{]*\{[^}]*box-shadow:\s*inset/);
  assert.match(rule(':is(.button, .table-action)[aria-busy="true"]::before'), /animation:\s*button-spinner/);
  assert.match(rule(".button"), /border:\s*2px solid transparent/);
  assert.ok(css.indexOf(":is(.button, .table-action, .input, .textarea, .switch):disabled") < css.indexOf(':is(.button, .table-action)[aria-busy="true"]'));
});

test("loading animations use shared duration and easing tokens", () => {
  const animations = [...css.matchAll(/animation\s*:\s*([^;]+);/g)].map((match) => match[1]);
  for (const value of animations) {
    if (value === "none") continue;
    assert.match(value, /var\(--motion-duration-[a-z-]+\)/, value);
    assert.match(value, /var\(--motion-easing(?:-[a-z-]+)?\)/, value);
  }
});

test("interaction transitions use the motion scale and avoid layout properties", () => {
  const transitions = [...css.matchAll(/transition\s*:\s*([^;]+);/g)].map((match) => match[1]);
  assert.ok(transitions.length > 0);
  for (const value of transitions) {
    if (value === "none") continue;
    assert.match(value, /var\(--motion-duration-(?:fast|base|slow)\)/, value);
    assert.doesNotMatch(value, /\b(?:width|height|top|right|bottom|left|margin(?:-left)?)\b/, value);
  }
});

test("reduced motion makes drawers, dialogs, switches, tabs, and state changes immediate while keeping static feedback", () => {
  const reducedMotion = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)?.join("\n") || "";
  for (const selector of ["button", "label.segment", ".skip-link", ".side-nav .side-nav-item", ".topbar .menu-toggle span", ".match-recovery-dialog", ".live-score-dialog", ".switch", ".live-board-tab", ".is-updating"]) {
    assert.ok(reducedMotion.includes(selector), `${selector} must opt out of motion`);
  }
  assert.match(reducedMotion, /transition:\s*none/);
  assert.match(reducedMotion, /animation:\s*none/);
});
