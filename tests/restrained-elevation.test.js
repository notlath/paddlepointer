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
        rules.push({ selectors: head.split(",").map((s) => s.trim().replace(/\s+/g, " ")), declarations, topLevel: stack.length === 0 });
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

const consumers = styleRules(css).filter((r) => !r.selectors.includes(":root"));
const tokens = {};
for (const [, name, value] of css.match(/:root\s*\{([\s\S]*?)\n\}/)[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) tokens[name] = value.trim();

// Last top-level value of a property for an exact selector.
function declared(selector, prop) {
  let value = null;
  for (const rule of consumers) {
    if (!rule.topLevel || !rule.selectors.includes(selector)) continue;
    for (const d of rule.declarations) if (d.prop === prop) value = d.value;
  }
  return value;
}

const px = (value) => {
  const token = value.match(/^var\((--[a-z0-9-]+)\)$/);
  return parseFloat(token ? tokens[token[1]] : value);
};

test("every corner comes from the named radius scale", () => {
  const offenders = [];
  for (const rule of consumers) {
    for (const { prop, value } of rule.declarations) {
      if (prop === "border-radius" && !/^(var\(--radius-(sm|md|lg|pill)\)|0|50%|inherit)$/.test(value)) offenders.push(`${rule.selectors.join(", ")} { border-radius: ${value} }`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("shadows are none, an elevation token, or a state ring, and never pure black", () => {
  const stateRing = /^(?:inset\s+)?0 0 0 \d+px (rgba\([^)]*\)|var\(--[a-z0-9-]+\)|currentColor)$/;
  const offenders = [];
  for (const rule of consumers) {
    for (const { prop, value } of rule.declarations) {
      if (prop !== "box-shadow") continue;
      const layers = value.split(/,(?![^(]*\))/).map((l) => l.trim());
      const ok = value === "none" || layers.every((l) => /^var\(--elevation-[123]\)$/.test(l) || stateRing.test(l));
      if (!ok || /rgba\(0, 0, 0/.test(value)) offenders.push(`${rule.selectors.join(", ")} { box-shadow: ${value} }`);
    }
  }
  assert.deepEqual(offenders, []);
  for (const level of ["1", "2", "3"]) {
    const value = tokens[`--elevation-${level}`] === "var(--shadow)" ? tokens["--shadow"] : tokens[`--elevation-${level}`];
    assert.match(value, /rgba\(10, 31, 84,/, `--elevation-${level} is tinted navy`);
  }
});

test("the strongest elevation is reserved for floating content and the Match being scored", () => {
  const allowed = new Set([
    ".skip-link",
    ".hero-court-card",
    ".match-recovery-dialog",
    ".destructive-confirmation-dialog",
    ".toast",
    ".side-nav.mobile-open",
    ".score-tile",
    ".score-tile.serving",
    ".court-board",
  ]);
  const offenders = [];
  for (const rule of consumers) {
    const shadow = rule.declarations.find((d) => d.prop === "box-shadow");
    if (!shadow || !shadow.value.includes("var(--elevation-3)")) continue;
    for (const selector of rule.selectors) if (!allowed.has(selector)) offenders.push(selector);
  }
  assert.deepEqual(offenders, []);
});

test("routine panels, sign-in cards, the setup preview, and shell chrome sit flat", () => {
  for (const selector of [".panel", ".hero-panel", ".auth-card", ".dark-auth-shell .auth-card", ".preview-card", ".side-nav", ".side-nav .side-nav-item.active", ".top-user", ".topbar .top-logout"]) {
    assert.equal(declared(selector, "box-shadow"), "none", `${selector} is flat`);
  }
  for (const selector of [".live-score-card", ".result-card", ".lead-status-card.is-live", ".round-group.current-round .round-card"]) {
    assert.equal(declared(selector, "box-shadow"), "var(--elevation-2)", `${selector} stays prominent without floating`);
  }
});

test("segments and Live Board tabs are concentric with their containers", () => {
  for (const [outer, inner] of [[".segmented", ".segment"], [".live-board-tabs", ".live-board-tab"]]) {
    assert.equal(px(declared(inner, "border-radius")) + px(declared(outer, "padding")), px(declared(outer, "border-radius")), `${outer} radius = ${inner} radius + padding`);
  }
});
