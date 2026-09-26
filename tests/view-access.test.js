const test = require("node:test");
const assert = require("node:assert/strict");

const viewAccess = require("../view-access.js");
const { createSession } = require("../session.js");

// Mirrors api/access_policy.php's permissions_for() for each role, so these tests exercise the
// same shape of "who am I" response the server actually sends.
const ACTIONS = [
  "manage_users",
  "reset_tournament",
  "clear_tournament_games",
  "save_tournament",
  "update_tournament_match",
  "save_game",
  "update_profile",
  "have_password",
  "read_tournament",
  "read_history",
  "read_leaderboard",
  "view_all_history",
  "view_visitor_history",
  "view_own_history",
  "view_players",
];
const PUBLIC_ACTIONS = ["read_tournament", "read_history", "read_leaderboard"];
const ALLOWED_BY_ROLE = {
  super_admin: ["manage_users", "reset_tournament", "clear_tournament_games", "save_tournament", "update_tournament_match", "view_all_history", "view_players", "save_game", "update_profile", "have_password"],
  admin: ["save_tournament", "update_tournament_match", "view_all_history", "view_players", "save_game", "update_profile", "have_password"],
  player: ["update_profile", "view_own_history"],
  visitor: ["save_game", "update_profile", "view_visitor_history"],
};

function permissionsFor(role) {
  const allowed = new Set([...(ALLOWED_BY_ROLE[role] || []), ...PUBLIC_ACTIONS]);
  const permissions = {};
  for (const action of ACTIONS) permissions[action] = allowed.has(action);
  return permissions;
}

const superAdmin = permissionsFor("super_admin");
const admin = permissionsFor("admin");
const player = permissionsFor("player");
const visitor = permissionsFor("visitor");
const signedOut = permissionsFor(null);

test("navigationFor lists each role's views, and nothing for Players or signed-out sessions", () => {
  assert.deepEqual(
    viewAccess.navigationFor(superAdmin).map(([view]) => view),
    ["home", "setup", "live", "history", "leaderboard", "analytics", "tournament", "players", "people", "profile", "rules"]
  );
  assert.deepEqual(viewAccess.navigationFor(admin).map(([view]) => view), ["home", "live", "history", "leaderboard", "analytics", "tournament", "players", "rules"]);
  assert.deepEqual(viewAccess.navigationFor(visitor).map(([view]) => view), ["home", "setup", "history", "leaderboard", "rules"]);
  assert.deepEqual(viewAccess.navigationFor(player), []);
  assert.deepEqual(viewAccess.navigationFor(signedOut), []);
});

test("resolveView sends a Player to home for anything but home and summary with clear feedback", () => {
  assert.deepEqual(viewAccess.resolveView("home", player), { view: "home", message: null });
  assert.deepEqual(viewAccess.resolveView("summary", player), { view: "summary", message: null });
  assert.deepEqual(viewAccess.resolveView("history", player), {
    view: "home",
    message: "Player accounts can view match summaries only",
  });
  assert.deepEqual(viewAccess.resolveView("tournament", player), {
    view: "home",
    message: "Player accounts can view match summaries only",
  });
});

test("resolveView limits a Visitor to their allowed views", () => {
  for (const view of ["home", "setup", "scoreboard", "summary", "history", "leaderboard", "rules"]) {
    assert.deepEqual(viewAccess.resolveView(view, visitor), { view, message: null }, `Visitor may use ${view}`);
  }
  assert.deepEqual(viewAccess.resolveView("tournament", visitor), {
    view: "home",
    message: "Visitor accounts can use New Match, History, Leaderboard, and Rules only",
  });
});

test("resolveView reserves New Match for Super Admins and Visitors", () => {
  assert.deepEqual(viewAccess.resolveView("setup", superAdmin), { view: "setup", message: null });
  assert.deepEqual(viewAccess.resolveView("setup", visitor), { view: "setup", message: null });
  assert.deepEqual(viewAccess.resolveView("setup", admin), { view: "home", message: "New Match is available to Super Admins and Visitors" });
});

