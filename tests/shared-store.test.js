const test = require("node:test");
const assert = require("node:assert");
const { createSharedStore } = require("../shared-store.js");
const tournamentMatch = require("../tournament-match.js");

const TOURNAMENT_KEY = "ac-pickle-score-tournament-v1";

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
        completedAt: null,
        gameId: null,
        durationSeconds: null,
        durationMinutes: null,
        startedAt: null,
        startedBy: null,
        activeGameId: null,
      },
    ],
    generatedAt: "2026-09-13T10:00:00.000Z",
    seed: 12345,
    ...overrides,
  };
}

test("loads tournament from server when reachable and saves to local cache", async () => {
  const serverTournament = sampleTournament({ courts: 4, name: "Summer Open" });
  const storage = createMemoryStorage();
  const fetchCalls = [];

  const mockFetch = async (url, options) => {
    fetchCalls.push({ url, options });
    return {
      ok: true,
      json: async () => ({ ok: true, tournament: serverTournament }),
    };
  };

  const store = createSharedStore({
    storage,
    fetch: mockFetch,
    tournamentMatch,
    session: { headers: () => ({ "X-Session-Token": "test-token" }) },
  });

  const result = await store.loadTournament("open_play");

  assert.strictEqual(result.ok, true);
  assert.strictEqual(store.getSource(), "shared");
  assert.strictEqual(store.getStatus(), "Showing shared XAMPP Tournament.");
  assert.strictEqual(store.getTournament().courts, 4);
  assert.strictEqual(store.getTournament().name, "Summer Open");

  // Local storage should now contain the server tournament
  const cached = JSON.parse(storage.getItem(TOURNAMENT_KEY));
  assert.strictEqual(cached.courts, 4);
  assert.strictEqual(cached.name, "Summer Open");

  // Verify fetch call details
  assert.strictEqual(fetchCalls.length, 1);
  assert.match(fetchCalls[0].url, /api\/get-tournament\.php\?id=open_play/);
  assert.strictEqual(fetchCalls[0].options.headers["X-Session-Token"], "test-token");
});

test("falls back to local setup when server returns no tournament yet", async () => {
  const localTournament = sampleTournament({ courts: 2, name: "Local Setup" });
  const storage = createMemoryStorage({
    [TOURNAMENT_KEY]: JSON.stringify(localTournament),
  });

  const mockFetch = async () => ({
    ok: true,
    json: async () => ({ ok: true, tournament: null }),
  });

  const store = createSharedStore({
    storage,
    fetch: mockFetch,
    tournamentMatch,
  });

  const result = await store.loadTournament("open_play");

  assert.strictEqual(result.ok, true);
  assert.strictEqual(store.getSource(), "local");
  assert.strictEqual(store.getStatus(), "No shared tournament yet; showing this browser's local setup.");
  assert.strictEqual(store.getTournament().name, "Local Setup");
});

test("saves tournament to server when reachable and updates cache", async () => {
  const updatedTournament = sampleTournament({ courts: 3, name: "Updated Tournament" });
  const storage = createMemoryStorage();
  let receivedBody = null;

  const mockFetch = async (url, options) => {
    receivedBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ ok: true, tournament: receivedBody.tournament }),
    };
  };

  const store = createSharedStore({
    storage,
    fetch: mockFetch,
    tournamentMatch,
    session: { headers: () => ({ "X-Session-Token": "admin-token" }) },
  });

  const result = await store.saveTournament(updatedTournament, { intent: "schedule-update" });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(receivedBody.intent, "schedule-update");
  assert.strictEqual(receivedBody.tournament.name, "Updated Tournament");
  assert.strictEqual(store.getSource(), "shared");
  assert.strictEqual(store.getStatus(), "Tournament saved to shared XAMPP database.");
  assert.strictEqual(store.getTournament().name, "Updated Tournament");

  const cached = JSON.parse(storage.getItem(TOURNAMENT_KEY));
  assert.strictEqual(cached.name, "Updated Tournament");
});

test("updates tournament match on server when reachable", async () => {
  const initialTournament = sampleTournament();
  const storage = createMemoryStorage({
    [TOURNAMENT_KEY]: JSON.stringify(initialTournament),
  });

  const matchUpdate = {
    tournamentId: "open_play",
    matchId: "match_1",
    status: "in_progress",
    scoreA: "5",
    scoreB: "3",
  };

  const mockFetch = async (url, options) => {
    const body = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        ok: true,
        matchId: body.match.matchId,
        match: {
          ...initialTournament.matches[0],
          ...body.match,
        },
      }),
    };
  };

  const store = createSharedStore({
    storage,
    fetch: mockFetch,
    tournamentMatch,
  });

  const result = await store.saveTournamentMatch(matchUpdate, { intent: "score-sync" });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(store.getSource(), "shared");
  assert.strictEqual(store.getStatus(), "Live match score saved to shared XAMPP database.");
  assert.strictEqual(store.getTournament().matches[0].scoreA, "5");
  assert.strictEqual(store.getTournament().matches[0].scoreB, "3");
  assert.strictEqual(store.getTournament().matches[0].status, "in_progress");

  const cached = JSON.parse(storage.getItem(TOURNAMENT_KEY));
  assert.strictEqual(cached.matches[0].scoreA, "5");
});

