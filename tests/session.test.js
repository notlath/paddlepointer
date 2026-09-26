const test = require("node:test");
const assert = require("node:assert/strict");

const { createSession } = require("../session.js");

// Storage keys already in people's browsers; they must not change.
const LEGACY_KEY = "ac-pickle-score-auth-v2";
const ADMIN_KEY = "ac-pickle-score-auth-v2-admin";
const PLAYER_KEY = "ac-pickle-score-auth-v2-player";
const VISITOR_KEY = "ac-pickle-score-auth-v2-visitor";
const PLAYER_IDENTITY_KEY = "ac-pickle-score-player-identity-v1";
const VISITOR_IDENTITY_KEY = "ac-pickle-score-visitor-identity-v1";

const admin = { id: 1, username: "court_admin", displayName: "Court Admin", role: "admin" };
const player = { id: 2, username: "pedro", displayName: "Pedro", role: "player" };
const visitor = { id: 3, username: "guest@example.com", displayName: "Guest", role: "visitor" };

class FakeStorage {
  constructor(entries = {}) {
    this.items = new Map(Object.entries(entries).map(([key, value]) => [key, JSON.stringify(value)]));
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
  read(key) {
    return this.items.has(key) ? JSON.parse(this.items.get(key)) : null;
  }
}

// A browser: two storages, a URL, and an auth API that records calls and answers from `replies`.
function fakeBrowser({ url = "https://example.test/app/", local = {}, sessionStore = {}, replies = {} } = {}) {
  const browser = {
    local: new FakeStorage(local),
    sessionStore: new FakeStorage(sessionStore),
    url,
    calls: [],
  };
  browser.open = () =>
    createSession({
      storages: [browser.local, browser.sessionStore],
      getUrl: () => browser.url,
      replaceUrl: (next) => {
        browser.url = String(next);
      },
      request: async (action, body, token) => {
        browser.calls.push({ action, body, token });
        const reply = replies[action];
        if (reply instanceof Error) throw reply;
        if (!reply) throw new Error(`no reply for ${action}`);
        return typeof reply === "function" ? reply(body) : reply;
      },
    });
  return browser;
}

const signedIn = (user, permissions = {}) => ({ token: `token-${user.username}`, user, permissions });

test("keeps one session per portal across reloads", () => {
  const browser = fakeBrowser();
  assert.equal(browser.open().signIn(signedIn(admin)), true);

  browser.url = "https://example.test/app/?player=1";
  const playerPage = browser.open();
  assert.equal(playerPage.portal(), "player");
  assert.equal(playerPage.user(), null, "the admin session is not used on the Player portal");
  assert.equal(playerPage.signIn(signedIn(player)), true);

  browser.url = "https://example.test/app/";
  const adminPage = browser.open();
  assert.deepEqual([adminPage.portal(), adminPage.user(), adminPage.headers()], ["admin", admin, { "X-Session-Token": "token-court_admin" }]);

  browser.url = "https://example.test/app/?player=1";
  assert.deepEqual(browser.open().user(), player);
  assert.deepEqual(browser.sessionStore.read(ADMIN_KEY), signedIn(admin), "sessions are kept in both storages");

  const sessionStorageOnly = fakeBrowser({ url: "https://example.test/app/?visitor=1", sessionStore: { [VISITOR_KEY]: signedIn(visitor) } });
  assert.deepEqual(sessionStorageOnly.open().user(), visitor, "a session kept only in sessionStorage is found");

  const brokenLocalCopy = fakeBrowser({
    url: "https://example.test/app/?visitor=1",
    local: { [VISITOR_KEY]: { user: visitor } },
    sessionStore: { [VISITOR_KEY]: signedIn(visitor) },
  });
  assert.deepEqual(brokenLocalCopy.open().user(), visitor, "an incomplete session in one storage falls back to the other");
});

test("moves the old shared storage key to its portal", () => {
  const browser = fakeBrowser({ url: "https://example.test/app/?visitor=1", local: { [LEGACY_KEY]: signedIn(visitor) } });
  assert.deepEqual(browser.open().user(), visitor);
  assert.deepEqual(browser.local.read(VISITOR_KEY), signedIn(visitor), "the old session is copied to the Visitor key");

  const otherPortal = fakeBrowser({ url: "https://example.test/app/?player=1", local: { [LEGACY_KEY]: signedIn(visitor) } });
  assert.equal(otherPortal.open().user(), null, "an old session for another portal is not used");
  assert.deepEqual(otherPortal.local.read(LEGACY_KEY), signedIn(visitor), "and it is left for its own portal");
});

test("a session that doesn't match the URL's portal is cleared", () => {
  const stale = fakeBrowser({ local: { [ADMIN_KEY]: signedIn(player) } });
  assert.equal(stale.open().user(), null, "a Player session under the Admin key is not used");
  assert.equal(stale.local.read(ADMIN_KEY), null, "and is removed");

  const wrongPortal = fakeBrowser();
  const adminPage = wrongPortal.open();
  assert.equal(adminPage.signIn(signedIn(player)), false, "a Player signing in through the Admin portal is refused");
  assert.equal(adminPage.isSignedIn(), false);
  assert.equal(wrongPortal.local.read(PLAYER_KEY), null, "nothing is kept");

  const switching = fakeBrowser();
  const page = switching.open();
  page.signIn(signedIn(admin));
  assert.equal(page.switchPortal("visitor"), "visitor");
  assert.equal(switching.url, "https://example.test/app/?visitor=1");
  assert.equal(page.isSignedIn(), false, "switching to a portal the session doesn't belong to signs it out");

  const updated = fakeBrowser({ url: "https://example.test/app/?player=1" });
  const playerPage = updated.open();
  playerPage.signIn(signedIn(player, { view_own_history: true }));
  assert.equal(playerPage.updateUser({ ...player, displayName: "Pedro R." }), true);
  assert.equal(updated.local.read(PLAYER_KEY).user.displayName, "Pedro R.", "an updated user is kept");
  assert.deepEqual(playerPage.permissions(), { view_own_history: true }, "permissions are kept when updateUser is not given new ones");
  assert.equal(playerPage.updateUser({ ...player, displayName: "Pedro R." }, { view_own_history: true, update_profile: true }), true);
  assert.deepEqual(playerPage.permissions(), { view_own_history: true, update_profile: true }, "permissions are replaced when updateUser is given new ones");
  assert.equal(playerPage.updateUser({ ...player, role: "admin" }), false, "a user whose role no longer matches the portal is signed out");
  assert.equal(updated.local.read(PLAYER_KEY), null);
  assert.deepEqual(playerPage.permissions(), {}, "a signed-out session has no permissions");
});

test("silently signs Players and Visitors back in", async () => {
  const visitorBrowser = fakeBrowser({
    url: "https://example.test/app/?visitor=1",
    local: { [VISITOR_IDENTITY_KEY]: { username: visitor.username, displayName: visitor.displayName, role: "visitor" } },
    replies: { "visitor-login": signedIn(visitor) },
  });
  const visitorPage = visitorBrowser.open();
  assert.equal(await visitorPage.recover(), true);
  assert.deepEqual(visitorBrowser.calls, [{ action: "visitor-login", body: { email: visitor.username, displayName: visitor.displayName }, token: undefined }]);
  assert.deepEqual(visitorPage.user(), visitor);

  const playerBrowser = fakeBrowser({ url: "https://example.test/app/?player=1", replies: { login: signedIn(player) } });
  const playerPage = playerBrowser.open();
  playerPage.signIn(signedIn(player));
  assert.deepEqual(playerBrowser.local.read(PLAYER_IDENTITY_KEY), { username: "pedro", displayName: "Pedro", role: "player" }, "signing in remembers the Player");
  assert.equal(await playerBrowser.open().recover(), true, "a reloaded Player page signs back in");
  assert.deepEqual(playerBrowser.calls.at(-1), { action: "login", body: { username: "pedro", password: "" }, token: undefined });

  const adminBrowser = fakeBrowser({ local: { [PLAYER_IDENTITY_KEY]: { username: "pedro", displayName: "Pedro", role: "player" } } });
  assert.equal(await adminBrowser.open().recover(), false, "the Admin portal never signs in silently");
  assert.deepEqual(adminBrowser.calls, []);

  const failing = fakeBrowser({ url: "https://example.test/app/?player=1", local: { [PLAYER_IDENTITY_KEY]: { username: "pedro", role: "player" } }, replies: { login: new Error("Invalid username or inactive account") } });
  assert.equal(await failing.open().recover(), false, "a refused re-sign-in leaves the person signed out");

  const wrongRole = fakeBrowser({ url: "https://example.test/app/?player=1", local: { [PLAYER_IDENTITY_KEY]: { username: "pedro", role: "player" } }, replies: { login: signedIn({ ...player, role: "admin" }) } });
  const wrongRolePage = wrongRole.open();
  assert.equal(await wrongRolePage.recover(), false, "a re-sign-in that returns another portal's user is refused");
  assert.equal(wrongRolePage.isSignedIn(), false);
});

test("signing out ends the session and returns to the user's portal", async () => {
  const browser = fakeBrowser({ url: "https://example.test/app/?visitor=1", replies: { logout: { ok: true } } });
  const page = browser.open();
  page.signIn(signedIn(visitor));

  assert.equal(await page.signOut(), "visitor");
  assert.deepEqual(browser.calls, [{ action: "logout", body: {}, token: "token-guest@example.com" }]);
  assert.equal(page.isSignedIn(), false);
  assert.deepEqual([browser.local.read(VISITOR_KEY), browser.sessionStore.read(VISITOR_KEY), browser.local.read(VISITOR_IDENTITY_KEY)], [null, null, null], "the session and remembered Visitor are forgotten");
  assert.equal(await browser.open().recover(), false, "so a reload doesn't sign them back in");
  assert.equal(browser.url, "https://example.test/app/?visitor=1");

  const offline = fakeBrowser({ url: "https://example.test/app/?player=1", replies: { logout: new Error("Network down") } });
  const offlinePage = offline.open();
  offlinePage.signIn(signedIn(player));
  assert.equal(await offlinePage.signOut(), "player", "signing out still works when the server is unreachable");
  assert.equal(offline.local.read(PLAYER_KEY), null);

  const legacy = fakeBrowser({ url: "https://example.test/app/?visitor=1", local: { [LEGACY_KEY]: signedIn(visitor) }, replies: { logout: { ok: true } } });
  await legacy.open().signOut();
  assert.equal(legacy.local.read(LEGACY_KEY), null, "an old shared-key session for this portal is forgotten too");
});

test("hasRememberedIdentity and canRestore indicate restorable sessions without network calls", () => {
  const emptyAdmin = fakeBrowser().open();
  assert.equal(emptyAdmin.hasRememberedIdentity(), false);
  assert.equal(emptyAdmin.canRestore(), false);

  const signedInAdmin = fakeBrowser({ local: { [ADMIN_KEY]: signedIn(admin) } }).open();
  assert.equal(signedInAdmin.hasRememberedIdentity(), false, "admin never uses remembered identity");
  assert.equal(signedInAdmin.canRestore(), true, "admin with active session token can restore");

  const emptyPlayer = fakeBrowser({ url: "https://example.test/app/?player=1" }).open();
  assert.equal(emptyPlayer.hasRememberedIdentity(), false);
  assert.equal(emptyPlayer.canRestore(), false);

  const rememberedPlayer = fakeBrowser({
    url: "https://example.test/app/?player=1",
    local: { [PLAYER_IDENTITY_KEY]: { username: "pedro", displayName: "Pedro", role: "player" } },
  }).open();
  assert.equal(rememberedPlayer.hasRememberedIdentity(), true);
  assert.equal(rememberedPlayer.canRestore(), true);

  const rememberedVisitor = fakeBrowser({
    url: "https://example.test/app/?visitor=1",
    local: { [VISITOR_IDENTITY_KEY]: { username: "guest@example.com", displayName: "Guest", role: "visitor" } },
  }).open();
  assert.equal(rememberedVisitor.hasRememberedIdentity(), true);
  assert.equal(rememberedVisitor.canRestore(), true);
});
