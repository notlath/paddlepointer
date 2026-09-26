const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

let setupValidation;
try {
  setupValidation = require("../setup-validation.js");
} catch (e) {
  setupValidation = null;
}

const { setupErrors, applyVisitorPrefill, PLACEHOLDER_NAMES } = setupValidation || {};

test("setup-validation module exports setupErrors, applyVisitorPrefill, and PLACEHOLDER_NAMES", () => {
  assert.ok(setupValidation, "setup-validation.js module must exist");
  assert.equal(typeof setupErrors, "function", "setupErrors must be a function");
  assert.equal(typeof applyVisitorPrefill, "function", "applyVisitorPrefill must be a function");
  assert.ok(PLACEHOLDER_NAMES instanceof Set, "PLACEHOLDER_NAMES must be a Set");
});

test("singles requires one nonblank player name for each team", () => {
  assert.deepEqual(
    setupErrors({ type: "singles", teamAPlayer1: "Alice", teamBPlayer1: "Bob" }),
    {},
    "Valid singles players report no errors"
  );

  const missingA = setupErrors({ type: "singles", teamAPlayer1: "", teamBPlayer1: "Bob" });
  assert.deepEqual(missingA, { teamAPlayer1: "Enter a player name" });

  const whitespaceA = setupErrors({ type: "singles", teamAPlayer1: "   ", teamBPlayer1: "Bob" });
  assert.deepEqual(whitespaceA, { teamAPlayer1: "Enter a player name" });

  const missingB = setupErrors({ type: "singles", teamAPlayer1: "Alice", teamBPlayer1: "" });
  assert.deepEqual(missingB, { teamBPlayer1: "Enter a player name" });

  const missingBoth = setupErrors({ type: "singles", teamAPlayer1: "", teamBPlayer1: "" });
  assert.deepEqual(missingBoth, {
    teamAPlayer1: "Enter a player name",
    teamBPlayer1: "Enter a player name",
  });
  assert.deepEqual(Object.keys(missingBoth), ["teamAPlayer1", "teamBPlayer1"], "Errors must follow DOM field order");
});

test("doubles requires two nonblank player names for each team", () => {
  assert.deepEqual(
    setupErrors({
      type: "doubles",
      teamAPlayer1: "Alice",
      teamAPlayer2: "Amy",
      teamBPlayer1: "Bob",
      teamBPlayer2: "Bill",
    }),
    {},
    "Valid doubles players report no errors"
  );

  const missingAll = setupErrors({ type: "doubles" });
  assert.deepEqual(Object.keys(missingAll), [
    "teamAPlayer1",
    "teamAPlayer2",
    "teamBPlayer1",
    "teamBPlayer2",
  ]);
  assert.equal(missingAll.teamAPlayer1, "Enter a player name");
  assert.equal(missingAll.teamAPlayer2, "Enter a player name");
  assert.equal(missingAll.teamBPlayer1, "Enter a player name");
  assert.equal(missingAll.teamBPlayer2, "Enter a player name");

  const missingA2 = setupErrors({
    type: "doubles",
    teamAPlayer1: "Alice",
    teamAPlayer2: "",
    teamBPlayer1: "Bob",
    teamBPlayer2: "Bill",
  });
  assert.deepEqual(missingA2, { teamAPlayer2: "Enter a player name" });
});