test("when a Live poll fails, the store keeps the last Tournament the server sent (does NOT revert to local storage)", async () => {
  const staleLocalTournament = sampleTournament({
    courts: 1,
    name: "Stale Local Copy",
    matches: [],
  });
  const serverTournament = sampleTournament({
    courts: 4,
    name: "Live Server Tournament",
    matches: [
      {
        id: "match_live_1",
        round: 1,
        court: 1,
        teamA: ["Alice", "Bob"],
        teamB: ["Charlie", "Dave"],
        scoreA: "9",
        scoreB: "7",
        status: "in_progress",
      },
    ],
  });

  const storage = createMemoryStorage({
    [TOURNAMENT_KEY]: JSON.stringify(staleLocalTournament),
  });

  let shouldFail = false;
  const mockFetch = async () => {
    if (shouldFail) {
      return {
        ok: false,
        status: 500,
        json: async () => ({ ok: false, error: "Database connection failed" }),
      };
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

  // 1. Initial live poll succeeds with server tournament
  const poll1 = await store.pollTournament("open_play");
  assert.strictEqual(poll1.ok, true);
  assert.strictEqual(store.getTournament().name, "Live Server Tournament");
  assert.strictEqual(store.getTournament().courts, 4);
  assert.strictEqual(store.getTournament().matches.length, 1);

  // 2. Modify localStorage behind the scenes to simulate a stale/different local copy
  storage.setItem(TOURNAMENT_KEY, JSON.stringify(staleLocalTournament));

  // 3. Next live poll fails (server error)
  shouldFail = true;
  const poll2 = await store.pollTournament("open_play");

  assert.strictEqual(poll2.ok, false);
  // CRITICAL REQUIREMENT: Must keep the last tournament the server sent!
  // Must NOT revert to staleLocalTournament!
  assert.strictEqual(store.getTournament().name, "Live Server Tournament");
  assert.strictEqual(store.getTournament().courts, 4);
  assert.strictEqual(store.getTournament().matches.length, 1);
  assert.strictEqual(store.getTournament().matches[0].scoreA, "9");
});

test("when saving tournament fails, saves locally and updates status with error", async () => {
  const storage = createMemoryStorage();
  const mockFetch = async () => ({
    ok: false,
    json: async () => ({ ok: false, error: "Server offline" }),
  });

  const store = createSharedStore({
    storage,
    fetch: mockFetch,
    tournamentMatch,
  });

  const newTournament = sampleTournament({ name: "Offline Draft" });
  const result = await store.saveTournament(newTournament);

  assert.strictEqual(result.ok, false);
  assert.strictEqual(store.getSource(), "local");
  assert.strictEqual(store.getStatus(), "Shared tournament save failed: Server offline.");

  // Saved locally in storage
  const cached = JSON.parse(storage.getItem(TOURNAMENT_KEY));
  assert.strictEqual(cached.name, "Offline Draft");
});

test("a new Live poll never starts while the previous one is still waiting (slow response)", async () => {
  const storage = createMemoryStorage();
  let fetchCount = 0;
  let resolveFirstFetch = null;

  const mockFetch = async (url, options) => {
    fetchCount++;
    if (fetchCount === 1) {
      // Slow response: wait until explicitly resolved
      return new Promise((resolve) => {
        resolveFirstFetch = () =>
          resolve({
            ok: true,
            json: async () => ({
              ok: true,
              tournament: sampleTournament({ name: "First Response" }),
            }),
          });
      });
    }
    return {
      ok: true,
      json: async () => ({
        ok: true,
        tournament: sampleTournament({ name: "Second Response" }),
      }),
    };
  };

  const store = createSharedStore({
    storage,
    fetch: mockFetch,
    tournamentMatch,
  });

  // 1. Start slow poll
  const pollPromise1 = store.pollTournament("open_play");

  // In flight guard should be active
  assert.strictEqual(store.isPolling(), true);
  assert.strictEqual(fetchCount, 1);

  // 2. Attempt to trigger a second poll while the first is still in flight
  const pollPromise2 = store.pollTournament("open_play");

  // Second poll should NOT start a new fetch!
  assert.strictEqual(fetchCount, 1);
  const poll2Result = await pollPromise2;
  assert.strictEqual(poll2Result.skipped, true);
  assert.strictEqual(poll2Result.inFlight, true);

  // 3. Resolve the first fetch
  resolveFirstFetch();
  const poll1Result = await pollPromise1;
  assert.strictEqual(poll1Result.ok, true);
  assert.strictEqual(store.isPolling(), false);
  assert.strictEqual(store.getTournament().name, "First Response");

  // 4. Now that first fetch has completed, subsequent poll CAN start
  const poll3Result = await store.pollTournament("open_play");
  assert.strictEqual(fetchCount, 2);
  assert.strictEqual(poll3Result.ok, true);
  assert.strictEqual(store.getTournament().name, "Second Response");
});

test("pollTournament sends since query param and handles unchanged reply", async () => {
  const serverTournament = sampleTournament({
    courts: 4,
    name: "Live Server Tournament",
    _updatedAt: "2026-09-13 14:00:00.123456",
  });
  const storage = createMemoryStorage();
  const fetchCalls = [];

  const mockFetch = async (url, options) => {
    fetchCalls.push({ url, options });
    if (fetchCalls.length === 1) {
      return {
        ok: true,
        json: async () => ({ ok: true, tournament: serverTournament }),
      };
    }
    // Second call receives unchanged reply
    return {
      ok: true,
      json: async () => ({ ok: true, unchanged: true }),
    };
  };

  const store = createSharedStore({
    storage,
    fetch: mockFetch,
    tournamentMatch,
  });

  // First poll gets full tournament
  const poll1 = await store.pollTournament("open_play");
  assert.strictEqual(poll1.ok, true);
  assert.strictEqual(store.getTournament()._updatedAt, "2026-09-13 14:00:00.123456");

  // Second poll should include &since=
  const poll2 = await store.pollTournament("open_play");
  assert.strictEqual(fetchCalls.length, 2);
  assert.match(fetchCalls[1].url, /since=2026-09-13(%20|\+)14%3A00%3A00\.123456/);

  // Poll 2 result should be unchanged: true, leaving existing tournament intact
  assert.strictEqual(poll2.ok, true);
  assert.strictEqual(poll2.unchanged, true);
  assert.strictEqual(store.getTournament().name, "Live Server Tournament");
  assert.strictEqual(store.getTournament()._updatedAt, "2026-09-13 14:00:00.123456");
});

test("loads history from server when reachable and updates status", async () => {
  const serverGames = [
    { id: "game_1", type: "doubles", teamA: { name: "Team A", score: 11 }, teamB: { name: "Team B", score: 9 }, endedAt: "2026-09-13T12:00:00Z" },
  ];
  const storage = createMemoryStorage();
  const mockFetch = async () => {
    return {
      ok: true,
      json: async () => ({ ok: true, games: serverGames }),
    };
  };

  const store = createSharedStore({
    storage,
    fetch: mockFetch,
    session: { headers: () => ({ "X-Session-Token": "test-token" }), portal: () => "admin" },
  });

  const result = await store.loadHistory();
  assert.strictEqual(result.ok, true);
  assert.strictEqual(store.getHistorySource(), "shared");
  assert.strictEqual(store.getHistoryStatus(), "Showing 1 shared match.");
  assert.strictEqual(store.getHistory().length, 1);
  assert.strictEqual(store.getHistory()[0].id, "game_1");
});

test("falls back to local history when server is unreachable", async () => {
  const localGames = [
    { id: "local_1", type: "singles", teamA: { name: "A", score: 11 }, teamB: { name: "B", score: 7 } },
  ];
  const storage = createMemoryStorage({
    "ac-pickle-score-history-v1": JSON.stringify(localGames),
  });
  const mockFetch = async () => {
    throw new Error("Network error");
  };

  const store = createSharedStore({
    storage,
    fetch: mockFetch,
    session: { portal: () => "admin" },
  });

  const result = await store.loadHistory();
  assert.strictEqual(result.ok, false);
  assert.strictEqual(store.getHistorySource(), "local");
  assert.strictEqual(store.getHistoryStatus(), "Shared database unavailable; showing 1 local cached match.");
  assert.strictEqual(store.getHistory().length, 1);
  assert.strictEqual(store.getHistory()[0].id, "local_1");
});

test("saves game to server when reachable and updates status", async () => {
  const gameToSave = { id: "game_new", type: "doubles" };
  const fetchCalls = [];
  const mockFetch = async (url, options) => {
    fetchCalls.push({ url, options });
    return {
      ok: true,
      json: async () => ({ ok: true, id: "game_new" }),
    };
  };

  const store = createSharedStore({
    fetch: mockFetch,
    session: { headers: () => ({ "X-Session-Token": "test-token" }), portal: () => "admin" },
  });

  const result = await store.saveGame(gameToSave);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(store.getHistorySource(), "shared");
  assert.strictEqual(store.getHistoryStatus(), "Latest match saved to shared history.");
  assert.strictEqual(result.toast, "Match saved to shared history");
  assert.strictEqual(fetchCalls.length, 1);
  assert.match(fetchCalls[0].url, /api\/save-game\.php/);
});

test("falls back when saving game to server fails", async () => {
  const gameToSave = { id: "game_new", type: "doubles" };
  const mockFetch = async () => {
    throw new Error("Connection refused");
  };

  const store = createSharedStore({
    fetch: mockFetch,
    session: { portal: () => "admin" },
  });

  const result = await store.saveGame(gameToSave);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(store.getHistorySource(), "local");
  assert.strictEqual(
    store.getHistoryStatus(),
    "Latest match saved locally only; shared database was unavailable."
  );
  assert.strictEqual(result.toast, "Match saved locally; shared history unavailable");
});

test("shows the server's reason when a saved Match is refused", async () => {
  const store = createSharedStore({
    fetch: async () => ({
      ok: false,
      json: async () => ({ ok: false, error: "Winner must correspond to the higher score" }),
    }),
    session: { portal: () => "admin" },
  });

  const result = await store.saveGame({ id: "invalid_result" });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.toast, "Winner must correspond to the higher score");
});

test("loads users when reachable and handles failure when unreachable", async () => {
  const userList = [{ id: 1, username: "admin", role: "super_admin" }];
  let shouldFail = false;
  const mockFetch = async () => {
    if (shouldFail) {
      throw new Error("Users service down");
    }
    return {
      ok: true,
      json: async () => ({ ok: true, users: userList }),
    };
  };

  const store = createSharedStore({
    fetch: mockFetch,
    session: { headers: () => ({}) },
  });

  // Success case
  const successResult = await store.loadUsers();
  assert.strictEqual(successResult.ok, true);
  assert.strictEqual(store.getUsers().length, 1);
  assert.strictEqual(store.getUsersStatus(), "Showing 1 user.");

  // Failure case preserves previously loaded users
  shouldFail = true;
  const failResult = await store.loadUsers();
  assert.strictEqual(failResult.ok, false);
  assert.strictEqual(store.getUsers().length, 1);
  assert.strictEqual(store.getUsersStatus(), "Users service down");

  // Fresh store failing initial load has empty user list
  const freshFailStore = createSharedStore({
    fetch: async () => { throw new Error("Users unreachable"); },
  });
  const freshResult = await freshFailStore.loadUsers();
  assert.strictEqual(freshResult.ok, false);
  assert.strictEqual(freshFailStore.getUsers().length, 0);
  assert.strictEqual(freshFailStore.getUsersStatus(), "Users unreachable");
});

test("loads network info when reachable and falls back when unreachable", async () => {
  let shouldFail = false;
  const mockFetch = async () => {
    if (shouldFail) {
      throw new Error("Network detection failed");
    }
    return {
      ok: true,
      json: async () => ({
        ok: true,
        urls: ["http://192.168.1.50/mtc-paddlepoint"],
        preferredUrl: "http://192.168.1.50/mtc-paddlepoint",
        hostname: "pickleball-server",
        ips: ["192.168.1.50"],
      }),
    };
  };

  const store = createSharedStore({ fetch: mockFetch });

  // Success case
  const successResult = await store.loadNetworkInfo({ fallbackUrl: "http://localhost/app" });
  assert.strictEqual(successResult.ok, true);
  assert.strictEqual(store.getNetworkInfo().urls.length, 1);
  assert.strictEqual(store.getNetworkInfo().preferredUrl, "http://192.168.1.50/mtc-paddlepoint");
  assert.strictEqual(store.getNetworkInfo().status, "LAN link ready for same Wi-Fi devices.");

  // Failure case
  shouldFail = true;
  const failResult = await store.loadNetworkInfo({ fallbackUrl: "http://localhost/app" });
  assert.strictEqual(failResult.ok, false);
  assert.strictEqual(store.getNetworkInfo().urls.length, 0);
  assert.strictEqual(store.getNetworkInfo().preferredUrl, "http://localhost/app");
  assert.strictEqual(store.getNetworkInfo().status, "Could not detect LAN IP; using current browser link.");
});
