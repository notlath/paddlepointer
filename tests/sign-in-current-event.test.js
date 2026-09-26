const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8").replace(/\r\n/g, "\n");

function extract(name) {
  const source = appCode.match(new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}`));
  assert.ok(source, `app.js must define ${name}`);
  return source[0];
}

// Signing in (not reloading) with a Current Event other than open_play: the app must know the
// Event before showSignedInApp() fetches the Tournament, or Live shows the wrong Event until a reload.
test("a fresh sign-in applies the Current Event before the signed-in app loads its data", async () => {
  const defaultTournament = { id: "open_play" };
  const state = { tournament: { id: "open_play" }, view: "login" };
  let idWhenAppLoaded = null;
  const helpers = {
    session: { signIn: () => true, portal: () => "admin" },
    state,
    defaultTournament,
    setLoginPortalState: () => {},
    update: () => {},
    showSignedInApp: async () => {
      idWhenAppLoaded = { default: defaultTournament.id, tournament: state.tournament.id };
    },
  };
  const names = Object.keys(helpers);
  const build = new Function(
    ...names,
    `${extract("applyCurrentEventId")}\n${extract("acceptSignIn")}\nreturn acceptSignIn;`
  );
  const acceptSignIn = build(...names.map((n) => helpers[n]));

  await acceptSignIn({ token: "t", user: { role: "super_admin" }, permissions: {}, currentEventId: "fall_classic" });

  assert.deepEqual(idWhenAppLoaded, { default: "fall_classic", tournament: "fall_classic" });
});

test("passwordless recovery hydrates the Current Event before loading app data", async () => {
  const defaultTournament = { id: "open_play" };
  const state = { tournament: { id: "open_play" } };
  let idWhenAppLoaded = null;
  const helpers = {
    session: {
      recover: async () => true,
      isSignedIn: () => true,
      headers: () => ({}),
      updateUser: () => true,
    },
    state,
    defaultTournament,
    fetch: async () => ({
      ok: true,
      json: async () => ({ ok: true, user: {}, permissions: {}, currentEventId: "fall_classic" }),
    }),
    API_BASE: "/api",
    showSignedInApp: async () => {
      idWhenAppLoaded = { default: defaultTournament.id, tournament: state.tournament.id };
    },
  };
  const names = Object.keys(helpers);
  const build = new Function(
    ...names,
    `${extract("applyCurrentEventId")}\n${extract("hydrateAuth")}\n${extract("recoverPasswordlessAuth")}\nreturn recoverPasswordlessAuth;`
  );
  const recoverPasswordlessAuth = build(...names.map((name) => helpers[name]));

  assert.equal(await recoverPasswordlessAuth(), true);
  assert.deepEqual(idWhenAppLoaded, { default: "fall_classic", tournament: "fall_classic" });
});
