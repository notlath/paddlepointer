(function (root) {
  "use strict";

  function cleanName(value, fallback = "") {
    const name = String(value || "").trim();
    return name || fallback;
  }

  function capitalize(value) {
    const str = String(value || "");
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // The toss winner picks who starts in the right court; 0 is the Team's first-listed Player.
  function startingRightIndex(value) {
    return Number(value) === 1 ? 1 : 0;
  }

  function initialDoublesPositions(rightIndex = 0) {
    const right = startingRightIndex(rightIndex);
    return { right, left: right === 1 ? 0 : 1 };
  }

  function otherTeam(key) {
    return key === "A" ? "B" : "A";
  }

  function teamByKey(game, key) {
    return key === "A" ? game.teamA : game.teamB;
  }

  function teamName(game, key) {
    return teamByKey(game, key).name;
  }

  function finalScore(game) {
    return `${game.teamA.score} - ${game.teamB.score}`;
  }

  function ensureDoublesTracking(game) {
    if (!game || game.type !== "doubles") return;

    ["A", "B"].forEach((key) => {
      const team = teamByKey(game, key);
      const existing = Array.isArray(team.players) ? team.players : [];
      team.players = [
        cleanName(existing[0], `${team.name} Player 1`),
        cleanName(existing[1], `${team.name} Player 2`),
      ];

      team.startingRight = startingRightIndex(team.startingRight);
      const positions = team.positions || initialDoublesPositions(team.startingRight);
      const valid =
        Number.isInteger(positions.right) &&
        Number.isInteger(positions.left) &&
        positions.right !== positions.left &&
        [0, 1].includes(positions.right) &&
        [0, 1].includes(positions.left);
      team.positions = valid ? positions : initialDoublesPositions(team.startingRight);
    });

    if (![0, 1].includes(game.currentServerIndex)) {
      game.currentServerIndex = teamByKey(game, game.servingTeam).positions.right;
    }
  }

  function swapDoublesPositions(team) {
    const currentRight = team.positions.right;
    team.positions.right = team.positions.left;
    team.positions.left = currentRight;
  }

  function doublesPartnerIndex(game, teamKey, playerIndex) {
    ensureDoublesTracking(game);
    return playerIndex === 0 ? 1 : 0;
  }

  function sideForPlayerIndex(game, teamKey, playerIndex) {
    ensureDoublesTracking(game);
    const positions = teamByKey(game, teamKey).positions;
    return positions.left === playerIndex ? "left" : "right";
  }

  function playerNameByIndex(game, teamKey, playerIndex) {
    ensureDoublesTracking(game);
    return teamByKey(game, teamKey).players[playerIndex] || `${teamName(game, teamKey)} Player ${playerIndex + 1}`;
  }

  function playerNameAtSide(game, teamKey, side) {
    ensureDoublesTracking(game);
    const team = teamByKey(game, teamKey);
    return playerNameByIndex(game, teamKey, team.positions[side]);
  }

  function currentServerName(game) {
    if (game.type !== "doubles") return teamName(game, game.servingTeam);
    ensureDoublesTracking(game);
    return playerNameByIndex(game, game.servingTeam, game.currentServerIndex);
  }

  function scoreCall(game) {
    const serverScore = teamByKey(game, game.servingTeam).score;
    const receiverScore = teamByKey(game, otherTeam(game.servingTeam)).score;
    if (game.type === "doubles") {
      return `${serverScore} - ${receiverScore} - ${game.serverNumber}`;
    }
    return `${serverScore} - ${receiverScore}`;
  }

  function servePosition(game) {
    if (game.type === "doubles") {
      ensureDoublesTracking(game);
      const side = sideForPlayerIndex(game, game.servingTeam, game.currentServerIndex);
      return {
        side,
        label: side === "right" ? "Right" : "Left",
        parity: side === "right" ? "even" : "odd",
      };
    }

    const servingScore = teamByKey(game, game.servingTeam).score;
    const isRight = servingScore % 2 === 0;
    return {
      side: isRight ? "right" : "left",
      label: isRight ? "Right" : "Left",
      parity: isRight ? "even" : "odd",
    };
  }

  function actionText(event, game) {
    if (event.action === "point") {
      const serveSide = event.serveSideAfter ? `${capitalize(event.serveSideAfter)} court` : "next court";
      const serverName = event.serverNameAfter ? `${event.serverNameAfter} ` : "";
      return `Point scored from ${event.previousScore} to ${event.newScore}; ${serverName}switches to ${serveSide}`;
    }
    if (event.action === "server-switch") {
      const serverName = event.serverNameAfter ? ` to ${event.serverNameAfter}` : "";
      const serveSide = event.serveSideAfter ? ` on the ${event.serveSideAfter} court` : "";
      return `First fault; serve moved from server ${event.serverNumberBefore} to server ${event.serverNumberAfter}${serverName}${serveSide}`;
    }
    if (event.action === "correction") {
      const serverName = event.serverNameAfter || "the server";
      const serveSide = event.serveSideAfter ? ` from the ${event.serveSideAfter} court` : "";
      const serverNumber = event.serverNumberAfter ? `, server ${event.serverNumberAfter}` : "";
      return `Serve corrected; ${serverName} serving${serveSide}${serverNumber}`;
    }
    if (event.action === "timeout") {
      const team = game ? teamName(game, event.team) : `Team ${event.team}`;
      return `${team} called a timeout`;
    }
    if (event.action === "side-out") {
      const nextTeam = game ? teamName(game, event.servingTeamAfter) : event.servingTeamAfter;
      const serverName = event.serverNameAfter ? `; ${event.serverNameAfter} starts` : "";
      const serveSide = event.serveSideAfter ? ` from the ${event.serveSideAfter} court` : "";
      return `Side-out to ${nextTeam}${serverName}${serveSide}`;
    }
    return "Rally recorded";
  }

  function detectWinner(game) {
    const a = game.teamA.score;
    const b = game.teamB.score;
    const high = Math.max(a, b);
    const lead = Math.abs(a - b);
    if (high < game.targetScore) return null;
    if (game.winByTwo && lead < 2) return null;
    return a > b ? "A" : "B";
  }

  // Players switch ends when the leading Team first reaches half the target, rounded up (6 in a game to 11).
  function switchEndsScore(targetScore) {
    return Math.ceil((Number(targetScore) || 11) / 2);
  }

  // A Rally has a winner; serve corrections and timeouts sit in the Rally log without one.
  function isRally(event) {
    return Boolean(event) && (event.rallyWinner === "A" || event.rallyWinner === "B");
  }

  // True only on the Rally that first took either Team to the switch-ends score.
  function isSwitchEndsRally(game) {
    const events = (game && Array.isArray(game.events) ? game.events : []).filter(isRally);
    const midpoint = switchEndsScore(game && game.targetScore);
    const first = events.findIndex((event) => event && event.scoreAfter && Math.max(event.scoreAfter.A, event.scoreAfter.B) >= midpoint);
    return first !== -1 && first === events.length - 1;
  }

  // Each Team gets 2 timeouts in a game to 11 or 15, and 3 in a game to 21.
  function timeoutsAllowed(game) {
    return Number(game && game.targetScore) >= 21 ? 3 : 2;
  }

  function timeoutsLeft(game, key) {
    const used = game && game.timeoutsUsed ? Number(game.timeoutsUsed[key]) || 0 : 0;
    return Math.max(0, timeoutsAllowed(game) - used);
  }

  function cloneGame(game) {
    return JSON.parse(JSON.stringify(game));
  }

  function createGame(options = {}) {
    const type = options.type === "singles" ? "singles" : "doubles";
    const isDoubles = type === "doubles";
    const firstServer = options.firstServer === "B" ? "B" : "A";
    const now = options.now ? (typeof options.now === "string" ? options.now : options.now.toISOString()) : new Date().toISOString();
    const id = options.id || `game_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

    const teamAInput = options.teamA || {};
    const teamBInput = options.teamB || {};
    const teamAName = cleanName(teamAInput.name, "Team A");
    const teamBName = cleanName(teamBInput.name, "Team B");

    let playersA = [];
    let playersB = [];
    if (isDoubles) {
      const rawA = Array.isArray(teamAInput.players) ? teamAInput.players : [];
      const rawB = Array.isArray(teamBInput.players) ? teamBInput.players : [];
      playersA = [
        cleanName(rawA[0], teamAName === "Team A" ? "A - Player 1" : `${teamAName} Player 1`),
        cleanName(rawA[1], teamAName === "Team A" ? "A - Player 2" : `${teamAName} Player 2`),
      ];
      playersB = [
        cleanName(rawB[0], teamBName === "Team B" ? "B - Player 1" : `${teamBName} Player 1`),
        cleanName(rawB[1], teamBName === "Team B" ? "B - Player 2" : `${teamBName} Player 2`),
      ];
    } else {
      const rawA = Array.isArray(teamAInput.players) ? teamAInput.players : (teamAInput.player ? [teamAInput.player] : []);
      const rawB = Array.isArray(teamBInput.players) ? teamBInput.players : (teamBInput.player ? [teamBInput.player] : []);
      playersA = rawA.map((p) => String(p || "").trim()).filter(Boolean).slice(0, 1);
      playersB = rawB.map((p) => String(p || "").trim()).filter(Boolean).slice(0, 1);
    }

    const game = {
      id,
      type,
      scorerName: cleanName(options.scorerName, "Court 1"),
      teamA: {
        name: teamAName,
        players: playersA,
        positions: isDoubles ? initialDoublesPositions(teamAInput.startingRight) : null,
        startingRight: isDoubles ? startingRightIndex(teamAInput.startingRight) : null,
        score: 0,
      },
      teamB: {
        name: teamBName,
        players: playersB,
        positions: isDoubles ? initialDoublesPositions(teamBInput.startingRight) : null,
        startingRight: isDoubles ? startingRightIndex(teamBInput.startingRight) : null,
        score: 0,
      },
      servingTeam: firstServer,
      firstServer,
      serverNumber: isDoubles ? 2 : null,
      currentServerIndex: isDoubles ? startingRightIndex((firstServer === "B" ? teamBInput : teamAInput).startingRight) : null,
      targetScore: Number.isInteger(Number(options.targetScore)) && Number(options.targetScore) > 0 ? Number(options.targetScore) : 11,
      winByTwo: options.winByTwo !== undefined ? Boolean(options.winByTwo) : true,
      status: "active",
      winner: null,
      createdBy: options.createdBy || null,
      matchScope: options.matchScope || "standard",
      sideOuts: 0,
      timeoutsUsed: { A: 0, B: 0 },
      events: [],
      createdAt: now,
      startedAt: now,
      endedAt: null,
      endedEarly: false,
      endReason: null,
      retiredTeam: null,
    };

    if (options.tournamentMatch) {
      game.tournamentMatch = {
        tournamentId: options.tournamentMatch.tournamentId || "open_play",
        tournamentName: options.tournamentMatch.tournamentName || "Open Play",
        matchId: options.tournamentMatch.matchId,
        round: options.tournamentMatch.round,
        court: options.tournamentMatch.court,
      };
    }

    return game;
  }

  function recordRally(game, rallyWinner, options = {}) {
    if (!game || game.status !== "active") return null;
    ensureDoublesTracking(game);

    if (options.undoStack && Array.isArray(options.undoStack)) {
      options.undoStack.push(cloneGame(game));
    }

    const now = options.now ? (typeof options.now === "string" ? options.now : options.now.toISOString()) : new Date().toISOString();
    const previousScore = scoreCall(game);
    const servingBefore = game.servingTeam;
    const serverBefore = game.serverNumber;
    const serverIndexBefore = game.currentServerIndex;
    const serveSideBefore = servePosition(game).side;
    const scoreBefore = { A: game.teamA.score, B: game.teamB.score };
    let action = "side-out";

    if (rallyWinner === game.servingTeam) {
      teamByKey(game, rallyWinner).score += 1;
      if (game.type === "doubles") {
        swapDoublesPositions(teamByKey(game, rallyWinner));
      }
      action = "point";
    } else if (game.type === "doubles") {
      if (game.serverNumber === 1) {
        game.serverNumber = 2;
        game.currentServerIndex = doublesPartnerIndex(game, game.servingTeam, game.currentServerIndex);
        action = "server-switch";
      } else {
        game.servingTeam = otherTeam(game.servingTeam);
        game.serverNumber = 1;
        game.currentServerIndex = teamByKey(game, game.servingTeam).positions.right;
        game.sideOuts += 1;
        action = "side-out";
      }
    } else {
      game.servingTeam = otherTeam(game.servingTeam);
      game.sideOuts += 1;
      action = "side-out";
    }

    const event = {
      id: options.eventId || `event_${Date.now()}_${game.events.length + 1}`,
      rallyWinner,
      previousScore,
      newScore: scoreCall(game),
      action,
      servingTeamBefore: servingBefore,
      servingTeamAfter: game.servingTeam,
      serverNumberBefore: serverBefore,
      serverNumberAfter: game.serverNumber,
      currentServerIndexBefore: serverIndexBefore,
      currentServerIndexAfter: game.currentServerIndex,
      serverNameBefore: game.type === "doubles" ? playerNameByIndex(game, servingBefore, serverIndexBefore) : teamName(game, servingBefore),
      serverNameAfter: currentServerName(game),
      serveSideBefore,
      serveSideAfter: servePosition(game).side,
      scoreBefore,
      scoreAfter: { A: game.teamA.score, B: game.teamB.score },
      createdAt: now,
    };
    game.events.push(event);

    const winner = detectWinner(game);
    if (winner) {
      game.status = "completed";
      game.winner = winner;
      game.endedEarly = false;
      game.endedAt = now;
    }

    return {
      game,
      event,
      winner,
      isCompleted: Boolean(winner),
    };
  }

  // The court and the Scoreboard disagree: put the serve back where the Players actually are.
  // Every part is optional; whatever is left out keeps its current value.
  function correctServe(game, correction = {}, options = {}) {
    if (!game || game.status !== "active") return null;
    ensureDoublesTracking(game);

    if (options.undoStack && Array.isArray(options.undoStack)) {
      options.undoStack.push(cloneGame(game));
    }

    const isDoubles = game.type === "doubles";
    const now = options.now ? (typeof options.now === "string" ? options.now : options.now.toISOString()) : new Date().toISOString();
    const previousScore = scoreCall(game);
    const servingBefore = game.servingTeam;
    const serverBefore = game.serverNumber;
    const serverIndexBefore = game.currentServerIndex;
    const serveSideBefore = servePosition(game).side;

    const applied = {
      servingTeam: correction.servingTeam === "A" || correction.servingTeam === "B" ? correction.servingTeam : game.servingTeam,
      serverNumber: isDoubles ? (Number(correction.serverNumber) === 1 ? 1 : Number(correction.serverNumber) === 2 ? 2 : game.serverNumber) : null,
      serverIndex: isDoubles ? ([0, 1].includes(Number(correction.serverIndex)) ? Number(correction.serverIndex) : game.currentServerIndex) : null,
      rightA: isDoubles ? ([0, 1].includes(Number(correction.rightA)) ? Number(correction.rightA) : game.teamA.positions.right) : null,
      rightB: isDoubles ? ([0, 1].includes(Number(correction.rightB)) ? Number(correction.rightB) : game.teamB.positions.right) : null,
    };

    game.servingTeam = applied.servingTeam;
    if (isDoubles) {
      game.teamA.positions = initialDoublesPositions(applied.rightA);
      game.teamB.positions = initialDoublesPositions(applied.rightB);
      game.serverNumber = applied.serverNumber;
      game.currentServerIndex = applied.serverIndex;
    }

    const event = {
      id: options.eventId || `event_${Date.now()}_${game.events.length + 1}`,
      rallyWinner: null,
      correction: applied,
      previousScore,
      newScore: scoreCall(game),
      action: "correction",
      servingTeamBefore: servingBefore,
      servingTeamAfter: game.servingTeam,
      serverNumberBefore: serverBefore,
      serverNumberAfter: game.serverNumber,
      currentServerIndexBefore: serverIndexBefore,
      currentServerIndexAfter: game.currentServerIndex,
      serverNameBefore: isDoubles ? playerNameByIndex(game, servingBefore, serverIndexBefore) : teamName(game, servingBefore),
      serverNameAfter: currentServerName(game),
      serveSideBefore,
      serveSideAfter: servePosition(game).side,
      scoreBefore: { A: game.teamA.score, B: game.teamB.score },
      scoreAfter: { A: game.teamA.score, B: game.teamB.score },
      createdAt: now,
    };
    game.events.push(event);

    return { game, event };
  }

  // A Team stops play; nothing changes but its timeouts, and the Rally log records it.
  function recordTimeout(game, key, options = {}) {
    if (!game || game.status !== "active" || (key !== "A" && key !== "B")) return null;
    if (timeoutsLeft(game, key) === 0) return null;

    const now = options.now ? (typeof options.now === "string" ? options.now : options.now.toISOString()) : new Date().toISOString();
    game.timeoutsUsed = { A: 0, B: 0, ...game.timeoutsUsed, [key]: (Number(game.timeoutsUsed && game.timeoutsUsed[key]) || 0) + 1 };

    const event = {
      id: options.eventId || `event_${Date.now()}_${game.events.length + 1}`,
      action: "timeout",
      team: key,
      rallyWinner: null,
      previousScore: scoreCall(game),
      newScore: scoreCall(game),
      servingTeamBefore: game.servingTeam,
      servingTeamAfter: game.servingTeam,
      scoreBefore: { A: game.teamA.score, B: game.teamB.score },
      scoreAfter: { A: game.teamA.score, B: game.teamB.score },
      timeoutsLeftAfter: timeoutsLeft(game, key),
      createdAt: now,
    };
    game.events.push(event);

    return { game, event };
  }

  function canUndo(game) {
    return Boolean(game && Array.isArray(game.events) && game.events.length > 0);
  }

  // Back to the first serve of the Match: the toss winner's serving Team and right-court Players.
  function restoreStartingPositions(game) {
    game.servingTeam = game.firstServer || "A";
    game.serverNumber = game.type === "doubles" ? 2 : null;
    if (game.type !== "doubles") {
      game.currentServerIndex = null;
      return;
    }
    game.teamA.positions = initialDoublesPositions(game.teamA.startingRight);
    game.teamB.positions = initialDoublesPositions(game.teamB.startingRight);
    game.currentServerIndex = teamByKey(game, game.servingTeam).positions.right;
    ensureDoublesTracking(game);
  }

  function undoRally(gameOrStack) {
    if (Array.isArray(gameOrStack)) {
      if (gameOrStack.length === 0) return null;
      return gameOrStack.pop();
    }

    const game = gameOrStack;
    if (!game || !Array.isArray(game.events) || game.events.length === 0) {
      return null;
    }

    const eventsToReplay = game.events.slice(0, -1);

    // Reset in place to initial 0-0 state
    game.teamA.score = 0;
    game.teamB.score = 0;
    restoreStartingPositions(game);
    game.status = "active";
    game.winner = null;
    game.sideOuts = 0;
    game.timeoutsUsed = { A: 0, B: 0 };
    game.events = [];
    game.endedAt = null;
    game.endedEarly = false;
    game.endReason = null;
    game.retiredTeam = null;

    for (const event of eventsToReplay) {
      if (event.action === "correction") {
        correctServe(game, event.correction || {}, { eventId: event.id, now: event.createdAt });
        continue;
      }
      if (event.action === "timeout") {
        recordTimeout(game, event.team, { eventId: event.id, now: event.createdAt });
        continue;
      }
      recordRally(game, event.rallyWinner, {
        eventId: event.id,
        now: event.createdAt,
      });
    }

    return game;
  }

  function resetGame(game, options = {}) {
    if (!game) return null;
    const now = options.now ? (typeof options.now === "string" ? options.now : options.now.toISOString()) : new Date().toISOString();
    game.teamA.score = 0;
    game.teamB.score = 0;
    restoreStartingPositions(game);
    game.status = "active";
    game.winner = null;
    game.sideOuts = 0;
    game.timeoutsUsed = { A: 0, B: 0 };
    game.events = [];
    game.startedAt = now;
    game.endedAt = null;
    game.endedEarly = false;
    game.endReason = null;
    game.retiredTeam = null;
    return game;
  }

  function endGameEarly(game, options = {}) {
    if (!game || game.status !== "active") return null;
    const now = options.now ? (typeof options.now === "string" ? options.now : options.now.toISOString()) : new Date().toISOString();
    const retiredTeam = options.retiredTeam === "A" || options.retiredTeam === "B" ? options.retiredTeam : null;
    let winner = retiredTeam ? otherTeam(retiredTeam) : null;
    if (!winner && game.teamA.score > game.teamB.score) winner = "A";
    if (!winner && game.teamB.score > game.teamA.score) winner = "B";

    game.status = "completed";
    game.winner = winner;
    game.endedEarly = true;
    game.endReason = retiredTeam ? "retirement_or_forfeit" : null;
    game.retiredTeam = retiredTeam;
    game.endedAt = now;
    return game;
  }

  const RallyEngine = {
    cleanName,
    initialDoublesPositions,
    otherTeam,
    teamByKey,
    teamName,
    finalScore,
    ensureDoublesTracking,
    swapDoublesPositions,
    doublesPartnerIndex,
    sideForPlayerIndex,
    playerNameByIndex,
    playerNameAtSide,
    currentServerName,
    scoreCall,
    servePosition,
    actionText,
    detectWinner,
    isRally,
    switchEndsScore,
    isSwitchEndsRally,
    timeoutsAllowed,
    timeoutsLeft,
    recordTimeout,
    cloneGame,
    createGame,
    recordRally,
    correctServe,
    canUndo,
    undoRally,
    resetGame,
    endGameEarly,
  };

  root.PaddlePointRallyEngine = RallyEngine;
  if (typeof module === "object" && module.exports) module.exports = RallyEngine;
})(typeof globalThis === "object" ? globalThis : window);
