const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createSession } = require("../session.js");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

// Extract the actual production functions directly from app.js to avoid duplicated code:
const renderButtonsMatch = appCode.match(/function renderLoginPortalButtons\(activePortal\) \{[\s\S]*?\n  \}/);
assert.ok(renderButtonsMatch, "renderLoginPortalButtons must exist in app.js");
const renderLoginPortalButtons = new Function(
  "activePortal",
  `${renderButtonsMatch[0]}
  return renderLoginPortalButtons(activePortal);`
);

const setStateMatch = appCode.match(/function setLoginPortalState\(portal\) \{[\s\S]*?\n  \}/);
assert.ok(setStateMatch, "setLoginPortalState must exist in app.js");
const setLoginPortalState = new Function(
  "portal",
  "state",
  "isValidEmail",
  "DEFAULT_SUPER_ADMIN_LOGIN",
  `${setStateMatch[0]}
  return setLoginPortalState(portal);`
);

function fakeBrowser({ url = "https://example.test/app/" } = {}) {
  const browser = {
    url,
    storages: [new Map()],
  };
  const session = createSession({
    storages: [
      {
        getItem: (k) => (browser.storages[0].has(k) ? browser.storages[0].get(k) : null),
        setItem: (k, v) => browser.storages[0].set(k, String(v)),
        removeItem: (k) => browser.storages[0].delete(k),
      },
    ],
    getUrl: () => browser.url,
    replaceUrl: (next) => {
      browser.url = String(next);
    },
    request: async () => ({}),
  });
  return { browser, session };
}

test("Admin, Player, and Visitor sign-in pages each expose buttons for the other two portals and never for themselves", () => {
  const portals = ["admin", "player", "visitor"];
  const expectedLabels = {
    admin: "Admin Sign In",
    player: "Player Sign In",
    visitor: "Visitor Sign In",
  };

  for (const active of portals) {
    const rendered = renderLoginPortalButtons(active);
    const otherPortals = portals.filter((p) => p !== active);

    for (const other of otherPortals) {
      assert.ok(
        rendered.includes(`data-value="${other}"`),
        `Portal "${active}" must include switch button to "${other}"`
      );
      assert.ok(
        rendered.includes(expectedLabels[other]),
        `Portal "${active}" must display label "${expectedLabels[other]}" for "${other}"`
      );
    }
    assert.ok(
      !rendered.includes(`data-value="${active}"`),
      `Portal "${active}" must NOT include a switch button to itself`
    );
  }
});

