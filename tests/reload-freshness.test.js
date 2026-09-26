const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");

test("the Qlik reload cue is a live 'Updated Xs ago' on the dashboard and Analytics", () => {
  assert.doesNotMatch(appCode, /Last reloaded:|Data reloaded:/);
  assert.equal((appCode.match(/renderReloadCue\(\)/g) || []).length, 3); // definition + two views
  assert.match(appCode, /data-reload-ago/);
  assert.match(appCode, /el\.textContent = formatFreshness\(state\.qlikReloadedAt\)/);
});

test("the reload time is re-read on a timer, without redrawing the page unless a reload landed", () => {
  const fetchStart = appCode.indexOf("async function fetchQlikReloadTime");
  const fetchBody = appCode.slice(fetchStart, appCode.indexOf("async function fetchUsers", fetchStart));
  assert.doesNotMatch(fetchBody, /!isStaff\(\) \|\| state\.qlikReloadTime/); // no longer once per page load
  assert.match(fetchBody, /reloadTime === state\.qlikReloadTime\)\s*return/);
});

test("the watch runs only on views showing Qlik data and pauses while the page is hidden", () => {
  assert.match(appCode, /state\.view === "analytics" \|\| state\.view === "home"/);
  assert.match(appCode, /if \(document\.hidden \|\| !reloadWatchActive\(\)\) return;/);
  assert.match(appCode, /document\.addEventListener\("visibilitychange"/);
  assert.match(appCode, /syncReloadWatchLoop\(\);/);
});
