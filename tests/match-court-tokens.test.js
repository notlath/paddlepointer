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
const legacyReference = new RegExp(`var\\((${LEGACY.join("|")})\\)`);
const rawColor = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;

// Match Setup, court preview & model, Scoreboard, Match summary, and destructive/recovery dialogs
const MATCH_AND_COURT = /(?:score-call-chip|preview-card|preview-score|preview-meta|meta-list|segmented|\.segment\b|toggle-row|toggle-copy|\.switch\b|court-preview|live-court(?!-subhead|-state|-tabs)|court-lines|court-team|court-service-zone|scoreboard|score-tile|team-head|serve-badge|\.score-number\b|player-line|serving-player|serving-tag|rally-btn|court-board|\bcallout\b|serve-from-card|board-meta|score-controls|summary-layout|result-card|final-score|timeline-event|event-number|event-main|event-call|match-recovery|destructive-confirmation|recovery-match-card|recovery-score-line|recovery-actions|\.dialog\s+[hp2]|\.modal\s+[hp2])/;

// Surfaces belonging to other batches
const OTHER_BATCHES = /(?:\.live-score-card|\.live-score-overlay|\.top-player|\.live-next|\.live-court-subhead|\.live-court-state-detail|\.tournament-summary-card|\.format-estimate|\.round-group|\.match-result-pill|\.history-score|\.hero-court|auth-|login-|side-nav|side-brand|side-logo|side-menu|side-footer|sidebar|topbar|top-user|top-logout|menu-toggle)/;

test("match, court, scoreboard, summary, and dialog styles use only semantic tokens", () => {
  const offenders = [];
  for (const rule of rules) {
    if (!MATCH_AND_COURT.test(rule.selector)) continue;
    // Exclude rules that belong to unmigrated batches
    if (OTHER_BATCHES.test(rule.selector)) continue;
    for (const { prop, value } of rule.declarations) {
      if (legacyReference.test(value) || rawColor.test(value)) {
        offenders.push(`${rule.selector} { ${prop}: ${value} }`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("the single court model is expressed through named court tokens", () => {
  for (const name of [
    "--court-surface-ground",
    "--court-kitchen-ground",
    "--court-line-color",
    "--court-net-color",
  ]) {
    assert.ok(tokens[name], `${name} is defined in :root`);
  }

  const sharedCourt = rules.find((r) => /^\.court-preview,\s*\.live-court$/.test(r.selector));
  assert.ok(sharedCourt, ".court-preview and .live-court define the shared model");
  const declarations = Object.fromEntries(sharedCourt.declarations.map((d) => [d.prop, d.value]));
  assert.equal(declarations["--court-surface"], "var(--court-surface-ground)");
  assert.equal(declarations["--court-kitchen"], "var(--court-kitchen-ground)");
  assert.equal(declarations["--court-line"], "var(--court-line-color)");
  assert.equal(declarations["--court-net"], "var(--court-net-color)");
});

test("missing match, scoreboard, court, summary, and dialog roles have named semantic tokens", () => {
  for (const name of [
    "--surface-card-dark",
    "--surface-preview-score",
    "--surface-court-label",
    "--surface-service-zone",
    "--surface-court-card",
    "--surface-board-meta-row",
    "--surface-rally-alt",
    "--surface-rally-hover",
    "--surface-rally-alt-hover",
    "--surface-segment-hover",
    "--surface-dialog-overlay",
    "--surface-switch-off",
    "--border-court-card",
    "--border-dialog",
    "--border-serving",
    "--glow-serving",
    "--shadow-service-active",
    "--color-on-dark-secondary",
    "--color-on-dark-subtle",
    "--color-on-dark-readable",
    "--color-on-dark-score",
  ]) {
    assert.ok(tokens[name], `${name} is defined in :root`);
  }
});

test("original brand variables still exist so unmigrated screens keep working", () => {
  for (const name of LEGACY) assert.ok(tokens[name], `${name} is still defined`);
});
