const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

test("shared destructive dialog is accessible and puts the safe action first", () => {
  assert.match(appCode, /class="destructive-confirmation-overlay" role="alertdialog" aria-modal="true" aria-labelledby="destructive-confirmation-title" aria-describedby="destructive-confirmation-description"/);
  const cancelIndex = appCode.indexOf('data-action="cancel-destructive-confirmation"');
  const confirmIndex = appCode.indexOf('data-action="confirm-destructive-confirmation"');
  assert.ok(cancelIndex > -1 && cancelIndex < confirmIndex);
  assert.match(appCode, /isConfirmation[\s\S]+?cancel-destructive-confirmation/);
  assert.match(css, /\.destructive-confirmation-actions\s*\{[\s\S]+?gap:\s*var\(--space-5\)[\s\S]+?border-top:/);
});

test("every destructive action routes through the shared confirmation", () => {
  assert.equal((appCode.match(/requestDestructiveConfirmation\s*\(\{/g) || []).length, 10);
  assert.match(appCode, /title:\s*`Merge \$\{absorbed\.name\} into \$\{survivor\.name\}\?`/);
  assert.match(appCode, /title:\s*`Take over \$\{/);
  assert.match(appCode, /title:\s*`Reset \$\{gameTitle\(game\)\}\?`/);
  assert.match(appCode, /title:\s*`Which Team retired or forfeited\?`/);
  assert.match(appCode, /title:\s*`Replace \$\{gameTitle\(game\)\}\?`/);
  assert.match(appCode, /title:\s*`Reset \$\{tournamentName\}\?`/);
  assert.match(appCode, /title:\s*`Start '\$\{name\}'\?`/);
  assert.match(appCode, /title:\s*`Clear results for \$\{tournamentName\}\?`/);
  assert.match(appCode, /title:\s*`Delete \$\{accountName\}\?`/);
  assert.match(appCode, /title:\s*"Clear local History cache\?"/);
  assert.match(appCode, /account \$\{user\.username\} will be permanently removed\. This cannot be undone\./);
  assert.match(appCode, /cached Match History from this browser only\. Shared database records are not deleted/);
  assert.match(appCode, /Local history cache could not be cleared\. Shared database records were not changed\./);
});

test("replacing an active Match is confirmed before Tournament refresh can change state", () => {
  const start = appCode.indexOf("async function startTournamentMatch");
  const end = appCode.indexOf("function resumeGame", start);
  const source = appCode.slice(start, end);
  assert.ok(source.indexOf("requestReplaceActive") < source.indexOf("refreshSharedTournament"));
});

test("Clear Local History waits for refresh before restoring focus", () => {
  const start = appCode.indexOf("function clearHistory");
  const end = appCode.indexOf("async function openHistorySummary", start);
  assert.match(appCode.slice(start, end), /async\s*\(\)\s*=>[\s\S]+?await refreshSharedHistory\(false\)/);
});

test("browser application has no native confirmation calls", () => {
  const scripts = Array.from(html.matchAll(/<script[^>]+src="([^"?]+)(?:\?[^\"]*)?"/g), (match) => match[1]);
  const offenders = scripts.filter((script) => {
    const source = fs.readFileSync(path.join(__dirname, "..", script), "utf8")
      .replace(/\bfunction\s+confirm\s*\(/g, "function internalConfirm(");
    return /\b(?:window|globalThis|self)\s*\.\s*confirm\s*\(|(?<![\w$.])confirm\s*\(/.test(source);
  });
  assert.deepEqual(offenders, []);
});
