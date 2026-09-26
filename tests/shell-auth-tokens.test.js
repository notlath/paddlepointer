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
      const head = source.slice(start, i).trim().replace(/\s+/g, " ");
      if (!head.startsWith("@") && !stack.some((s) => s.startsWith("@keyframes"))) {
        const body = source.slice(i + 1, source.indexOf("}", i));
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
const legacyReference = new RegExp(`var\\((${LEGACY.join("|")})\\)`);
const rawColor = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;

// The application shell and the sign-in and session loading surfaces.
const SHELL_AND_AUTH = /auth-|login-|session-loading|field-error|form-failure|form-success|\.input\[aria-invalid|\.textarea\[aria-invalid|app-chrome|side-nav|side-brand|side-logo|side-menu|side-footer|sidebar|topbar|top-user|top-logout|menu-toggle/;

test("shell and sign-in styles use only semantic color, surface, border, and state tokens", () => {
  const offenders = [];
  for (const rule of rules) {
    if (!SHELL_AND_AUTH.test(rule.selector)) continue;
    // Rules shared with other surfaces migrate with those surfaces; only shell-only rules belong to this batch.
    if (rule.selector.split(",").some((s) => !SHELL_AND_AUTH.test(s))) continue;
    for (const { prop, value } of rule.declarations) {
      if (legacyReference.test(value) || rawColor.test(value)) offenders.push(`${rule.selector} { ${prop}: ${value} }`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("shell and sign-in roles that had no token now have named semantic tokens", () => {
  for (const name of [
    "--surface-auth-shell",
    "--surface-scrim",
    "--surface-nav-control",
    "--surface-nav-hover",
    "--surface-shell-hover",
    "--border-nav",
    "--border-nav-divider",
    "--border-nav-control",
    "--border-shell",
    "--border-shell-control",
    "--border-shell-hover",
    "--border-card",
    "--color-heading",
    "--color-auth-accent",
    "--color-on-auth-accent",
    "--color-on-dark",
    "--color-on-dark-muted",
    "--surface-success",
    "--border-success",
    "--color-success-text",
    "--spinner-track",
    "--spinner-track-on-dark",
  ]) {
    assert.ok(tokens[name], `${name} is defined in :root`);
  }
});

test("original brand variables still exist so unmigrated screens keep working", () => {
  for (const name of LEGACY) assert.ok(tokens[name], `${name} is still defined`);
});
