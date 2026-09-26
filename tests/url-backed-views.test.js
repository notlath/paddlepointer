const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const viewAccess = require("../view-access.js");
const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

// Mirror server permissions for each role
function permissionsFor(role) {
  const allowedByRole = {
    super_admin: ["manage_users", "reset_tournament", "clear_tournament_games", "save_tournament", "update_tournament_match", "view_all_history", "save_game", "update_profile", "have_password"],
    admin: ["save_tournament", "update_tournament_match", "view_all_history", "save_game", "update_profile", "have_password"],
    visitor: ["save_game", "update_profile", "view_visitor_history"],
    player: ["update_profile", "view_own_history"],
  };
  const publicActions = ["read_tournament", "read_history", "read_leaderboard"];
  const allowed = new Set([...(allowedByRole[role] || []), ...publicActions]);
  const allActions = [
    "manage_users", "reset_tournament", "clear_tournament_games", "save_tournament",
    "update_tournament_match", "save_game", "update_profile", "have_password",
    "read_tournament", "read_history", "read_leaderboard", "view_all_history",
    "view_visitor_history", "view_own_history",
  ];
  const permissions = {};
  for (const action of allActions) permissions[action] = allowed.has(action);
  return permissions;
}

const superAdmin = permissionsFor("super_admin");
const admin = permissionsFor("admin");
const visitor = permissionsFor("visitor");
const player = permissionsFor("player");

test("resolveView permits all valid destinations for Super Admin", () => {
  const validViews = ["home", "setup", "live", "history", "leaderboard", "tournament", "people", "profile", "rules", "scoreboard", "summary"];
  for (const v of validViews) {
    assert.deepEqual(viewAccess.resolveView(v, superAdmin), { view: v, message: null }, `Super Admin should access ${v}`);
  }
});

test("resolveView normalizes dashboard alias to home", () => {
  assert.deepEqual(viewAccess.resolveView("dashboard", superAdmin), { view: "home", message: null });
  assert.deepEqual(viewAccess.resolveView("Dashboard", admin), { view: "home", message: null });
  assert.deepEqual(viewAccess.resolveView(" DASHBOARD ", visitor), { view: "home", message: null });
});

test("resolveView redirects unknown or malformed views to home with clear feedback", () => {
  assert.deepEqual(viewAccess.resolveView("nonexistent_view", superAdmin), {
    view: "home",
    message: "Requested view is not available",
  });
  assert.deepEqual(viewAccess.resolveView("xyz123", admin), {
    view: "home",
    message: "Requested view is not available",
  });
  assert.deepEqual(viewAccess.resolveView("<script>", visitor), {
    view: "home",
    message: "Requested view is not available",
  });
  assert.deepEqual(viewAccess.resolveView("null", player), {
    view: "home",
    message: "Requested view is not available",
  });
});

test("resolveView defaults empty, null, or whitespace view to home without an error message", () => {
  assert.deepEqual(viewAccess.resolveView("", superAdmin), { view: "home", message: null });
  assert.deepEqual(viewAccess.resolveView("   ", admin), { view: "home", message: null });
  assert.deepEqual(viewAccess.resolveView(null, visitor), { view: "home", message: null });
  assert.deepEqual(viewAccess.resolveView(undefined, player), { view: "home", message: null });
});

test("resolveView enforces role restrictions independently of the view string", () => {
  // Visitor cannot access tournament, live, or profile
  assert.deepEqual(viewAccess.resolveView("tournament", visitor), {
    view: "home",
    message: "Visitor accounts can use New Match, History, Leaderboard, and Rules only",
  });
  assert.deepEqual(viewAccess.resolveView("live", visitor), {
    view: "home",
    message: "Visitor accounts can use New Match, History, Leaderboard, and Rules only",
  });

  // Admin cannot access setup (standalone) or profile
  assert.deepEqual(viewAccess.resolveView("setup", admin), {
    view: "home",
    message: "New Match is available to Super Admins and Visitors",
  });
  assert.deepEqual(viewAccess.resolveView("profile", admin), {
    view: "home",
    message: "Super Admin access required",
  });

  // Player cannot access tournament or history, returns explicit player feedback
  assert.deepEqual(viewAccess.resolveView("tournament", player), {
    view: "home",
    message: "Player accounts can view match summaries only",
  });
  assert.deepEqual(viewAccess.resolveView("history", player), {
    view: "home",
    message: "Player accounts can view match summaries only",
  });
  // Player can access home and summary
  assert.deepEqual(viewAccess.resolveView("home", player), { view: "home", message: null });
  assert.deepEqual(viewAccess.resolveView("summary", player), { view: "summary", message: null });
});

