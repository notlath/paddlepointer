const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

test("the default-password reminder is limited to the Super Admin and links to Profile", () => {
  const dashboard = app.slice(app.indexOf("function renderAdminDashboard"), app.indexOf("function renderProfile"));
  assert.match(dashboard, /isSuperAdmin\(\) && session\.user\(\)\?\.usingDefaultPassword/);
  assert.match(dashboard, /data-value=\\?"profile/);
});

test("the Scoreboard sends its saved scoring claim and retires after a transfer", () => {
  assert.match(app, /game\.scoringClaim = result\.match\?\.scoringClaim/g);
  assert.match(app, /update\.scoringClaim = game\.scoringClaim/);
  assert.match(app, /function retireScoringDevice\(\)[\s\S]*?clearActiveGame\(\)/);
  assert.match(app, /Scoring moved to another device/);
  const completion = app.slice(app.indexOf("async function completeGame"), app.indexOf("async function syncTournamentMatchFromGame"));
  assert.ok(completion.indexOf("await syncTournamentMatchFromGame(game)") < completion.indexOf("saveCompletedGame(game)"));
});

test("CSP blocks inline scripts", () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp);
  assert.match(csp, /script-src 'self' https:\/\/cdn\.jsdelivr\.net/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
});

// @qlik/api loads Qlik's runtime (qlik-embed/main.js) from the tenant, which then fetches an import
// map and scripts from cdn.qlikcloud.com. Blocking either leaves the Analytics view empty.
test("CSP lets the Qlik runtime load", () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  const directive = (name) => csp.match(new RegExp(`${name} ([^;]+)`))?.[1].split(" ") || [];
  for (const host of ["https://mtcmarketing.sg.qlikcloud.com", "https://cdn.qlikcloud.com"]) {
    assert.ok(directive("script-src").includes(host), `script-src allows ${host}`);
    assert.ok(directive("connect-src").includes(host), `connect-src allows ${host}`);
  }
});
