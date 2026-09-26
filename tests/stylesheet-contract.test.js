const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const raw = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8").replace(/\r\n/g, "\n");
const css = raw.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));

// Every style rule (top level and inside @media), with its selector list and declarations.
function styleRules(source) {
  const rules = [];
  const stack = [];
  let start = 0;
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === "{") {
      const head = source.slice(start, i).trim();
      if (!head.startsWith("@") && !stack.some((s) => s.startsWith("@keyframes"))) {
        const body = source.slice(i + 1, source.indexOf("}", i));
        const declarations = [...body.matchAll(/([a-z-]+)\s*:\s*([^;]+);/g)].map(([, prop, value]) => ({ prop, value: value.trim() }));
        rules.push({ selector: head.replace(/\s+/g, " "), declarations, topLevel: stack.length === 0 });
      }
      stack.push(head);
      start = i + 1;
    } else if (source[i] === "}") {
      stack.pop();
      start = i + 1;
    }
  }
  return rules;
}

const rules = styleRules(css);
const roots = rules.filter((r) => r.selector === ":root");
const tokens = {};
const rootBody = css.match(/:root\s*\{([\s\S]*?)\n\}/)[1];
for (const [, name, value] of rootBody.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) tokens[name] = value.trim();
const consumers = rules.filter((r) => r.selector !== ":root");

test("there is one authoritative root token definition", () => {
  assert.equal(roots.length, 1, "styles.css must declare :root exactly once");
  for (const name of ["--sidebar-expanded", "--sidebar-collapsed", "--topbar-height", "--drawer-width", "--radius-md", "--layer-nav"]) {
    assert.ok(tokens[name], `${name} belongs in the single :root`);
  }
});

test("superseded legacy chrome and screen rules with no markup consumer are gone", () => {
  const dead = /\.(access-note|auth-side|auth-tabs|blank-slot|brand|brand-mark|brand-name|brand-subtitle|feature-list|live-court-tabs?|live-tabs-layout|player-pill|player-pill-list|recommendation-card|screen-reader-only|social-btn|social-share-row|tournament-leaderboard-table|user-chip)(?![\w-])/;
  const strays = consumers.filter((r) => dead.test(r.selector)).map((r) => r.selector);
  assert.deepEqual(strays, []);
});

test("shared typography, spacing, radius, elevation, and layer values resolve through semantic tokens", () => {
  const families = {
    "border-radius": /^--radius-/,
    "z-index": /^--layer-/,
    "font-weight": /^--font-weight-/,
    "font-size": /^--font-size-/,
    gap: /^--space-/,
    "row-gap": /^--space-/,
    "column-gap": /^--space-/,
    "box-shadow": /^--elevation-/,
  };
  const literals = [];
  for (const rule of consumers) {
    for (const { prop, value } of rule.declarations) {
      const family = families[prop];
      if (!family) continue;
      const token = Object.keys(tokens).find((name) => family.test(name) && tokens[name] === value);
      if (token) literals.push(`${rule.selector} { ${prop}: ${value} } should use var(${token})`);
      if (prop === "box-shadow" && value === "var(--shadow)") literals.push(`${rule.selector} { box-shadow: var(--shadow) } should use var(--elevation-3)`);
    }
  }
  assert.deepEqual(literals, []);
});

test("focus, hover, pressed, disabled, and motion states resolve through semantic tokens", () => {
  const stateLiterals = {
    "3px solid var(--accent)": "var(--focus-ring-width) solid var(--state-focus-visible)",
    "3px solid var(--navy)": "var(--focus-ring-width) solid var(--state-focus-visible-on-light)",
    "3px solid rgba(182, 255, 59, 0.45)": "var(--focus-ring-width) solid var(--state-hover)",
  };
  const literals = [];
  for (const rule of consumers) {
    for (const { prop, value } of rule.declarations) {
      if (prop === "outline" && stateLiterals[value]) literals.push(`${rule.selector} outline should use ${stateLiterals[value]}`);
      if (prop === "outline-offset" && value === tokens["--focus-ring-offset"]) literals.push(`${rule.selector} outline-offset should use var(--focus-ring-offset)`);
      if (prop === "transform" && value === tokens["--state-pressed"]) literals.push(`${rule.selector} transform should use var(--state-pressed)`);
      if (/^transition/.test(prop) && /\b(160|180|220)ms ease\b/.test(value)) literals.push(`${rule.selector} transition should use motion tokens`);
      if (/:disabled/.test(rule.selector) && /#e8edf5|#475467/.test(value)) literals.push(`${rule.selector} ${prop} should use the disabled color tokens`);
    }
  }
  assert.deepEqual(literals, []);
});
