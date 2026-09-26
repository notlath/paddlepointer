const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8").replace(/\r\n/g, "\n");

test("app.js defines player skill actions and definitions", () => {
  assert.match(appCode, /data-action=['"]set-player-skill['"]/);
  assert.match(appCode, /learning the rules and serve; rallies are short/);
  assert.match(appCode, /consistent serves and returns, starting to dink and stack/);
  assert.match(appCode, /controls pace and placement, plays the kitchen deliberately/);
});

test("renderPlayerRow renders Skill Level picker with level descriptions", () => {
  const renderRowDef = appCode.match(/function renderPlayerRow\(player\) \{[\s\S]*?\n  \}/);
  assert.ok(renderRowDef, "renderPlayerRow must be defined");

  const skillDefsDef = appCode.match(/const SKILL_LEVEL_DEFINITIONS = [\s\S]*?\];/);
  assert.ok(skillDefsDef, "SKILL_LEVEL_DEFINITIONS must be defined");

  const fn = new Function(
    "state",
    "escapeHtml",
    "escapeAttr",
    `${skillDefsDef[0]}; ${renderRowDef[0]}; return renderPlayerRow;`
  );

  const escapeHtml = (s) => String(s);
  const escapeAttr = (s) => String(s);

  // Unrated player
  const unratedPlayer = { id: 1, name: "Unrated Joe", skillLevel: null, matchCount: 3, eventCount: 1, hasAccount: false };
  const stateView = { renamePlayerForm: null };
  const htmlUnrated = fn(stateView, escapeHtml, escapeAttr)(unratedPlayer);

  assert.ok(htmlUnrated.includes('data-action="set-player-skill"'));
  assert.ok(htmlUnrated.includes('data-player-id="1"'));
  assert.ok(htmlUnrated.includes("learning the rules and serve; rallies are short"));
  assert.ok(htmlUnrated.includes("consistent serves and returns, starting to dink and stack"));
  assert.ok(htmlUnrated.includes("controls pace and placement, plays the kitchen deliberately"));
  assert.ok(htmlUnrated.includes('<option value="" selected>'));

  // Intermediate player
  const ratedPlayer = { id: 2, name: "Pro Sally", skillLevel: "intermediate", matchCount: 10, eventCount: 3, hasAccount: true };
  const htmlRated = fn(stateView, escapeHtml, escapeAttr)(ratedPlayer);
  assert.ok(htmlRated.includes('<option value="intermediate" selected>'));
});

test("setPlayerSkill posts to /set-player-skill.php and updates player skill level in state", async () => {
  let fetchedUrl = null;
  let fetchedBody = null;
  let toastMsg = null;
  let updatedCalled = false;

  const mockState = {
    players: [
      { id: 10, name: "Sally", skillLevel: null },
      { id: 20, name: "Bob", skillLevel: "beginner" },
    ],
  };

  const isStaff = () => true;
  const update = () => { updatedCalled = true; };
  const showToast = (msg) => { toastMsg = msg; };
  const session = { headers: () => ({ Authorization: "Bearer test" }) };
  const API_BASE = "api";

  const fakeFetch = async (url, options) => {
    fetchedUrl = url;
    fetchedBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ ok: true, player: { id: 10, name: "Sally", skillLevel: "intermediate" } }),
    };
  };

  const skillDefsDef = appCode.match(/const SKILL_LEVEL_DEFINITIONS = [\s\S]*?\];/);
  const formatSkillLevelDef = appCode.match(/function formatSkillLevel\(level\) \{[\s\S]*?\n  \}/);
  const setPlayerSkillDef = appCode.match(/async function setPlayerSkill\(playerId, skillLevel\) \{[\s\S]*?\n  \}/);
  assert.ok(setPlayerSkillDef, "setPlayerSkill must be defined");

  const runner = new Function(
    "state",
    "isStaff",
    "update",
    "showToast",
    "session",
    "API_BASE",
    "fetch",
    `${skillDefsDef[0]}; ${formatSkillLevelDef[0]}; ${setPlayerSkillDef[0]}; return setPlayerSkill;`
  )(
    mockState,
    isStaff,
    update,
    showToast,
    session,
    API_BASE,
    fakeFetch
  );

  await runner(10, "intermediate");

  assert.equal(fetchedUrl, "api/set-player-skill.php");
  assert.deepEqual(fetchedBody, { id: 10, skillLevel: "intermediate" });
  assert.equal(mockState.players[0].skillLevel, "intermediate");
  assert.equal(toastMsg, "Sally set to Intermediate");
  assert.equal(updatedCalled, true);
});

test("Tournament setup displays rostered players' skill levels", () => {
  const renderRosteredDef = appCode.match(/function renderRosteredPlayers\(players\) \{[\s\S]*?\n  \}/);
  assert.ok(renderRosteredDef, "renderRosteredPlayers must be defined");

  const skillDefsDef = appCode.match(/const SKILL_LEVEL_DEFINITIONS = [\s\S]*?\];/);
  const formatSkillLevelDef = appCode.match(/function formatSkillLevel\(level\) \{[\s\S]*?\n  \}/);
  const normalizeKeyDef = appCode.match(/function normalizePlayerNameKey\(value\) \{[\s\S]*?\n  \}/);

  const mockState = {
    players: [
      { id: 1, name: "Alice", skillLevel: "advanced" },
      { id: 2, name: "Bob", skillLevel: "beginner" },
      { id: 3, name: "Charlie", skillLevel: null },
    ],
  };

  const isStaff = () => true;
  const escapeHtml = (s) => String(s);
  const escapeAttr = (s) => String(s);

  const fn = new Function(
    "state",
    "isStaff",
    "escapeHtml",
    "escapeAttr",
    `${skillDefsDef[0]}; ${formatSkillLevelDef[0]}; ${normalizeKeyDef[0]}; ${renderRosteredDef[0]}; return renderRosteredPlayers;`
  )(
    mockState,
    isStaff,
    escapeHtml,
    escapeAttr
  );

  const html = fn(["Alice", "Bob", "Charlie", "Dave"]);
  assert.ok(html.includes("Alice"));
  assert.ok(html.includes("Advanced"));
  assert.ok(html.includes("Bob"));
  assert.ok(html.includes("Beginner"));
  assert.ok(html.includes("Charlie"));
  assert.ok(html.includes("Unrated"));
  assert.ok(html.includes("Dave")); // not in players table yet -> unrated
  assert.ok(html.includes('data-rostered-players'));
});