test("getViewFromUrl parses view query parameter correctly", () => {
  assert.equal(viewAccess.getViewFromUrl("https://example.test/?view=history"), "history");
  assert.equal(viewAccess.getViewFromUrl("https://example.test/?visitor=1&view=setup"), "setup");
  assert.equal(viewAccess.getViewFromUrl("https://example.test/?player=1&view=summary"), "summary");
  assert.equal(viewAccess.getViewFromUrl("https://example.test/?view=tournament#main"), "tournament");
  assert.equal(viewAccess.getViewFromUrl("https://example.test/?player=1"), "");
  assert.equal(viewAccess.getViewFromUrl("https://example.test/"), "");
  assert.equal(viewAccess.getViewFromUrl(""), "");
  assert.equal(viewAccess.getViewFromUrl(null), "");
});

test("buildViewUrl creates or updates view parameter preserving existing query params and path", () => {
  // Simple view update
  assert.equal(viewAccess.buildViewUrl("https://example.test/", "tournament"), "/?view=tournament");
  assert.equal(viewAccess.buildViewUrl("https://example.test/?view=live", "history"), "/?view=history");

  // Preserves existing portal parameters
  assert.equal(viewAccess.buildViewUrl("https://example.test/?visitor=1", "setup"), "/?visitor=1&view=setup");
  assert.equal(viewAccess.buildViewUrl("https://example.test/?player=1", "summary"), "/?player=1&view=summary");
  assert.equal(viewAccess.buildViewUrl("https://example.test/?visitor=1&view=rules", "leaderboard"), "/?visitor=1&view=leaderboard");

  // Preserves pathname and hash
  assert.equal(viewAccess.buildViewUrl("https://example.test/subpath/index.html?player=1#hash", "summary"), "/subpath/index.html?player=1&view=summary#hash");

  // Sets view=home for home
  assert.equal(viewAccess.buildViewUrl("https://example.test/", "home"), "/?view=home");
  assert.equal(viewAccess.buildViewUrl("https://example.test/?player=1", "dashboard"), "/?player=1&view=home");
});

test("buildViewUrl with empty view strips view parameter while preserving portal parameters", () => {
  assert.equal(viewAccess.buildViewUrl("https://example.test/?view=tournament", ""), "/");
  assert.equal(viewAccess.buildViewUrl("https://example.test/?visitor=1&view=setup", ""), "/?visitor=1");
  assert.equal(viewAccess.buildViewUrl("https://example.test/?player=1&view=summary#top", ""), "/?player=1#top");
});

