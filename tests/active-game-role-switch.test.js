const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8").replace(/\r\n/g, "\n");

function source(name) {
  const found = appCode.match(new RegExp(`\\n  function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}`));
  assert.ok(found, `app.js must define ${name}`);
  return found[0];
}

// Boots the real sign-in cleanup, active-game storage and Match card against one shared browser storage.
function loadApp() {
  const store = new Map();
  const window = {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
  };
  const names = [
    "clearUnavailableActiveGameForRole",
    "isVisitorGame",
    "isVisitorGameForUser",
    "saveActiveGame",
    "loadActiveGame",
    "clearActiveGame",
    "tournamentPrimaryMatchId",
    "renderTournamentMatch",
  ];
  return new Function(
    "window",
    `const ACTIVE_KEY = "ac-pickle-score-active-v1";
     const state = { currentGame: null, tournament: { matches: [] }, undoStack: [] };
     let signedIn = null;
     const session = { user: () => signedIn };
     const showToast = () => {};
     const escapeHtml = (value) => String(value);
     const escapeAttr = escapeHtml;
     ${names.map(source).join("\n")}
     return {
       state,
       startMatch(user, game, match) {
         signedIn = user;
         state.currentGame = game;
         state.tournament.matches = [match];
         saveActiveGame();
       },
       signIn(user) {
         signedIn = user;
         clearUnavailableActiveGameForRole(user);
       },
       renderTournamentMatch,
     };`,
  )(window);
}

const admin1 = { id: 1, username: "admin1", displayName: "Admin1", role: "admin" };
const player = { id: 2, username: "player1", displayName: "Player1", role: "player" };
const visitor = { id: 3, username: "guest@example.com", displayName: "Guest", role: "visitor" };

const game = {
  id: "game-1",
  status: "active",
  createdBy: admin1,
  tournamentMatch: { tournamentId: "open_play", matchId: "r1c1" },
};
const match = {
  id: "r1c1",
  round: 1,
  court: 1,
  status: "in_progress",
  teamA: ["A1", "A2"],
  teamB: ["B1", "B2"],
  startedBy: { id: 1, displayName: "Admin1" },
};

for (const other of [player, visitor]) {
  test(`Admin1 can resume their Match after a ${other.role} signs in on the same browser`, () => {
    const app = loadApp();
    app.startMatch(admin1, game, match);

    app.signIn(other);
    assert.equal(app.state.currentGame, null, `a ${other.role} does not see the Admin's active Match`);

    app.signIn(admin1);
    const card = app.renderTournamentMatch(match);
    assert.match(card, /data-action="resume-game"/, "Admin1 is offered Resume Match");
  });
}