test("resolveView keeps Staff-only views away from Players and Super Admin-only views away from Admins", () => {
  for (const view of ["admin", "tournament", "live"]) {
    assert.deepEqual(viewAccess.resolveView(view, admin), { view, message: null }, `Staff may use ${view}`);
    // Both Visitor and Player receive clear feedback when redirected.
    assert.deepEqual(viewAccess.resolveView(view, player), {
      view: "home",
      message: "Player accounts can view match summaries only",
    }, `Player may not use ${view}`);
  }
  assert.deepEqual(viewAccess.resolveView("profile", superAdmin), { view: "profile", message: null });
  assert.deepEqual(viewAccess.resolveView("profile", admin), { view: "home", message: "Super Admin access required" });
  assert.deepEqual(viewAccess.resolveView("people", superAdmin), { view: "people", message: null });
  assert.deepEqual(viewAccess.resolveView("people", admin), { view: "home", message: "Super Admin access required" });
  assert.deepEqual(viewAccess.resolveView("tournament", signedOut), { view: "home", message: "Admin access required" });
});

// The Admin dashboard's "Open Full Analytics" button asks for this view; it was once missing
// from the known views, so every Staff member got "Requested view is not available".
test("resolveView opens Analytics for Staff only", () => {
  assert.deepEqual(viewAccess.resolveView("analytics", admin), { view: "analytics", message: null });
  assert.deepEqual(viewAccess.resolveView("analytics", superAdmin), { view: "analytics", message: null });
  assert.equal(viewAccess.resolveView("analytics", player).view, "home");
  assert.equal(viewAccess.resolveView("analytics", visitor).view, "home");
  assert.deepEqual(viewAccess.resolveView("analytics", signedOut), { view: "home", message: "Admin access required" });
});

test("resolveView opens Players for Staff only", () => {
  assert.deepEqual(viewAccess.resolveView("players", admin), { view: "players", message: null });
  assert.deepEqual(viewAccess.resolveView("players", superAdmin), { view: "players", message: null });
  assert.equal(viewAccess.resolveView("players", player).view, "home");
  assert.equal(viewAccess.resolveView("players", visitor).view, "home");
  assert.deepEqual(viewAccess.resolveView("players", signedOut), { view: "home", message: "Admin access required" });
});

// app.js gates match controls (scoring, undo, tournament match actions) with `!isPlayer()`.
test("isPlayer is true only for Players, so match controls stay open to everyone else", () => {
  assert.equal(viewAccess.isPlayer(superAdmin), false);
  assert.equal(viewAccess.isPlayer(admin), false);
  assert.equal(viewAccess.isPlayer(visitor), false);
  assert.equal(viewAccess.isPlayer(player), true);
});

// A browser using 09's fake session: two storages, a URL, and a fake auth API.
class FakeStorage {
  constructor() {
    this.items = new Map();
  }
  getItem(key) {
    return this.items.has(key) ? this.items.get(key) : null;
  }
  setItem(key, value) {
    this.items.set(key, String(value));
  }
  removeItem(key) {
    this.items.delete(key);
  }
}

function fakeSession(url, replies) {
  return createSession({
    storages: [new FakeStorage(), new FakeStorage()],
    getUrl: () => url,
    replaceUrl: () => {},
    request: async (action) => replies[action],
  });
}

test("each role's session drives navigation and view access from its permissions, not a role list", () => {
  const admins = fakeSession("https://example.test/app/", { login: { token: "t", user: { id: 1, username: "court_admin", displayName: "Court Admin", role: "admin" }, permissions: admin } });
  assert.equal(admins.signIn({ token: "t", user: { id: 1, username: "court_admin", role: "admin" }, permissions: admin }), true);
  assert.deepEqual(viewAccess.navigationFor(admins.permissions()).map(([view]) => view), ["home", "live", "history", "leaderboard", "analytics", "tournament", "players", "rules"]);
  assert.deepEqual(viewAccess.resolveView("setup", admins.permissions()), { view: "home", message: "New Match is available to Super Admins and Visitors" });

  const visitors = fakeSession("https://example.test/app/?visitor=1", {});
  assert.equal(visitors.signIn({ token: "t", user: { id: 2, username: "guest@example.com", role: "visitor" }, permissions: visitor }), true);
  assert.deepEqual(viewAccess.navigationFor(visitors.permissions()).map(([view]) => view), ["home", "setup", "history", "leaderboard", "rules"]);
  assert.equal(viewAccess.isPlayer(visitors.permissions()), false);

  const players = fakeSession("https://example.test/app/?player=1", {});
  assert.equal(players.signIn({ token: "t", user: { id: 3, username: "pedro", role: "player" }, permissions: player }), true);
  assert.deepEqual(viewAccess.navigationFor(players.permissions()), []);
  assert.equal(viewAccess.isPlayer(players.permissions()), true);
  assert.deepEqual(viewAccess.resolveView("tournament", players.permissions()), {
    view: "home",
    message: "Player accounts can view match summaries only",
  });
});
