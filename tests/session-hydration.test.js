const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createSession } = require("../session.js");
const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

test("session module exposes hasRememberedIdentity and canRestore query helpers", () => {
  const session = createSession({
    storages: [{ getItem: () => null, setItem: () => {}, removeItem: () => {} }],
    getUrl: () => "https://example.test/?player=1",
    replaceUrl: () => {},
    request: async () => ({}),
  });
  assert.equal(typeof session.hasRememberedIdentity, "function");
  assert.equal(typeof session.canRestore, "function");
  assert.equal(session.hasRememberedIdentity(), false);
  assert.equal(session.canRestore(), false);
});

test("styles.css defines session loading state classes and keyframe animations", () => {
  assert.match(css, /\.session-loading-shell\s*\{/, "styles.css must style .session-loading-shell");
  assert.match(css, /\.session-loading-card\s*\{/, "styles.css must style .session-loading-card");
  assert.match(css, /\.session-loading-content\s*\{/, "styles.css must style .session-loading-content");
  assert.match(css, /\.session-loading-spinner\s*\{/, "styles.css must style .session-loading-spinner");
  assert.match(css, /\.session-loading-message\s*\{/, "styles.css must style .session-loading-message");
  assert.match(css, /@keyframes\s+session-spin\s*\{/, "styles.css must define session-spin animation");
  assert.match(css, /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)[\s\S]+?\.session-loading-spinner\s*\{/, "styles.css must support prefers-reduced-motion for spinner");
});

test("app.js initializes state.sessionRestoring directly from session.canRestore()", () => {
  assert.match(appCode, /sessionRestoring:\s*session\.canRestore\(\)/, "state.sessionRestoring must initialize from session.canRestore()");
});

test("app.js defines renderSessionLoading with accessible status message and theme adaptation", () => {
  assert.match(appCode, /function\s+renderSessionLoading\s*\(\s*\)/, "app.js must define renderSessionLoading");
  assert.match(appCode, /role=["']status["']/, "renderSessionLoading must expose role=status");
  assert.match(appCode, /aria-live=["']polite["']/, "renderSessionLoading must expose aria-live=polite");
  assert.match(appCode, /session-loading-spinner/, "renderSessionLoading must render spinner");
  assert.match(appCode, /Checking saved session\.\.\./, "renderSessionLoading must announce status message");
  assert.match(appCode, /aria-busy=["']true["']/, "renderSessionLoading shell must be marked aria-busy");
});

test("app.js render() suppresses sign-in portal and header while session is restoring", () => {
  assert.match(appCode, /const\s+isRestoring\s*=\s*Boolean\(\s*state\.sessionRestoring\s*\)/, "render must check state.sessionRestoring");
  assert.match(appCode, /if\s*\(\s*isRestoring\s*\)\s*\{\s*mainContentHtml\s*=\s*renderSessionLoading\(\);?\s*\}/, "render must renderSessionLoading when isRestoring is true");
  assert.match(appCode, /signedIn\s*\?\s*renderHeader\(\)\s*:\s*["']["']/, "render must not renderHeader while restoring");
  assert.match(appCode, /!isRestoring\s*&&\s*pendingViewFocus/, "pendingViewFocus must wait until session restoration completes");
});

test("app.js bootstrapSession and hydrateAuth handle session restoration lifecycle and expired toasts", () => {
  assert.match(appCode, /state\.sessionRestoring\s*=\s*false/, "bootstrapSession and hydrateAuth must clear sessionRestoring");
  assert.match(appCode, /showToast\(\s*["']Your session has expired\. Please sign in again\.["']\s*\)/, "hydrateAuth must show explicit session expiration toast");
  assert.match(appCode, /showToast\(\s*["']Could not restore saved session\. Please sign in again\.["']\s*\)/, "bootstrapSession must show toast if remembered recovery fails");
});

test("index.html loads session.js with v=20260914-session-restore1 cache buster", () => {
  assert.match(html, /src="session\.js\?v=20260914-session-restore1"/);
});

test("renderSessionLoading produces portal-adapted markup without interactive elements or focus traps", () => {
  const match = appCode.match(/(function\s+authPortalTheme\([\s\S]+?function\s+renderSessionLoading\(\)\s*\{[\s\S]+?\r?\n\s*\})\r?\n\s*function\s+renderLogin/);
  assert.ok(match, "renderSessionLoading and authPortalTheme must be extractable");

  const renderSessionLoadingFn = new Function("session", `${match[1]}; return renderSessionLoading();`);

  // Admin portal
  const adminHtml = renderSessionLoadingFn({ portal: () => "admin" });
  assert.match(adminHtml, /class="[^"]*admin-auth-shell[^"]*"/);
  assert.match(adminHtml, /class="[^"]*dark-auth-shell[^"]*"/);
  assert.match(adminHtml, /assets\/paddlepoint-logo-w-h\.webp/);
  assert.match(adminHtml, /role="status"/);
  assert.match(adminHtml, /aria-live="polite"/);
  assert.match(adminHtml, /Checking saved session\.\.\./);
  assert.doesNotMatch(adminHtml, /<button/i, "Loading state must contain no buttons");
  assert.doesNotMatch(adminHtml, /<input/i, "Loading state must contain no inputs");
  assert.doesNotMatch(adminHtml, /<a\s/i, "Loading state must contain no links");

  // Player portal
  const playerHtml = renderSessionLoadingFn({ portal: () => "player" });
  assert.match(playerHtml, /class="[^"]*player-auth-shell[^"]*"/);
  assert.match(playerHtml, /class="[^"]*dark-auth-shell[^"]*"/);
  assert.match(playerHtml, /assets\/paddlepoint-logo-w-h\.webp/);

  // Visitor portal
  const visitorHtml = renderSessionLoadingFn({ portal: () => "visitor" });
  assert.match(visitorHtml, /class="[^"]*visitor-auth-shell[^"]*"/);
  assert.match(visitorHtml, /class="[^"]*dark-auth-shell[^"]*"/);
  assert.match(visitorHtml, /assets\/paddlepoint-logo-w-h\.webp/);
});

test("startup remains usable without awaiting background data promises", () => {
  // bootstrapSession starts background refreshes without blocking update()
  assert.match(
    appCode,
    /refreshSharedHistory\(false\);\s*refreshSharedTournament\(false\);\s*loadNetworkInfo\(\);\s*if\s*\(isSuperAdmin\(\)\)\s*fetchUsers\(false\);\s*update\(\);/,
    "bootstrapSession must call update() immediately without awaiting background data"
  );

  // showSignedInApp calls update() before Promise.all resolves background promises
  assert.match(
    appCode,
    /applyCurrentUserToSetup\(\);[\s\S]+?update\(\);[\s\S]+?Promise\.all\(\[historyPromise, tournamentPromise, networkPromise, usersPromise[^\]]*\]\)\.then\(/,
    "showSignedInApp must call update() without blocking on background network promises"
  );
});

test("a restored staff session loads the Players list, so a page opened on Tournament setup or Players has it", () => {
  const boot = appCode.replace(/\r\n/g, "\n").match(/async function bootstrapSession\(\) \{[\s\S]*?\n  \}/)[0];
  assert.match(boot, /if \(isStaff\(\)\) \{[^}]*fetchPlayers\(false\);[^}]*\}/, "bootstrapSession must fetch Players for staff");
});
