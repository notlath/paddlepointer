const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8").replace(/\r\n/g, "\n");

test("app.js defines player merge actions and state", () => {
  assert.match(appCode, /if \(action === "start-merge-player"\) startMergePlayer\(value\);/);
  assert.match(appCode, /if \(action === "cancel-merge-player"\) cancelMergePlayer\(\);/);
  assert.match(appCode, /if \(action === "confirm-merge-player"\) confirmMergePlayer\(/);
  assert.match(appCode, /mergePlayerForm: null,/);
});

test("renderPlayerRow renders Merge button in view mode and inline survivor picker in merge mode", () => {
  const renderRowDef = appCode.match(/function renderPlayerRow\(player\) \{[\s\S]*?\n  \}/);
  assert.ok(renderRowDef, "renderPlayerRow must be defined");

  const SKILL_LEVEL_DEFINITIONS = [
    { value: "", label: "Unrated" },
    { value: "beginner", label: "Beginner" },
    { value: "intermediate", label: "Intermediate" },
    { value: "advanced", label: "Advanced" },
  ];

  const fn = new Function(
    "state",
    "escapeHtml",
    "escapeAttr",
    "SKILL_LEVEL_DEFINITIONS",
    `${renderRowDef[0]}; return renderPlayerRow;`
  );

  const escapeHtml = (s) => String(s);
  const escapeAttr = (s) => String(s);
  const player1 = { id: 1, name: "Jomar E.", matchCount: 3, eventCount: 1, hasAccount: false };
  const player2 = { id: 2, name: "Jomar Ebonite", matchCount: 5, eventCount: 2, hasAccount: true };

  // View mode
  const stateView = { renamePlayerForm: null, mergePlayerForm: null, players: [player1, player2] };
  const viewHtml = fn(stateView, escapeHtml, escapeAttr, SKILL_LEVEL_DEFINITIONS)(player1);
  assert.ok(viewHtml.includes('data-action="start-merge-player"'), "Must include start-merge-player button");
  assert.ok(viewHtml.includes('data-value="1"'), "Must have player id in data-value");
  assert.ok(viewHtml.includes('data-action="start-rename-player"'), "Must still include Rename button");

  // Merge mode on player 1 (absorbed)
  const stateMerge = {
    renamePlayerForm: null,
    mergePlayerForm: { absorbedId: 1, survivorId: 2, pending: false, failure: "" },
    players: [player1, player2],
  };
  const mergeHtml = fn(stateMerge, escapeHtml, escapeAttr, SKILL_LEVEL_DEFINITIONS)(player1);
  assert.ok(mergeHtml.includes("data-merge-survivor-select"), "Must include survivor select element");
  assert.ok(mergeHtml.includes('data-action="confirm-merge-player"'), "Must include confirm-merge-player button");
  assert.ok(mergeHtml.includes('data-action="cancel-merge-player"'), "Must include cancel-merge-player button");
  assert.ok(mergeHtml.includes("Jomar Ebonite"), "Survivor candidate must be in options");
});

test("confirmMergePlayer opens destructive confirmation naming both players and stating cannot be undone", () => {
  let requestedConfirmation = null;
  const mockState = {
    players: [
      { id: 1, name: "Jomar E." },
      { id: 2, name: "Jomar Ebonite" },
    ],
    mergePlayerForm: { absorbedId: 1, survivorId: 2, pending: false, failure: "" },
  };

  const isStaff = () => true;
  const requestDestructiveConfirmation = (details, onConfirm, trigger) => {
    requestedConfirmation = details;
  };

  const confirmMergePlayerDef = appCode.match(/function confirmMergePlayer\(trigger\) \{[\s\S]*?\n  \}/);
  assert.ok(confirmMergePlayerDef, "confirmMergePlayer must be defined");

  const runner = new Function(
    "state",
    "isStaff",
    "requestDestructiveConfirmation",
    `${confirmMergePlayerDef[0]}; return confirmMergePlayer;`
  )(mockState, isStaff, requestDestructiveConfirmation);

  runner();

  assert.ok(requestedConfirmation, "requestDestructiveConfirmation was called");
  const fullText = `${requestedConfirmation.title} ${requestedConfirmation.description}`;
  assert.ok(fullText.includes("Jomar E."), "Confirmation must name absorbed Player");
  assert.ok(fullText.includes("Jomar Ebonite"), "Confirmation must name surviving Player");
  assert.ok(
    fullText.toLowerCase().includes("cannot be undone"),
    "Confirmation must say the merge cannot be undone"
  );
});

test("executeMergePlayers posts to /merge-players.php and updates players list and views", async () => {
  let fetchedUrl = null;
  let fetchedBody = null;
  let historyRefreshed = false;
  let leaderboardRefreshed = false;
  let tournamentRefreshed = false;
  let playersRefreshed = false;
  let toastMsg = null;

  const mockState = {
    players: [
      { id: 1, name: "Jomar E.", matchCount: 2, eventCount: 1, hasAccount: false },
      { id: 2, name: "Jomar Ebonite", matchCount: 4, eventCount: 2, hasAccount: true, skillLevel: null },
    ],
    mergePlayerForm: { absorbedId: 1, survivorId: 2, pending: false, failure: "" },
  };

  const isStaff = () => true;
  const update = () => {};
  const showToast = (msg) => { toastMsg = msg; };
  const session = { headers: () => ({ Authorization: "Bearer test" }) };
  const API_BASE = "api";
  const refreshSharedHistory = () => { historyRefreshed = true; };
  const refreshSharedLeaderboard = () => { leaderboardRefreshed = true; };
  const refreshSharedTournament = () => { tournamentRefreshed = true; };
  const fetchPlayers = () => { playersRefreshed = true; };

  const fakeFetch = async (url, options) => {
    fetchedUrl = url;
    fetchedBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        ok: true,
        survivor: { id: 2, name: "Jomar Ebonite", skillLevel: "intermediate" },
        absorbed: { id: 1, name: "Jomar E." },
      }),
    };
  };

  const executeMergeDef = appCode.match(/async function executeMergePlayers\(\) \{[\s\S]*?\n  \}/);
  assert.ok(executeMergeDef, "executeMergePlayers must be defined");

  const runner = new Function(
    "state",
    "isStaff",
    "update",
    "showToast",
    "session",
    "API_BASE",
    "fetch",
    "refreshSharedHistory",
    "refreshSharedLeaderboard",
    "refreshSharedTournament",
    "fetchPlayers",
    `${executeMergeDef[0]}; return executeMergePlayers;`
  )(
    mockState,
    isStaff,
    update,
    showToast,
    session,
    API_BASE,
    fakeFetch,
    refreshSharedHistory,
    refreshSharedLeaderboard,
    refreshSharedTournament,
    fetchPlayers
  );

  await runner();

  assert.equal(fetchedUrl, "api/merge-players.php");
  assert.deepEqual(fetchedBody, { survivorId: 2, absorbedId: 1 });
  assert.equal(mockState.mergePlayerForm, null, "mergePlayerForm cleared");
  assert.equal(mockState.players.length, 1, "Absorbed player removed from state.players");
  assert.equal(mockState.players[0].id, 2, "Survivor remains in state.players");
  assert.equal(mockState.players[0].skillLevel, "intermediate", "Survivor skillLevel updated");
  assert.ok(toastMsg.includes("Merged"), "Toast feedback shown");
  assert.ok(historyRefreshed, "History refreshed");
  assert.ok(leaderboardRefreshed, "Leaderboard refreshed");
  assert.ok(tournamentRefreshed, "Tournament refreshed");
  assert.ok(playersRefreshed, "Players list reloaded so the survivor's Match and Event counts come from the server");
});
