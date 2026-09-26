const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8").replace(/\r\n/g, "\n");

test("app.js defines player rename actions and state", () => {
  assert.match(appCode, /if \(action === "start-rename-player"\) startRenamePlayer\(value\);/);
  assert.match(appCode, /if \(action === "cancel-rename-player"\) cancelRenamePlayer\(\);/);
  assert.match(appCode, /if \(action === "save-rename-player"\) saveRenamePlayer\(\);/);
  assert.match(appCode, /renamePlayerForm: null,/);
});

test("renderPlayerRow renders Rename button in view mode and inline form in edit mode", () => {
  const renderRowDef = appCode.match(/function renderPlayerRow\(player\) \{[\s\S]*?\n  \}/);
  assert.ok(renderRowDef, "renderPlayerRow must be defined");

  const fn = new Function(
    "state",
    "escapeHtml",
    "escapeAttr",
    "SKILL_LEVEL_DEFINITIONS",
    `${renderRowDef[0]}; return renderPlayerRow;`
  );

  const escapeHtml = (s) => String(s);
  const escapeAttr = (s) => String(s);
  const player = { id: 1, name: "Jomar Ebonite", matchCount: 5, eventCount: 2, hasAccount: true };

  // View mode
  const stateView = { renamePlayerForm: null };
  const viewHtml = fn(stateView, escapeHtml, escapeAttr, [])(player);
  assert.ok(viewHtml.includes('data-action="start-rename-player"'));
  assert.ok(viewHtml.includes('data-value="1"'));
  assert.ok(viewHtml.includes("Jomar Ebonite"));

  // Edit mode
  const stateEdit = { renamePlayerForm: { id: 1, name: "Jom Ebonite", pending: false, failure: "" } };
  const editHtml = fn(stateEdit, escapeHtml, escapeAttr, [])(player);
  assert.ok(editHtml.includes("data-rename-player-field"));
  assert.ok(editHtml.includes('value="Jom Ebonite"'));
  assert.ok(editHtml.includes('data-action="save-rename-player"'));
  assert.ok(editHtml.includes('data-action="cancel-rename-player"'));
});

test("saveRenamePlayer posts to /rename-player.php and updates players list", async () => {
  let fetchedUrl = null;
  let fetchedBody = null;
  let historyRefreshed = false;
  let leaderboardRefreshed = false;
  let tournamentRefreshed = false;
  let toastMsg = null;

  const mockState = {
    players: [{ id: 10, name: "Old Name" }],
    renamePlayerForm: { id: 10, name: "New Name", pending: false, failure: "" },
  };

  const isStaff = () => true;
  const cleanName = (val) => String(val || "").trim();
  const renderNowAndFocus = () => {};
  const update = () => {};
  const showToast = (msg) => { toastMsg = msg; };
  const session = { headers: () => ({ Authorization: "Bearer test" }) };
  const API_BASE = "api";
  const refreshSharedHistory = () => { historyRefreshed = true; };
  const refreshSharedLeaderboard = () => { leaderboardRefreshed = true; };
  const refreshSharedTournament = () => { tournamentRefreshed = true; };

  const fakeFetch = async (url, options) => {
    fetchedUrl = url;
    fetchedBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ ok: true, player: { id: 10, name: "New Name" } }),
    };
  };

  const saveRenamePlayerDef = appCode.match(/async function saveRenamePlayer\(\) \{[\s\S]*?\n  \}/);
  assert.ok(saveRenamePlayerDef, "saveRenamePlayer must be defined");

  const runner = new Function(
    "state",
    "isStaff",
    "cleanName",
    "renderNowAndFocus",
    "update",
    "showToast",
    "session",
    "API_BASE",
    "fetch",
    "refreshSharedHistory",
    "refreshSharedLeaderboard",
    "refreshSharedTournament",
    `${saveRenamePlayerDef[0]}; return saveRenamePlayer;`
  )(
    mockState,
    isStaff,
    cleanName,
    renderNowAndFocus,
    update,
    showToast,
    session,
    API_BASE,
    fakeFetch,
    refreshSharedHistory,
    refreshSharedLeaderboard,
    refreshSharedTournament
  );

  await runner();

  assert.equal(fetchedUrl, "api/rename-player.php");
  assert.deepEqual(fetchedBody, { id: 10, name: "New Name" });
  assert.equal(mockState.players[0].name, "New Name");
  assert.equal(mockState.renamePlayerForm, null);
  assert.equal(toastMsg, "Renamed to New Name");
  assert.equal(historyRefreshed, true);
  assert.equal(leaderboardRefreshed, true);
  assert.equal(tournamentRefreshed, true);
});
