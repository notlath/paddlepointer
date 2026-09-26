const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createSharedStore } = require("../shared-store.js");
const tournamentMatch = require("../tournament-match.js");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const cssCode = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");

function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
  };
}

function sampleTournament(overrides = {}) {
  return {
    id: "open_play",
    name: "Open Play",
    courts: 2,
    matchesPerPlayer: 4,
    targetScore: 11,
    averageGameMinutes: 15,
    transitionMinutes: 3,
    bufferMinutes: 30,
    timingVersion: 1,
    winByTwo: true,
    playersText: "Alice\nBob\nCharlie\nDave",
    matches: [
      {
        id: "match_1",
        round: 1,
        court: 1,
        teamA: ["Alice", "Bob"],
        teamB: ["Charlie", "Dave"],
        scoreA: "0",
        scoreB: "0",
        status: "scheduled",
        winner: null,
      },
    ],
    generatedAt: "2026-09-13T10:00:00.000Z",
    seed: 12345,
    ...overrides,
  };
}

test("when a manual tournament refresh fails, sharedStore preserves the last server tournament", async () => {
  const serverTournament = sampleTournament({ name: "Server Tournament", courts: 4 });
  const localTournament = sampleTournament({ name: "Stale Local Tournament", courts: 1 });
  const storage = createMemoryStorage({
    "ac-pickle-score-tournament-v1": JSON.stringify(localTournament),
  });

  let shouldFail = false;
  const mockFetch = async () => {
    if (shouldFail) {
      throw new Error("Network offline");
    }
    return {
      ok: true,
      json: async () => ({ ok: true, tournament: serverTournament }),
    };
  };

  const store = createSharedStore({
    storage,
    fetch: mockFetch,
    tournamentMatch,
  });

  // Initial load succeeds
  const initial = await store.loadTournament("open_play");
  assert.equal(initial.ok, true);
  assert.equal(store.getTournament().name, "Server Tournament");

  // Subsequent manual refresh fails
  shouldFail = true;
  const failedRefresh = await store.loadTournament("open_play");
  assert.equal(failedRefresh.ok, false);
  // Must preserve server tournament, NOT revert to Stale Local Tournament
  assert.equal(store.getTournament().name, "Server Tournament");
  assert.equal(failedRefresh.tournament.name, "Server Tournament");
});

test("when a manual history refresh fails, sharedStore preserves the last loaded shared games", async () => {
  const sharedGames = [
    { id: "game_1", type: "singles", teamA: { name: "Alice", score: 11 }, teamB: { name: "Bob", score: 9 }, winner: "teamA" },
    { id: "game_2", type: "singles", teamA: { name: "Charlie", score: 11 }, teamB: { name: "Dave", score: 7 }, winner: "teamA" },
  ];
  const storage = createMemoryStorage({
    "ac-pickle-score-history-v1": JSON.stringify([]), // Empty local cache
  });

  let shouldFail = false;
  const mockFetch = async () => {
    if (shouldFail) {
      throw new Error("Shared history endpoint timeout");
    }
    return {
      ok: true,
      json: async () => ({ ok: true, games: sharedGames }),
    };
  };

  const store = createSharedStore({
    storage,
    fetch: mockFetch,
    tournamentMatch,
  });

  const initial = await store.loadHistory();
  assert.equal(initial.ok, true);
  assert.equal(store.getHistory().length, 2);

  shouldFail = true;
  const failed = await store.loadHistory();
  assert.equal(failed.ok, false);
  // Preserves existing 2 games instead of reverting to empty local cache
  assert.equal(store.getHistory().length, 2);
  assert.equal(failed.games.length, 2);
});

