const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const raw = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8").replace(/\r\n/g, "\n");
const css = raw.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));

function styleRules(source) {
  const rules = [];
  const stack = [];
  let start = 0;
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === "{") {
      const head = source.slice(start, i).trim().replace(/\s+/g, " ");
      if (!head.startsWith("@") && !stack.some((s) => s.startsWith("@keyframes"))) {
        const bodyEnd = source.indexOf("}", i);
        const body = source.slice(i + 1, bodyEnd);
        const declarations = [...body.matchAll(/([a-z-]+)\s*:\s*([^;]+);/g)].map(([, prop, value]) => ({ prop, value: value.trim() }));
        rules.push({ selector: head, declarations });
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
const rootBody = css.match(/:root\s*\{([\s\S]*?)\n\}/)[1];
const tokens = Object.fromEntries([...rootBody.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));

const LEGACY = ["--navy", "--navy-2", "--court", "--court-dark", "--accent", "--accent-2", "--ink", "--muted", "--line", "--surface", "--soft", "--danger", "--shadow"];
const legacyVarRegex = new RegExp(`var\\((${LEGACY.join("|")})(?![\\w-])`);
const rawColorRegex = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;

test("remaining styles for tournament, records, and people reference semantic tokens instead of original brand variables or raw colors", () => {
  const TARGET_PATTERNS = /(?:\.tournament|\.format|\.round|\.match-card|\.match-team|\.match-vs|\.match-result-pill|\.history|\.leaderboard|\.rules-topic|\.toast|\.lead-status-card|\.player-access-card|\.table-action|\.hero-court|\.stat\b|\.eyebrow|\.button\b|\.input\b|\.textarea\b|\.role-badge|\.qr-card|\.qr-placeholder|\.compact-row|\.team-input-group)/;

  const offenders = [];
  for (const rule of rules) {
    if (rule.selector === ":root") continue;
    if (!TARGET_PATTERNS.test(rule.selector)) continue;
    for (const { prop, value } of rule.declarations) {
      if (legacyVarRegex.test(value) || rawColorRegex.test(value)) {
        offenders.push(`${rule.selector} { ${prop}: ${value} }`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("missing roles for tournament, records, buttons, and interaction states have named semantic tokens", () => {
  const requiredTokens = [
    "--surface-page-gradient",
    "--surface-hero-grid",
    "--surface-hero-card",
    "--border-hero-card",
    "--surface-button-secondary",
    "--surface-button-secondary-hover",
    "--surface-button-primary-hover",
    "--surface-button-dark",
    "--surface-button-dark-hover",
    "--surface-button-green",
    "--surface-button-green-hover",
    "--surface-button-warn-hover",
    "--surface-button-danger-hover",
    "--border-input-hover",
    "--border-input-focus",
    "--glow-input-focus",
    "--surface-player-access",
    "--border-player-access",
    "--surface-action-activate",
    "--border-action-activate",
    "--color-action-activate",
    "--surface-action-activate-hover",
    "--border-action-activate-hover",
    "--surface-action-deactivate",
    "--border-action-deactivate",
    "--color-action-deactivate",
    "--surface-action-deactivate-hover",
    "--border-action-deactivate-hover",
    "--surface-action-delete",
    "--border-action-delete",
    "--color-action-delete",
    "--surface-action-delete-hover",
    "--border-action-delete-hover",
    "--border-match-completed",
    "--border-match-in-progress",
    "--surface-match-in-progress",
    "--border-match-result",
    "--border-lead-card-live",
    "--surface-toast",
    "--state-focus-visible-alt"
  ];

  for (const token of requiredTokens) {
    assert.ok(tokens[token], `${token} must be defined in :root`);
  }
});

test("a search of the stylesheet finds no remaining references to the original brand variables outside the token definitions, and no raw colors outside the token definitions", () => {
  // Extract all CSS outside the :root block
  const rootEndIdx = css.indexOf(rootBody) + rootBody.length + 1;
  const nonRootCss = css.slice(rootEndIdx);

  const nonRootRules = styleRules(nonRootCss);
  const offenders = [];
  for (const rule of nonRootRules) {
    for (const { prop, value } of rule.declarations) {
      if (legacyVarRegex.test(value)) {
        offenders.push(`legacy-var in ${rule.selector} { ${prop}: ${value} }`);
      } else if (rawColorRegex.test(value)) {
        offenders.push(`raw-color in ${rule.selector} { ${prop}: ${value} }`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("original brand variables still exist in :root for the final contract step", () => {
  for (const v of LEGACY) {
    assert.ok(tokens[v], `${v} must still exist in :root for contract step`);
  }
});