test("names that differ only by surrounding whitespace or letter case are treated as duplicates", () => {
  // Singles duplicate
  const singlesExact = setupErrors({ type: "singles", teamAPlayer1: "Alice", teamBPlayer1: "Alice" });
  assert.deepEqual(singlesExact, { teamBPlayer1: "Player names must be unique" });

  const singlesCase = setupErrors({ type: "singles", teamAPlayer1: "Alice", teamBPlayer1: "  aLiCe  " });
  assert.deepEqual(singlesCase, { teamBPlayer1: "Player names must be unique" });

  // Doubles same-team duplicate
  const doublesSameTeam = setupErrors({
    type: "doubles",
    teamAPlayer1: "Alice",
    teamAPlayer2: "alice",
    teamBPlayer1: "Bob",
    teamBPlayer2: "Bill",
  });
  assert.deepEqual(doublesSameTeam, { teamAPlayer2: "Player names must be unique" });

  // Doubles across-team duplicate
  const doublesCrossTeam = setupErrors({
    type: "doubles",
    teamAPlayer1: "Alice",
    teamAPlayer2: "Amy",
    teamBPlayer1: "Bob",
    teamBPlayer2: "   ALICE   ",
  });
  assert.deepEqual(doublesCrossTeam, { teamBPlayer2: "Player names must be unique" });

  // Multiple duplicates
  const multipleDups = setupErrors({
    type: "doubles",
    teamAPlayer1: "Alice",
    teamAPlayer2: "Bob",
    teamBPlayer1: "alice",
    teamBPlayer2: "BOB",
  });
  assert.deepEqual(multipleDups, {
    teamBPlayer1: "Player names must be unique",
    teamBPlayer2: "Player names must be unique",
  });
});

test("placeholder labels are rejected as input identities", () => {
  const placeholders = ["Player 1", "Player 2", "A - Player 1", "A - Player 2", "B - Player 1", "B - Player 2"];
  for (const placeholder of placeholders) {
    const res = setupErrors({ type: "singles", teamAPlayer1: placeholder, teamBPlayer1: "Alice" });
    assert.equal(res.teamAPlayer1, "Enter a real player name", `Expected "${placeholder}" to be rejected as real player identity`);
  }
});

test("app.js and index.html wire up setup validation and prevent starting match on invalid setup", () => {
  const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

  assert.match(html, /<script\s+src=["']setup-validation\.js\?v=[^"']+["']\s+defer><\/script>/);
  assert.match(appCode, /setupErrors/);
  assert.match(appCode, /state\.setupErrors/);
  assert.match(appCode, /setupFieldAttrs\("teamAPlayer1"\)/);
  assert.match(appCode, /setupFieldError\("teamAPlayer1"\)/);
  assert.match(appCode, /aria-invalid="true"/);
});

test("Visitor display name is prefilled only when teamAPlayer1 is blank without overwriting entered data", () => {
  const user = { displayName: "Jane Visitor", role: "visitor" };

  // Blank teamAPlayer1 -> prefilled
  const prefilled = applyVisitorPrefill({ teamAPlayer1: "" }, user, true);
  assert.equal(prefilled.teamAPlayer1, "Jane Visitor");

  // Whitespace only -> prefilled
  const whitespace = applyVisitorPrefill({ teamAPlayer1: "   " }, user, true);
  assert.equal(whitespace.teamAPlayer1, "Jane Visitor");

  // Already entered data -> NOT overwritten
  const preserved = applyVisitorPrefill({ teamAPlayer1: "Carlos" }, user, true);
  assert.equal(preserved.teamAPlayer1, "Carlos");

  // Does not mutate scorerName or other setup properties
  const withScorer = applyVisitorPrefill({ scorerName: "Court 4", teamAPlayer1: "" }, user, true);
  assert.equal(withScorer.scorerName, "Court 4");
  assert.equal(withScorer.teamAPlayer1, "Jane Visitor");

  // If visitor name already entered in another slot (e.g. teamBPlayer1), do NOT prefill teamAPlayer1
  const inTeamB = applyVisitorPrefill({ teamAPlayer1: "", teamBPlayer1: "Jane Visitor" }, user, true);
  assert.equal(inTeamB.teamAPlayer1, "");

  // Non-visitor -> NOT prefilled
  const adminUser = { displayName: "Super Admin", role: "super_admin" };
  const adminSetup = applyVisitorPrefill({ teamAPlayer1: "" }, adminUser, false);
  assert.equal(adminSetup.teamAPlayer1, "");
});