test("styles.css defines styles for updating states, freshness cues, and error banners without disabling pointer events", () => {
  assert.match(cssCode, /\.is-updating\s*\{/, "styles.css must style .is-updating");
  assert.doesNotMatch(cssCode, /\.is-updating\s*\{[^}]*pointer-events:\s*none/, ".is-updating must not disable pointer events");
  assert.match(cssCode, /\.data-updating-badge\s*\{/, "styles.css must style .data-updating-badge");
  assert.match(cssCode, /\.data-freshness-cue\s*\{/, "styles.css must style .data-freshness-cue");
  assert.match(cssCode, /\.data-refresh-error-banner\s*\{/, "styles.css must style .data-refresh-error-banner");
});

test("app.js initializes refresh state, error tracking, and timestamps in state", () => {
  assert.match(appCode, /refreshingUsers:\s*false/, "app.js must initialize refreshingUsers");
  assert.match(appCode, /refreshingHistory:\s*false/, "app.js must initialize refreshingHistory");
  assert.match(appCode, /refreshingLeaderboard:\s*false/, "app.js must initialize refreshingLeaderboard");
  assert.match(appCode, /refreshingTournament:\s*false/, "app.js must initialize refreshingTournament");
  assert.match(appCode, /usersRefreshError:\s*null/, "app.js must initialize usersRefreshError");
  assert.match(appCode, /historyRefreshError:\s*null/, "app.js must initialize historyRefreshError");
  assert.match(appCode, /leaderboardRefreshError:\s*null/, "app.js must initialize leaderboardRefreshError");
  assert.match(appCode, /tournamentRefreshError:\s*null/, "app.js must initialize tournamentRefreshError");
  assert.match(appCode, /lastFetched:\s*\{/, "app.js must initialize lastFetched map");
});

test("app.js guards fetchUsers, refreshSharedHistory, refreshSharedLeaderboard, and refreshSharedTournament against duplicate in-flight calls", () => {
  assert.match(appCode, /if\s*\(\s*state\.refreshingUsers\s*\)\s*return/, "fetchUsers must guard duplicate activation");
  assert.match(appCode, /if\s*\(\s*state\.refreshingHistory\s*\)\s*return/, "refreshSharedHistory must guard duplicate activation");
  assert.match(appCode, /if\s*\(\s*state\.refreshingLeaderboard\s*\)\s*return/, "refreshSharedLeaderboard must guard duplicate activation");
  assert.match(appCode, /if\s*\(\s*state\.refreshingTournament\s*\)\s*return/, "refreshSharedTournament must guard duplicate activation");
});

test("app.js announces completion on successful manual refresh via showToast without rebuilding unrelated content", () => {
  assert.match(appCode, /showToast\(\s*["']Users refreshed["']\s*\)/, "fetchUsers must announce completion via showToast");
  assert.match(appCode, /showToast\(\s*["']History refreshed["']\s*\)/, "refreshSharedHistory must announce completion via showToast");
  assert.match(appCode, /showToast\(\s*["']Leaderboard refreshed["']\s*\)/, "refreshSharedLeaderboard must announce completion via showToast");
  assert.match(appCode, /showToast\(\s*["']Tournament refreshed["']\s*\)/, "refreshSharedTournament must announce completion via showToast");
});

test("app.js views render visible retry actions and error banners when refresh fails", () => {
  assert.match(appCode, /function\s+renderRefreshErrorBanner\s*\(/, "app.js must define reusable renderRefreshErrorBanner helper");
  assert.match(appCode, /renderRefreshErrorBanner\(\s*state\.usersRefreshError,\s*["']refresh-users["']\s*\)/, "Admin dashboard must render retry action on users refresh error");
  assert.match(appCode, /renderRefreshErrorBanner\(\s*state\.historyRefreshError,\s*["']refresh-history["']\s*\)/, "History view must render retry action on history refresh error");
  assert.match(appCode, /renderRefreshErrorBanner\(\s*state\.leaderboardRefreshError,\s*["']refresh-leaderboard["']\s*\)/, "Leaderboard view must render retry action on leaderboard refresh error");
  assert.match(appCode, /renderRefreshErrorBanner\(\s*state\.tournamentRefreshError,\s*["']refresh-tournament["']\s*\)/, "Tournament/Live view must render retry action on tournament refresh error");
});

test("app.js renders pending state on refresh buttons and marks regions as updating", () => {
  assert.match(appCode, /data-action=["']refresh-users["'][\s\S]+?disabled[\s\S]+?aria-busy=["']true["']/, "Refresh users button must reflect pending state");
  assert.match(appCode, /data-action=["']refresh-history["'][\s\S]+?disabled[\s\S]+?aria-busy=["']true["']/, "Refresh history button must reflect pending state");
  assert.match(appCode, /data-action=["']refresh-leaderboard["'][\s\S]+?disabled[\s\S]+?aria-busy=["']true["']/, "Refresh leaderboard button must reflect pending state");
  assert.match(appCode, /data-action=["']refresh-tournament["'][\s\S]+?disabled[\s\S]+?aria-busy=["']true["']/, "Refresh tournament button must reflect pending state");
  assert.match(appCode, /class=["'][^"']*tournament-layout\s*\$\{state\.refreshingTournament\s*\?\s*["']is-updating["']/, "Tournament layout must communicate pending state");
});

test("app.js preserves active element focus across renders during live updates without orphan code", () => {
  assert.match(appCode, /savedFocusSelector/, "render must capture savedFocusSelector to preserve active element");
  assert.match(appCode, /elToFocus\.focus/, "render must restore focus to saved element");
  assert.doesNotMatch(appCode, /focusedLiveTabValue/, "render must not retain orphaned focusedLiveTabValue branches");
});

test("app.js defines formatFreshness helper identifying potentially stale data during refresh", () => {
  assert.match(appCode, /function\s+formatFreshness\s*\(/, "app.js must define formatFreshness helper");
  assert.match(appCode, /Updating…\s*\(showing previous data\)/, "formatFreshness must identify existing data as potentially stale when pending");
  assert.match(appCode, /Updated just now/, "formatFreshness must support relative recent timestamp");
  assert.match(appCode, /data-freshness-cue/, "app.js views must render data-freshness-cue");
});


