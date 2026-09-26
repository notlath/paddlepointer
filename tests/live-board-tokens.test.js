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

// Live Board, court cards, score overlay, top players, next match, and TV mode
const LIVE_BOARD_AND_TV = /(?:\.live-section-head|\.live-board-tab|\.live-court-subhead|\.live-score-card|\.live-court-state|\.live-card-refresh|\.live-score-admin|\.live-starting|\.live-score-number|\.live-score-meta|\.live-score-overlay|\.live-close|\.top-player|\.trophy|\.live-next-match|\.live-side-panel.*leaderboard-card-head|body\.live-tv-mode|\.live-tv-mode)/;

// Generic and unmigrated rules belonging to other batches
const UNMIGRATED_OR_SHARED = /(?:\.button|\.input|\.label|\.panel|\.tournament|\.format|\.round|\.match-card|\.history|\.admin|\.lead-status-card)/;

test("Live Board and TV mode styles reference semantic tokens instead of original brand variables or raw colors", () => {
  const offenders = [];
  for (const rule of rules) {
    if (!LIVE_BOARD_AND_TV.test(rule.selector)) continue;
    if (UNMIGRATED_OR_SHARED.test(rule.selector)) continue;
    for (const { prop, value } of rule.declarations) {
      if (legacyReference.test(value) || rawColor.test(value)) {
        offenders.push(`${rule.selector} { ${prop}: ${value} }`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("court-card state surfaces are expressed through named state tokens", () => {
  const states = ["ongoing", "upcoming", "final", "available", "unscheduled", "loading", "failed"];
  for (const state of states) {
    assert.ok(
      tokens[`--surface-court-card-${state}`],
      `--surface-court-card-${state} must be defined in :root`
    );
    assert.ok(
      tokens[`--border-court-card-${state}`],
      `--border-court-card-${state} must be defined in :root`
    );
  }

  // Verify court cards reference these tokens
  const cardRules = rules.filter((r) => r.selector.includes(".live-score-card"));
  const cardDeclarations = cardRules.flatMap((r) => r.declarations.map((d) => d.value));

  for (const state of states) {
    assert.ok(
      cardDeclarations.some((v) => v.includes(`--surface-court-card-${state}`)),
      `court card rules must reference --surface-court-card-${state}`
    );
  }
});

test("missing roles for tab track, podium, trophies, and refresh state have named semantic tokens", () => {
  const requiredTokens = [
    "--surface-tab-track",
    "--surface-rank-badge",
    "--surface-podium",
    "--color-trophy-gold",
    "--shadow-trophy",
    "--color-trophy-silver",
    "--color-trophy-bronze",
    "--color-refresh-state",
    "--color-refresh-state-failed",
    "--color-on-dark-dimmed",
    "--color-on-dark-divider",
    "--border-on-dark"
  ];

  for (const token of requiredTokens) {
    assert.ok(tokens[token], `${token} must be defined in :root`);
  }
});

test("original brand variables still exist in :root for unmigrated surfaces", () => {
  for (const v of LEGACY) {
    assert.ok(tokens[v], `${v} must still be defined in :root for unmigrated screens`);
  }
});