test("app.js renders auth-portal-switch container and identifies active portal consistently", () => {
  assert.match(
    appCode,
    /<div class="auth-portal-switch full-width" role="group" aria-label="Sign-in portals">[\s\S]*?auth-portal-status[\s\S]*?renderLoginPortalButtons\(form\.portal\)/
  );
  // Verify that renderLoginPortalButtons is NOT gated on isDarkAuth
  assert.doesNotMatch(appCode, /isDarkAuth\s*\?\s*""\s*:\s*renderLoginPortalButtons/);
  // Verify that renderLoginPortalButtons does NOT exit early on visitor
  assert.doesNotMatch(appCode, /if\s*\(activePortal\s*===\s*["']visitor["']\)\s*return\s*["']/);
});

test("switching portals updates the browser URL through session.switchPortal", () => {
  const { browser, session } = fakeBrowser({ url: "https://example.test/app/" });
  assert.equal(session.portal(), "admin");

  // Switch to Player
  session.switchPortal("player");
  assert.equal(session.portal(), "player");
  assert.ok(browser.url.includes("player=1"), "URL must contain player=1");
  assert.ok(!browser.url.includes("visitor=1"), "URL must not contain visitor=1");

  // Switch to Visitor
  session.switchPortal("visitor");
  assert.equal(session.portal(), "visitor");
  assert.ok(browser.url.includes("visitor=1"), "URL must contain visitor=1");
  assert.ok(!browser.url.includes("player=1"), "URL must not contain player=1");

  // Switch back to Admin
  session.switchPortal("admin");
  assert.equal(session.portal(), "admin");
  assert.ok(!browser.url.includes("player="), "URL must not contain player parameter");
  assert.ok(!browser.url.includes("visitor="), "URL must not contain visitor parameter");
});

test("switching portals preserves only values valid for destination portal and purges invalid values", () => {
  const isValidEmail = (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val || "").trim());
  const DEFAULT_SUPER_ADMIN_LOGIN = "SuperAdmin_AC";

  // 1. Password, errors, and failure are always purged
  const state1 = {
    authForm: {
      portal: "admin",
      username: "court_admin",
      password: "supersecretpassword",
      visitorName: "",
      errors: { password: "Wrong password" },
      failure: "Authentication failed",
    },
  };
  setLoginPortalState("player", state1, isValidEmail, DEFAULT_SUPER_ADMIN_LOGIN);
  assert.equal(state1.authForm.password, "");
  assert.deepEqual(state1.authForm.errors, {});
  assert.equal(state1.authForm.failure, "");
  assert.equal(state1.authForm.username, "court_admin", "Valid non-email username preserved for player");

  // 2. visitorName is cleared when switching away from visitor
  const state2 = {
    authForm: {
      portal: "visitor",
      username: "guest@example.com",
      password: "",
      visitorName: "Jane Visitor",
      errors: {},
      failure: "",
    },
  };
  setLoginPortalState("player", state2, isValidEmail, DEFAULT_SUPER_ADMIN_LOGIN);
  assert.equal(state2.authForm.visitorName, "", "visitorName must be cleared when leaving visitor portal");
  assert.equal(state2.authForm.username, "", "Email format username must be cleared when switching to player");

  // 3. Valid email preserved when switching to visitor
  const state3 = {
    authForm: {
      portal: "admin",
      username: "jane@example.com",
      password: "pwd",
      visitorName: "",
      errors: {},
      failure: "",
    },
  };
  setLoginPortalState("visitor", state3, isValidEmail, DEFAULT_SUPER_ADMIN_LOGIN);
  assert.equal(state3.authForm.username, "jane@example.com", "Valid email must be preserved when switching to visitor");

  // 4. Default super admin login is preserved when switching TO admin, but cleared when switching away
  const state4 = {
    authForm: {
      portal: "player",
      username: "SuperAdmin_AC",
      password: "",
      visitorName: "",
      errors: {},
      failure: "",
    },
  };
  setLoginPortalState("admin", state4, isValidEmail, DEFAULT_SUPER_ADMIN_LOGIN);
  assert.equal(state4.authForm.username, "SuperAdmin_AC", "Default super admin login is valid and preserved on admin");

  setLoginPortalState("player", state4, isValidEmail, DEFAULT_SUPER_ADMIN_LOGIN);
  assert.equal(state4.authForm.username, "", "Default super admin login must be cleared when leaving admin");
});

test("Direct portal links open the intended portal", () => {
  const playerQr = fakeBrowser({ url: "https://paddlepoint.local/?player=1" });
  assert.equal(playerQr.session.portal(), "player");

  const visitorQr = fakeBrowser({ url: "https://paddlepoint.local/?visitor=1" });
  assert.equal(visitorQr.session.portal(), "visitor");

  const defaultAdmin = fakeBrowser({ url: "https://paddlepoint.local/" });
  assert.equal(defaultAdmin.session.portal(), "admin");
});

test("styles.css defines auth-portal-switch and short-viewport safety", () => {
  assert.match(css, /\.auth-portal-switch\s*\{[^}]*display:\s*flex/);
  assert.match(css, /\.auth-portal-actions\s*\{[^}]*display:\s*grid/);
  assert.match(css, /\.auth-portal-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.auth-portal-actions\s+\.button\.ghost\s*\{[^}]*min-height:\s*44px/);

  // Verify short-viewport query includes auth-portal-switch and auth-portal-actions
  const shortQueryMatch = css.match(/@media\s*\(max-height:\s*700px\)\s*and\s*\(max-width:\s*767px\)[\s\S]*?\{([\s\S]*?)\n\}/);
  assert.ok(shortQueryMatch, "Must define short viewport media query");
  assert.ok(shortQueryMatch[1].includes(".auth-portal-switch"), "Short viewport query must tune .auth-portal-switch");
  assert.ok(shortQueryMatch[1].includes(".auth-portal-actions"), "Short viewport query must tune .auth-portal-actions");
});

test("index.html and app.js use matching build identifiers", () => {
  const build = appCode.match(/window\.__AC_PICKLE_BUILD\s*=\s*"([a-z0-9-]+)"/);
  assert.ok(build, "app.js must declare __AC_PICKLE_BUILD");
  assert.match(html, /styles\.css\?v=202609\d{2}-[a-z0-9-]+/);
  assert.match(html, new RegExp(`app\\.js\\?v=202609\\d{2}-${build[1]}`));
});
