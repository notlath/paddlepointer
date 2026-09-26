const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const viewAccess = require("../view-access.js");
const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");

// Mock permissions mirror
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

function getAdminDashboardBody() {
  const match = appCode.match(/function\s+renderAdminDashboard\s*\(\)\s*\{([\s\S]*?)\n  \}/);
  assert.ok(match, "renderAdminDashboard function must exist in app.js");
  return match[1];
}

test("Super Admin navigation includes dedicated People destination with stable URL", () => {
  const superAdminNav = viewAccess.navigationFor(superAdmin);
  const peopleItem = superAdminNav.find(([view]) => view === "people");
  assert.ok(peopleItem, "Super Admin navigation must include people destination");
  assert.equal(peopleItem[1], "People");

  const adminNav = viewAccess.navigationFor(admin);
  assert.ok(!adminNav.some(([view]) => view === "people"), "Regular Admin navigation must not include people");

  const visitorNav = viewAccess.navigationFor(visitor);
  assert.ok(!visitorNav.some(([view]) => view === "people"), "Visitor navigation must not include people");

  const playerNav = viewAccess.navigationFor(player);
  assert.ok(!playerNav.some(([view]) => view === "people"), "Player navigation must not include people");

  // Stable URL
  const url = viewAccess.buildViewUrl("/?admin=1", "people");
  assert.equal(url, "/?admin=1&view=people");
  assert.equal(viewAccess.getViewFromUrl(url), "people");
});

test("Access control: non-super-admins cannot access people view", () => {
  assert.deepEqual(viewAccess.resolveView("people", superAdmin), { view: "people", message: null });
  assert.deepEqual(viewAccess.resolveView("people", admin), { view: "home", message: "Super Admin access required" });
  assert.deepEqual(viewAccess.resolveView("people", visitor), { view: "home", message: "Visitor accounts can use New Match, History, Leaderboard, and Rules only" });
  assert.deepEqual(viewAccess.resolveView("people", player), { view: "home", message: "Player accounts can view match summaries only" });
});

test("app.js defines people navigation icon and routes view === 'people'", () => {
  assert.match(appCode, /people:\s*['"]<svg/i, "renderHeader icons must include people SVG");
  assert.match(appCode, /if\s*\(\s*state\.view\s*===\s*["']people["']\s*\)\s*return\s+(?:isSuperAdmin\(\)\s*\?\s*)?renderPeople\(\)/, "renderView must route 'people' to renderPeople");
});

test("People view hosts user creation, account list, role management, and refresh actions", () => {
  assert.match(appCode, /function\s+renderPeople\s*\(/, "app.js must define renderPeople");
  assert.match(appCode, /renderCreateUserForm\(\)/, "renderPeople must include renderCreateUserForm");
  assert.match(appCode, /renderUsersTable\(/, "renderPeople must include renderUsersTable");
  assert.match(appCode, /renderRefreshErrorBanner\(\s*state\.usersRefreshError,\s*["']refresh-users["']\s*\)/, "renderPeople must include users refresh error banner");
  assert.match(appCode, /data-action=["']refresh-users["']/, "renderPeople must include refresh-users button");
});

test("Admin dashboard does NOT contain People management controls", () => {
  const dashboardBody = getAdminDashboardBody();

  assert.doesNotMatch(dashboardBody, /renderCreateUserForm/, "Admin dashboard must not contain renderCreateUserForm");
  assert.doesNotMatch(dashboardBody, /renderLanAccessPanel/, "Admin dashboard must not contain renderLanAccessPanel");
  assert.doesNotMatch(dashboardBody, /renderUsersTable/, "Admin dashboard must not contain renderUsersTable");
  assert.doesNotMatch(dashboardBody, /data-action=["']refresh-users["']/, "Admin dashboard must not contain refresh-users button");
  assert.doesNotMatch(dashboardBody, /Tournament setup and users are Super Admin only/, "Admin dashboard must not tell regular admins about restricted users controls");
});

test("Admin dashboard leads with Active Match, Next Match, Live Courts, and Tournament status cards", () => {
  const dashboardBody = getAdminDashboardBody();

  assert.match(dashboardBody, /Active Match/i, "Dashboard must lead with Active Match status");
  assert.match(dashboardBody, /Next Match/i, "Dashboard must lead with Next Match status");
  assert.match(dashboardBody, /Live Courts/i, "Dashboard must lead with Live Courts status");
  assert.match(dashboardBody, /Tournament/i, "Dashboard must lead with Tournament status");
});

test("Admin dashboard exposes one clear primary operational action based on current state", () => {
  const dashboardBody = getAdminDashboardBody();

  // Dynamic primary action logic
  assert.match(dashboardBody, /data-action=["']resume-game["']/, "Dashboard primary action must support resuming active game");
  assert.match(dashboardBody, /data-action=["']start-tournament-match["']/, "Dashboard primary action must support starting next match");
  assert.match(dashboardBody, /data-action=["']refresh-tournament["']/, "Dashboard must expose refresh-tournament action");
  assert.match(dashboardBody, /class=["'][^"']*dashboard-lead-grid\s*section\s*\$\{state\.refreshingTournament\s*\?\s*["']is-updating["']/, "Dashboard lead grid must communicate updating state");
});

test("triggerViewData refreshes tournament on staff home and only fetches users on people view", () => {
  assert.match(appCode, /view\s*===\s*["']people["']\s*&&\s*isSuperAdmin\(\)\s*\)\s*\{\s*fetchUsers\(false\);/, "triggerViewData must fetch users only on people view");
  assert.match(appCode, /view\s*===\s*["']home["']\s*&&\s*isStaff\(\)/, "triggerViewData must refresh tournament on staff home view");
});