test("app.js declares pushViewUrl and replaceViewUrl and wires popstate listener", () => {
  assert.match(appCode, /function\s+pushViewUrl\s*\(/, "app.js must define pushViewUrl");
  assert.match(appCode, /function\s+replaceViewUrl\s*\(/, "app.js must define replaceViewUrl");
  assert.match(appCode, /window\.addEventListener\(\s*["']popstate["']/, "app.js must listen for popstate");
  assert.match(appCode, /setView\([^,]+,\s*\{\s*fromHistory:\s*true\s*\}\)/, "popstate handler must pass fromHistory: true to setView");
});

test("app.js setView avoids pushing duplicate history entries when re-selecting current view", () => {
  assert.match(appCode, /if\s*\(\s*state\.view\s*===\s*resolved\.view\s*\)/, "setView should short-circuit when selecting currently active view");
  assert.match(appCode, /pushViewUrl\(\s*resolved\.view\s*\)/, "setView should call pushViewUrl on new destinations");
  assert.match(appCode, /replaceViewUrl\(\s*resolved\.view\s*\)/, "setView should call replaceViewUrl on redirects");
});

test("app.js bootstrapSession and showSignedInApp restore view from URL and give feedback on redirects", () => {
  assert.match(appCode, /function\s+resolveAndSyncUrlView\s*\(/, "app.js must define resolveAndSyncUrlView helper");
  assert.match(appCode, /replaceViewUrl\(\s*resolved\.view\s*\)/, "resolveAndSyncUrlView should sync URL with resolved view");
  assert.match(appCode, /showToast\(\s*resolved\.message\s*\)/, "resolveAndSyncUrlView should toast resolved.message on redirects");

  assert.match(appCode, /async\s+function\s+bootstrapSession[\s\S]+?resolveAndSyncUrlView\(/, "bootstrapSession must sync view from URL");
  assert.match(appCode, /async\s+function\s+showSignedInApp[\s\S]+?resolveAndSyncUrlView\(/, "showSignedInApp must sync view from URL");
});

test("app.js logoutUser clears view parameter from URL", () => {
  assert.match(appCode, /viewAccess\.buildViewUrl\(\s*window\.location\.href,\s*["']["']\s*\)/, "logoutUser should strip view parameter from URL");
});

test("index.html loads view-access.js before app.js", () => {
  const viewAccessIndex = html.indexOf('src="view-access.js');
  const appIndex = html.indexOf('src="app.js');
  assert.ok(viewAccessIndex > -1, "view-access.js must be loaded in index.html");
  assert.ok(appIndex > -1, "app.js must be loaded in index.html");
  assert.ok(viewAccessIndex < appIndex, "view-access.js must load before app.js");
});

test("history navigation simulation: pushState, popstate, and deduplication", () => {
  class HistoryStack {
    constructor(initialUrl) {
      this.entries = [{ state: { view: "home" }, url: initialUrl }];
      this.index = 0;
    }
    pushState(state, title, url) {
      this.entries = this.entries.slice(0, this.index + 1);
      this.entries.push({ state, url });
      this.index = this.entries.length - 1;
    }
    replaceState(state, title, url) {
      this.entries[this.index] = { state, url };
    }
    back() {
      if (this.index > 0) this.index -= 1;
      return this.entries[this.index];
    }
    forward() {
      if (this.index < this.entries.length - 1) this.index += 1;
      return this.entries[this.index];
    }
    current() {
      return this.entries[this.index];
    }
  }

  const history = new HistoryStack("https://example.test/?view=home");
  let currentView = "home";

  function navigate(view, options = {}) {
    const resolved = viewAccess.resolveView(view, admin);
    const isSameView = currentView === resolved.view;
    if (isSameView) {
      return; // Do not push duplicate
    }
    currentView = resolved.view;
    const nextUrl = viewAccess.buildViewUrl(history.current().url, resolved.view);
    if (!options.fromHistory) {
      history.pushState({ view: resolved.view }, "", nextUrl);
    }
  }

  // Navigate: home -> history -> tournament
  navigate("history");
  assert.equal(currentView, "history");
  assert.equal(history.entries.length, 2);
  assert.equal(history.current().url, "/?view=history");

  navigate("tournament");
  assert.equal(currentView, "tournament");
  assert.equal(history.entries.length, 3);
  assert.equal(history.current().url, "/?view=tournament");

  // Re-selecting current view does NOT duplicate history entries
  navigate("tournament");
  assert.equal(history.entries.length, 3, "Selecting tournament again must not duplicate history entry");

  // Back button restores previous view without logging out
  const back1 = history.back();
  navigate(back1.state.view, { fromHistory: true });
  assert.equal(currentView, "history");
  assert.equal(history.entries.length, 3);

  // Back button to home
  const back2 = history.back();
  navigate(back2.state.view, { fromHistory: true });
  assert.equal(currentView, "home");
  assert.equal(history.entries.length, 3);

  // Forward button to history
  const fwd1 = history.forward();
  navigate(fwd1.state.view, { fromHistory: true });
  assert.equal(currentView, "history");

  // Forward button to tournament
  const fwd2 = history.forward();
  navigate(fwd2.state.view, { fromHistory: true });
  assert.equal(currentView, "tournament");
});

