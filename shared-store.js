(function (root) {
  "use strict";

  const TOURNAMENT_KEY = "ac-pickle-score-tournament-v1";
  const HISTORY_KEY = "ac-pickle-score-history-v1";
  const DEFAULT_API_BASE = "api";

  function defaultCompareHistoryGamesDesc(first, second) {
    const rawA = first && (first.endedAt || first.createdAt || first.savedAt);
    const rawB = second && (second.endedAt || second.createdAt || second.savedAt);
    const timeA = rawA ? new Date(rawA).getTime() : 0;
    const timeB = rawB ? new Date(rawB).getTime() : 0;
    return (Number.isFinite(timeB) ? timeB : 0) - (Number.isFinite(timeA) ? timeA : 0);
  }

  function defaultMergeHistoryGames(primary, secondary) {
    const seen = new Set();
    return [primary, secondary]
      .flatMap((group) => (Array.isArray(group) ? group : []))
      .filter((game) => {
        if (!game || !game.id || seen.has(game.id)) return false;
        seen.add(game.id);
        return true;
      })
      .sort(defaultCompareHistoryGamesDesc)
      .slice(0, 200);
  }

  function defaultIsVisitorGame(game) {
    return Boolean(game && (game.matchScope === "visitor" || (game.createdBy && game.createdBy.role === "visitor")));
  }

  const defaultTournamentFallback = {
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
    playersText: "",
    matches: [],
    generatedAt: null,
    seed: null,
  };

  function defaultNormalizeTournament(tournament, baseDefault) {
    const base = baseDefault || defaultTournamentFallback;
    const source = tournament || {};
    const hasTimingSettings = Number(source.timingVersion) >= 1;
    const matches = Array.isArray(source.matches)
      ? source.matches
          .map((match, index) => ({
            id: match.id || `open_saved_${index + 1}`,
            round: Number(match.round) || 1,
            court: Number(match.court) || 1,
            teamA: Array.isArray(match.teamA)
              ? match.teamA.map((p) => String(p || "").trim()).filter(Boolean).slice(0, 2)
              : [],
            teamB: Array.isArray(match.teamB)
              ? match.teamB.map((p) => String(p || "").trim()).filter(Boolean).slice(0, 2)
              : [],
            scoreA: match.scoreA != null ? String(match.scoreA) : "",
            scoreB: match.scoreB != null ? String(match.scoreB) : "",
            status:
              match.status === "completed"
                ? "completed"
                : match.status === "in_progress"
                ? "in_progress"
                : "scheduled",
            winner: match.winner === "B" ? "B" : match.winner === "A" ? "A" : null,
            completedAt: match.completedAt || null,
            gameId: match.gameId || null,
            durationSeconds: Number(match.durationSeconds) || null,
            durationMinutes: Number(match.durationMinutes) || null,
            startedAt: match.startedAt || null,
            startedBy: match.startedBy || null,
            activeGameId: match.activeGameId || null,
          }))
          .filter((match) => match.teamA.length === 2 && match.teamB.length === 2)
      : [];

    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
    const clean = (val, fallback) => (typeof val === "string" && val.trim() ? val.trim() : fallback);

    return {
      ...base,
      ...source,
      id: clean(source.id, base.id).slice(0, 96),
      name: clean(source.name, base.name).slice(0, 48),
      courts: clamp(Number(source.courts) || base.courts, 1, 16),
      matchesPerPlayer: clamp(Number(source.matchesPerPlayer) || base.matchesPerPlayer, 1, 30),
      targetScore: clamp(Number(source.targetScore) || base.targetScore, 1, 99),
      averageGameMinutes: hasTimingSettings
        ? clamp(Number(source.averageGameMinutes) || base.averageGameMinutes, 5, 60)
        : base.averageGameMinutes,
      transitionMinutes: hasTimingSettings
        ? clamp(
            source.transitionMinutes === 0
              ? 0
              : Number(source.transitionMinutes) || base.transitionMinutes,
            0,
            20
          )
        : base.transitionMinutes,
      bufferMinutes: hasTimingSettings
        ? clamp(
            source.bufferMinutes === 0
              ? 0
              : Number(source.bufferMinutes) || base.bufferMinutes,
            0,
            120
          )
        : base.bufferMinutes,
      timingVersion: base.timingVersion,
      winByTwo: source.winByTwo === undefined ? true : Boolean(source.winByTwo),
      playersText: String(source.playersText || "").slice(0, 4000),
      matches,
      generatedAt: source.generatedAt || null,
      seed: source.seed || null,
      _updatedAt: source._updatedAt || null,
    };
  }

  function createSharedStore(options = {}) {
    const storage =
      options.storage || (typeof window !== "undefined" && window.localStorage) || null;
    const fetchFn =
      options.fetch || (typeof globalThis !== "undefined" && globalThis.fetch) || null;
    const session = options.session || null;
    const apiBase = options.apiBase || DEFAULT_API_BASE;
    const tournamentMatch =
      options.tournamentMatch || (root.PaddlePointTournamentMatch || null);
    const defaultTourn = options.defaultTournament || defaultTournamentFallback;
    const normalize = (t) =>
      typeof options.normalizeTournament === "function"
        ? options.normalizeTournament(t)
        : defaultNormalizeTournament(t, defaultTourn);

    let currentTournament = loadLocalTournament();
    let lastServerTournament = null;
    let source = "local";
    let status = "Local tournament loaded";
    let inFlightPoll = false;

    const mergeHistory = options.mergeHistoryGames || defaultMergeHistoryGames;
    const isVisitorGameFn = options.isVisitorGame || defaultIsVisitorGame;

    let currentHistory = loadLocalHistory();
    let historySource = "local";
    let historyStatus = "Local history loaded";

    let users = [];
    let usersStatus = "";

    let networkInfo = {
      status: "Using the current browser link.",
      preferredUrl: "",
      urls: [],
      hostname: "",
      ips: [],
    };

    function loadLocalTournament() {
      try {
        const saved = storage ? storage.getItem(TOURNAMENT_KEY) : null;
        return saved ? normalize(JSON.parse(saved)) : { ...defaultTourn };
      } catch (error) {
        return { ...defaultTourn };
      }
    }

    function saveLocalTournament(tournament) {
      const normalized = normalize(tournament || currentTournament);
      currentTournament = normalized;
      try {
        if (storage) {
          storage.setItem(TOURNAMENT_KEY, JSON.stringify(normalized));
        }
      } catch (error) {
        // Storage unavailable or full
      }
      return normalized;
    }

    function getTournament() {
      return currentTournament;
    }

    function setTournament(tournament, { persist = true } = {}) {
      if (persist) {
        return saveLocalTournament(tournament);
      }
      currentTournament = normalize(tournament);
      return currentTournament;
    }

    function getSource() {
      return source;
    }

    function getStatus() {
      return status;
    }

    function isPolling() {
      return inFlightPoll;
    }

    function getHeaders() {
      return session && typeof session.headers === "function" ? session.headers() : {};
    }

    async function loadTournament(id, options = {}) {
      const isPoll = Boolean(options.isPoll);
      const tournamentId = id || (currentTournament && currentTournament.id) || defaultTourn.id;
      const since = options.since || null;

      try {
        let url = `${apiBase}/get-tournament.php?id=${encodeURIComponent(tournamentId)}&_=${Date.now()}`;
        if (since) {
          url += `&since=${encodeURIComponent(since)}`;
        }
        const response = await fetchFn(url, {
          method: "GET",
          cache: "no-store",
          headers: getHeaders(),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload && payload.error ? payload.error : "Shared tournament API returned an error");
        }

        if (payload.unchanged) {
          return { ok: true, unchanged: true, tournament: currentTournament, source, status };
        }

        if (payload.tournament) {
          const normalized = normalize(payload.tournament);
          currentTournament = normalized;
          lastServerTournament = normalized;
          source = "shared";
          status = "Showing shared XAMPP Tournament.";
          saveLocalTournament(normalized);
        } else {
          const local = loadLocalTournament();
          currentTournament = local;
          source = "local";
          status = "No shared tournament yet; showing this browser's local setup.";
        }

        return { ok: true, tournament: currentTournament, source, status };
      } catch (error) {
        source = "local";
        if (lastServerTournament) {
          // Keep the last Tournament the server sent; do NOT switch to stale local copy
          currentTournament = lastServerTournament;
        } else if (!currentTournament) {
          currentTournament = loadLocalTournament();
        }
        status = "Shared tournament unavailable; showing local tournament.";
        return {
          ok: false,
          tournament: currentTournament,
          error: error.message || "database unavailable",
          source,
          status,
        };
      }
    }

    async function pollTournament(id) {
      if (inFlightPoll) {
        return { ok: false, skipped: true, inFlight: true, tournament: currentTournament };
      }
      inFlightPoll = true;
      try {
        const since = currentTournament && currentTournament._updatedAt ? currentTournament._updatedAt : null;
        return await loadTournament(id, { isPoll: true, silent: true, since });
      } finally {
        inFlightPoll = false;
      }
    }

    async function saveTournament(tournament, options = {}) {
      const intent = options.intent ? String(options.intent) : "";
      const toSave = tournament || currentTournament;

      try {
        const response = await fetchFn(`${apiBase}/save-tournament.php`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getHeaders() },
          body: JSON.stringify({ tournament: toSave, intent }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload && payload.error ? payload.error : "Shared tournament save failed");
        }

        if (payload.tournament) {
          const normalized = normalize(payload.tournament);
          currentTournament = normalized;
          lastServerTournament = normalized;
          saveLocalTournament(normalized);
        }
        source = "shared";
        status = "Tournament saved to shared XAMPP database.";
        return { ok: true, tournament: currentTournament, source, status };
      } catch (error) {
        saveLocalTournament(toSave);
        source = "local";
        status = `Shared tournament save failed: ${error.message || "database unavailable"}.`;
        return {
          ok: false,
          error: error.message || "database unavailable",
          source,
          status,
          tournament: currentTournament,
        };
      }
    }

    async function saveTournamentMatch(matchUpdate, options = {}) {
      if (!matchUpdate) {
        return { ok: false, error: "Missing match update payload" };
      }
      const intent = options.intent ? String(options.intent) : "score-sync";

      try {
        const response = await fetchFn(`${apiBase}/save-tournament-match.php`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getHeaders() },
          body: JSON.stringify({ match: matchUpdate, intent }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload && payload.error ? payload.error : "Shared match update failed");
        }

        if (tournamentMatch && typeof tournamentMatch.applyServerMatch === "function") {
          const applied = tournamentMatch.applyServerMatch(currentTournament, payload);
          if (applied.ok && applied.tournament) {
            const normalized = normalize(applied.tournament);
            currentTournament = normalized;
            lastServerTournament = normalized;
            saveLocalTournament(normalized);
          }
        } else if (payload.tournament) {
          const normalized = normalize(payload.tournament);
          currentTournament = normalized;
          lastServerTournament = normalized;
          saveLocalTournament(normalized);
        }

        source = "shared";
        status = "Live match score saved to shared XAMPP database.";
        return { ok: true, tournament: currentTournament, match: payload.match, source, status };
      } catch (error) {
        source = "local";
        status = `Shared match update failed: ${error.message || "database unavailable"}.`;
        return { ok: false, error: error.message || "database unavailable", source, status };
      }
    }

    function loadLocalHistory() {
      try {
        const saved = storage ? storage.getItem(HISTORY_KEY) : null;
        const games = saved ? JSON.parse(saved) : [];
        return Array.isArray(games) ? games : [];
      } catch (error) {
        return [];
      }
    }

    function saveLocalHistory(games) {
      const list = Array.isArray(games) ? games : [];
      currentHistory = list;
      try {
        if (storage) {
          storage.setItem(HISTORY_KEY, JSON.stringify(list));
        }
      } catch (error) {
        // Storage unavailable or full
      }
      return list;
    }

    function getHistory() {
      return currentHistory;
    }

    function setHistory(games, { persist = true } = {}) {
      if (persist) {
        return saveLocalHistory(games);
      }
      currentHistory = Array.isArray(games) ? games : [];
      return currentHistory;
    }

    function getHistorySource() {
      return historySource;
    }

    function getHistoryStatus() {
      return historyStatus;
    }

    async function loadHistory(options = {}) {
      const isVisitor =
        options.isVisitor !== undefined
          ? Boolean(options.isVisitor)
          : Boolean(session && typeof session.portal === "function" && session.portal() === "visitor");
      const localGames = loadLocalHistory();

      try {
        const response = await fetchFn(`${apiBase}/get-history.php?limit=200&_=${Date.now()}`, {
          method: "GET",
          cache: "no-store",
          headers: getHeaders(),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok || !Array.isArray(payload.games)) {
          throw new Error(payload && payload.error ? payload.error : "Shared history API returned an error");
        }

        const games = isVisitor
          ? mergeHistory(payload.games, localGames.filter(isVisitorGameFn))
          : payload.games;
        currentHistory = games;
        historySource = "shared";
        historyStatus = isVisitor
          ? `Showing ${games.length} permanent visitor match${games.length === 1 ? "" : "es"} from shared history.`
          : `Showing ${payload.games.length} shared match${payload.games.length === 1 ? "" : "es"}.`;

        return { ok: true, games, source: historySource, status: historyStatus };
      } catch (error) {
        const games = isVisitor
          ? mergeHistory(currentHistory, localGames.filter(isVisitorGameFn))
          : (currentHistory && currentHistory.length > 0 ? currentHistory : localGames);
        currentHistory = games;
        historySource = "local";
        historyStatus = isVisitor
          ? `Shared database unavailable; showing ${games.length} local visitor match${games.length === 1 ? "" : "es"}.`
          : `Shared database unavailable; showing ${localGames.length} local cached match${localGames.length === 1 ? "" : "es"}.`;

        return {
          ok: false,
          games,
          error: error.message || "Shared history API returned an error",
          source: historySource,
          status: historyStatus,
        };
      }
    }

    async function saveGame(game, options = {}) {
      const isVisitor =
        options.isVisitor !== undefined
          ? Boolean(options.isVisitor)
          : Boolean(session && typeof session.portal === "function" && session.portal() === "visitor");

      try {
        const response = await fetchFn(`${apiBase}/save-game.php`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getHeaders() },
          body: JSON.stringify({ game }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          const error = new Error(payload && payload.error ? payload.error : "Shared save failed");
          error.serverRefusal = true;
          throw error;
        }

        historySource = "shared";
        historyStatus = isVisitor
          ? "Latest visitor match saved to shared history."
          : "Latest match saved to shared history.";

        return {
          ok: true,
          source: historySource,
          status: historyStatus,
          toast: isVisitor ? "Match saved to visitor history" : "Match saved to shared history",
          payload,
        };
      } catch (error) {
        historySource = "local";
        historyStatus = isVisitor
          ? "Latest visitor match saved locally only; shared database was unavailable."
          : "Latest match saved locally only; shared database was unavailable.";

        return {
          ok: false,
          source: historySource,
          status: historyStatus,
          toast: error.serverRefusal
            ? error.message
            : isVisitor
              ? "Match saved locally; visitor shared history unavailable"
              : "Match saved locally; shared history unavailable",
          error: error.message || "database unavailable",
        };
      }
    }

    function getUsers() {
      return users;
    }

    function getUsersStatus() {
      return usersStatus;
    }

    async function loadUsers(options = {}) {
      try {
        const response = await fetchFn(`${apiBase}/auth.php?action=users&_=${Date.now()}`, {
          method: "GET",
          cache: "no-store",
          headers: getHeaders(),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok || !Array.isArray(payload.users)) {
          throw new Error(payload && payload.error ? payload.error : "Users could not be loaded");
        }

        users = payload.users;
        usersStatus = `Showing ${payload.users.length} user${payload.users.length === 1 ? "" : "s"}.`;

        return { ok: true, users, status: usersStatus };
      } catch (error) {
        usersStatus = error.message || "Users unavailable";
        return {
          ok: false,
          users,
          status: usersStatus,
          error: error.message || "Users could not be loaded",
        };
      }
    }

    function getNetworkInfo() {
      return networkInfo;
    }

    async function loadNetworkInfo(options = {}) {
      const fallbackUrl = options.fallbackUrl || "";
      try {
        const response = await fetchFn(`${apiBase}/network-info.php?_=${Date.now()}`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload && payload.error ? payload.error : "Network info unavailable");
        }

        const urls = Array.isArray(payload.urls) ? payload.urls.filter(Boolean) : [];
        networkInfo = {
          status: urls.length ? "LAN link ready for same Wi-Fi devices." : "Using the current browser link.",
          preferredUrl: payload.preferredUrl || urls[0] || fallbackUrl,
          urls,
          hostname: payload.hostname || "",
          ips: Array.isArray(payload.ips) ? payload.ips : [],
        };

        return { ok: true, network: networkInfo };
      } catch (error) {
        networkInfo = {
          status: "Could not detect LAN IP; using current browser link.",
          preferredUrl: fallbackUrl,
          urls: [],
          hostname: "",
          ips: [],
        };

        return {
          ok: false,
          network: networkInfo,
          error: error.message || "Network info unavailable",
        };
      }
    }

    return {
      getTournament,
      setTournament,
      getSource,
      getStatus,
      isPolling,
      loadLocalTournament,
      saveLocalTournament,
      loadTournament,
      pollTournament,
      saveTournament,
      saveTournamentMatch,

      // History
      loadLocalHistory,
      saveLocalHistory,
      getHistory,
      setHistory,
      getHistorySource,
      getHistoryStatus,
      loadHistory,
      saveGame,

      // Users
      getUsers,
      getUsersStatus,
      loadUsers,

      // Network
      getNetworkInfo,
      loadNetworkInfo,
    };
  }

  const sharedStore = { createSharedStore };
  root.PaddlePointSharedStore = sharedStore;
  if (typeof module === "object" && module.exports) module.exports = sharedStore;
})(typeof globalThis === "object" ? globalThis : window);
