const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");

test("global hover outline and brightness filter are removed", () => {
  assert.doesNotMatch(
    css,
    /button:hover[^{]*\{[^}]*filter:\s*brightness/i,
    "button:hover must not use filter: brightness"
  );
  assert.doesNotMatch(
    css,
    /button:hover[^{]*\{[^}]*outline:[^;]*var\(--state-hover\)/i,
    "button:hover must not use outline: var(--state-hover)"
  );
  assert.doesNotMatch(
    css,
    /label\.segment:hover[^{]*\{[^}]*filter:\s*brightness/i,
    "label.segment:hover must not use filter: brightness"
  );
  assert.doesNotMatch(
    css,
    /label\.segment:hover[^{]*\{[^}]*outline:[^;]*var\(--state-hover\)/i,
    "label.segment:hover must not use outline: var(--state-hover)"
  );
});

test("hover rules are scoped inside @media (hover: hover) to prevent sticky touch hover", () => {
  const hoverMediaMatch = css.match(/@media\s*\(\s*hover:\s*hover\s*\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(hoverMediaMatch, "styles.css must declare @media (hover: hover) block");
  const hoverBlock = hoverMediaMatch[1];

  // Must contain hover rules for button variants
  assert.match(hoverBlock, /\.button:hover:not\(:disabled\)/);
  assert.match(hoverBlock, /\.button\.primary:hover:not\(:disabled\)/);
  assert.match(hoverBlock, /\.button\.dark:hover:not\(:disabled\)/);
  assert.match(hoverBlock, /\.button\.green:hover:not\(:disabled\)/);
  assert.match(hoverBlock, /\.button\.warn:hover:not\(:disabled\)/);
  assert.match(hoverBlock, /\.button\.danger:hover:not\(:disabled\)/);
  assert.match(hoverBlock, /\.button\.ghost:hover:not\(:disabled\)/);
});

test("each button variant has an intentional, distinct hover treatment", () => {
  const hoverMediaMatch = css.match(/@media\s*\(\s*hover:\s*hover\s*\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(hoverMediaMatch);
  const hoverBlock = hoverMediaMatch[1];

  // Primary deeper lime
  assert.match(hoverBlock, /\.button\.primary:hover:not\(:disabled\)\s*\{[^}]*background:\s*var\(--surface-button-primary-hover\)/);
  // Dark lighter navy
  assert.match(hoverBlock, /\.button\.dark:hover:not\(:disabled\)\s*\{[^}]*background:\s*var\(--surface-button-dark-hover\)/);
  // Green deeper court
  assert.match(hoverBlock, /\.button\.green:hover:not\(:disabled\)\s*\{[^}]*background:\s*var\(--surface-button-green-hover\)/);
  // Warn richer coral-orange
  assert.match(hoverBlock, /\.button\.warn:hover:not\(:disabled\)\s*\{[^}]*background:\s*var\(--surface-button-warn-hover\)/);
  // Danger deeper red
  assert.match(hoverBlock, /\.button\.danger:hover:not\(:disabled\)\s*\{[^}]*background:\s*var\(--surface-button-danger-hover\)/);
  // Ghost soft background and refined border
  assert.match(hoverBlock, /\.button\.ghost:hover:not\(:disabled\)\s*\{[^}]*background:\s*var\(--surface-page\)/);
  assert.match(hoverBlock, /\.button\.ghost:hover:not\(:disabled\)\s*\{[^}]*border-color:\s*var\(--border-input\)/);
  // Rally buttons
  assert.match(hoverBlock, /\.rally-btn:hover:not\(:disabled\)\s*\{[^}]*background:\s*(?:#1f592d|var\(--surface-rally-hover\))/);
  assert.match(hoverBlock, /\.rally-btn\.alt:hover:not\(:disabled\)\s*\{[^}]*background:\s*(?:#173b8a|var\(--surface-rally-alt-hover\))/);
  // Table actions
  assert.match(hoverBlock, /\.table-action:hover:not\(:disabled\)/);
  assert.match(hoverBlock, /\.table-action\.activate:hover:not\(:disabled\)/);
  assert.match(hoverBlock, /\.table-action\.deactivate:hover:not\(:disabled\)/);
  assert.match(hoverBlock, /\.table-action\.delete:hover:not\(:disabled\)/);
});

test("hover states are strictly scoped to non-disabled controls", () => {
  const hoverMediaMatch = css.match(/@media\s*\(\s*hover:\s*hover\s*\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(hoverMediaMatch);
  const hoverBlock = hoverMediaMatch[1];

  // Every hover selector in the block must include :not(:disabled) or be for navigation/non-button elements
  const selectors = [...hoverBlock.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim());
  for (const selector of selectors) {
    if (selector.includes(".button") || selector.includes(".rally-btn") || selector.includes(".table-action") || selector.includes(".segment")) {
      assert.ok(
        selector.includes(":not(:disabled)"),
        `Selector ${selector} must be scoped with :not(:disabled)`
      );
    }
  }
});

test("keyboard focus-visible and active pressed states remain intact and distinct from hover", () => {
  // Focus ring uses outline and offset
  assert.match(css, /button:focus-visible[^{]*\{[^}]*outline:\s*var\(--focus-ring-width\)\s+solid\s+var\(--state-focus-visible-on-light\)/);
  assert.match(css, /button:focus-visible[^{]*\{[^}]*outline-offset:\s*var\(--focus-ring-offset\)/);

  // Active pressed feedback
  assert.match(css, /button:active:not\(:disabled\)[^{]*\{[^}]*transform:\s*var\(--state-pressed\)/);
});

test("transitions animate visual properties within fast duration and are disabled under reduced motion", () => {
  // Transition rule covering button
  assert.match(
    css,
    /button[^{]*\{[^}]*transition:[^;]*var\(--motion-duration-fast\)\s+var\(--motion-easing\)/
  );

  // Reduced motion suppresses transition
  const reducedMotion = css.match(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{([\s\S]*?)\n\}/g)?.join("\n") || "";
  assert.ok(reducedMotion.includes("button"), "button must opt out under reduced motion");
  assert.match(reducedMotion, /transition:\s*none/);
});

test("navigation controls have clean hover, no sticky touch hover, and no hover outline", () => {
  const hoverMediaMatch = css.match(/@media\s*\(\s*hover:\s*hover\s*\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(hoverMediaMatch);
  const hoverBlock = hoverMediaMatch[1];

  assert.match(hoverBlock, /\.side-nav \.side-nav-item:hover:not\(\.active\)/);
  assert.match(hoverBlock, /\.sidebar-collapse:hover/);
  assert.match(hoverBlock, /\.topbar :is\(\.menu-toggle, \.top-logout\):hover/);

  // Sidebar collapse hover does not have outline
  assert.doesNotMatch(
    css,
    /\.sidebar-collapse:hover[^{]*\{[^}]*outline:/i,
    "sidebar-collapse:hover must not specify an outline"
  );
});

