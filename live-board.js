(function (root) {
  "use strict";

  const SLOT_COUNT = 4;

  // Builds the live board's display data without changing the Tournament or active Game it receives.
  function buildLiveBoard(tournament, activeGame, now) {
    const matches = Array.isArray(tournament && tournament.matches) ? tournament.matches : [];
    const game = activeGame && activeGame.status === "active" && activeGame.tournamentMatch ? activeGame : null;
    const slotCount = Math.max(SLOT_COUNT, Number(tournament && tournament.courts) || 0);
    const scheduledMatches = matches.filter((match) => match.status === "scheduled").slice().sort(compareMatches);
    const ongoingSlots = Array.from({ length: slotCount }, (_, index) => ongoingSlot(matches, game, index + 1, now));
    const busyPlayers = new Set(matches.filter((match) => match.status === "in_progress")
      .flatMap((match) => [...players(match.teamA), ...players(match.teamB)]).map(playerKey));
    if (game) [...players(game.teamA), ...players(game.teamB)].forEach((name) => busyPlayers.add(playerKey(name)));
    const nextMatches = [];
    const courtCount = Number(tournament && tournament.courts) || SLOT_COUNT;
    for (let court = 1; court <= courtCount; court++) {
      if (ongoingSlots[court - 1].statusType === "live") continue;
      const index = scheduledMatches.findIndex((match) =>
        [...players(match.teamA), ...players(match.teamB)].every((name) => !busyPlayers.has(playerKey(name))));
      if (index < 0) continue;
      const next = scheduledMatches.splice(index, 1)[0];
      nextMatches.push({ ...next, court });
      [...players(next.teamA), ...players(next.teamB)].forEach((name) => busyPlayers.add(playerKey(name)));
    }
    const nextSlots = Array.from({ length: slotCount }, (_, index) => {
      const court = index + 1;
      const nextMatch = nextMatches.find((match) => match.court === court);
      return nextMatch ? scheduledCard(nextMatch) : unscheduledCard(court);
    });
    const liveMatches = liveCards(matches, game, now);
    // Every court has a card; a court is open whenever that card is not live.
    const liveCourts = ongoingSlots.filter((slot) => slot.statusType === "live").length;

    return { ongoingSlots, nextSlots, nextMatches, liveMatches, liveCourts, openCourts: courtCount - liveCourts };
  }

  function ongoingSlot(matches, activeGame, court, now) {
    if (activeGame && Number(activeGame.tournamentMatch.court) === court) return gameCard(activeGame, now);

    const ongoing = matches.filter((match) => match.status === "in_progress" && Number(match.court) === court).slice().sort(compareMatches)[0];
    if (ongoing) return matchCard(ongoing, now);

    const completed = matches
      .filter((match) => match.status === "completed" && Number(match.court) === court)
      .slice()
      .sort(compareCompletedMatchesDesc)[0];
    return completed ? completedCard(completed) : availableCard(court);
  }

  function liveCards(matches, activeGame, now) {
    const cards = [];
    const seen = new Set();
    const add = (card) => {
      if (!card || !card.id || seen.has(card.id)) return;
      seen.add(card.id);
      cards.push(card);
    };

    if (activeGame) add(gameCard(activeGame, now));
    matches.filter((match) => match.status === "in_progress").slice().sort(compareMatches).forEach((match) => add(matchCard(match, now)));
    return cards;
  }

  function gameCard(game, now) {
    const match = game.tournamentMatch;
    const servingTeam = game.servingTeam;
    const server = servingTeam === "A" ? game.teamA || {} : game.teamB || {};
    const receiver = servingTeam === "A" ? game.teamB || {} : game.teamA || {};
    return {
      id: match.matchId,
      statusType: "live",
      source: "game",
      adminText: adminText(game.createdBy),
      teamAName: game.teamA && game.teamA.name,
      teamBName: game.teamB && game.teamB.name,
      teamAPlayers: game.type === "doubles" ? doublesPlayers(game.teamA) : players(game.teamA),
      teamBPlayers: game.type === "doubles" ? doublesPlayers(game.teamB) : players(game.teamB),
      scoreA: String(game.teamA && game.teamA.score),
      scoreB: String(game.teamB && game.teamB.score),
      scoreCallText: `${server.name} serving - ${server.score} - ${receiver.score}${game.type === "doubles" ? ` - ${game.serverNumber}` : ""}`,
      statusText: "Live now",
      court: Number(match.court),
      round: match.round,
      meta: `Round ${match.round} - Court ${match.court}`,
      startedAt: game.startedAt,
      durationText: formatDuration(game.startedAt, now),
      switchEnds: Boolean(root.PaddlePointRallyEngine && root.PaddlePointRallyEngine.isSwitchEndsRally(game)),
    };
  }

  function matchCard(match, now) {
    return {
      id: match.id,
      statusType: "live",
      source: "tournament",
      adminText: adminText(match.startedBy),
      teamAName: "Team A",
      teamBName: "Team B",
      teamAPlayers: players(match.teamA),
      teamBPlayers: players(match.teamB),
      scoreA: scoreValue(match.scoreA),
      scoreB: scoreValue(match.scoreB),
      scoreCallText: match.startedBy && match.startedBy.displayName ? `Started by ${match.startedBy.displayName}` : "Match started",
      statusText: "Ongoing Match",
      court: Number(match.court),
      round: match.round,
      meta: `Round ${match.round} - Court ${match.court}`,
      startedAt: match.startedAt,
      durationText: formatDuration(match.startedAt, now),
      switchEnds: Boolean(match.switchEnds),
    };
  }

  function completedCard(match) {
    const winner = match.winner === "B" ? "B" : "A";
    const winnerPlayers = players(winner === "B" ? match.teamB : match.teamA);
    return {
      id: `completed_${match.id}`,
      matchId: match.id,
      statusType: "completed",
      source: "completed",
      adminText: "",
      teamAName: "Team A",
      teamBName: "Team B",
      teamAPlayers: players(match.teamA),
      teamBPlayers: players(match.teamB),
      scoreA: scoreValue(match.scoreA),
      scoreB: scoreValue(match.scoreB),
      winner,
      scoreCallText: `${winnerPlayers.join(" / ")} won`,
      statusText: "Final",
      court: Number(match.court),
      round: match.round,
      meta: `Round ${match.round} - Court ${match.court}`,
      completedAt: match.completedAt,
      startedAt: match.startedAt,
      durationText: formatDuration(match.startedAt, match.completedAt),
    };
  }

  function scheduledCard(match) {
    return {
      id: `scheduled_${match.id}`,
      matchId: match.id,
      statusType: "scheduled",
      source: "scheduled",
      teamAName: "Team A",
      teamBName: "Team B",
      teamAPlayers: players(match.teamA),
      teamBPlayers: players(match.teamB),
      scoreA: "0",
      scoreB: "0",
      scoreCallText: "Waiting to start",
      statusText: "Next Match",
      court: Number(match.court),
      round: match.round,
      meta: `Round ${match.round} - Court ${match.court}`,
      startedAt: null,
      durationText: "",
    };
  }

  function availableCard(court) {
    return {
      id: `available_court_${court}`,
      statusType: "available",
      statusText: "Available",
      court,
      meta: `Court ${court}`,
      detailText: "Ready for a Match",
    };
  }

  function unscheduledCard(court) {
    return {
      id: `unscheduled_court_${court}`,
      statusType: "unscheduled",
      statusText: "No Match scheduled",
      court,
      meta: `Court ${court}`,
      detailText: "No upcoming Match",
    };
  }

  function players(team) {
    return Array.isArray(team && team.players) ? team.players.slice(0, 2) : Array.isArray(team) ? team.slice(0, 2) : [];
  }

  function playerKey(name) {
    return String(name || "").trim().toLowerCase();
  }

  function doublesPlayers(team) {
    const names = players(team);
    const name = team && team.name;
    return [String(names[0] || "").trim() || `${name} Player 1`, String(names[1] || "").trim() || `${name} Player 2`];
  }

  function adminText(user) {
    if (!user || !user.displayName) return "Admin not assigned";
    const role = user.role === "super_admin" ? "Super Admin" : user.role === "admin" ? "Admin" : "Scorer";
    return `${role}: ${user.displayName}`;
  }

  function scoreValue(value) {
    const score = String(value || "").replace(/\D/g, "");
    return score === "" ? "0" : score;
  }

  function compareMatches(a, b) {
    if ((a.round || 0) !== (b.round || 0)) return (a.round || 0) - (b.round || 0);
    if ((a.court || 0) !== (b.court || 0)) return (a.court || 0) - (b.court || 0);
    return String(a.id || "").localeCompare(String(b.id || ""));
  }

  function compareCompletedMatchesDesc(a, b) {
    const aTime = Date.parse(a.completedAt || a.startedAt || "") || 0;
    const bTime = Date.parse(b.completedAt || b.startedAt || "") || 0;
    if (aTime !== bTime) return bTime - aTime;
    if ((a.round || 0) !== (b.round || 0)) return (b.round || 0) - (a.round || 0);
    return String(b.id || "").localeCompare(String(a.id || ""));
  }

  function formatDuration(start, end) {
    if (!start || !end) return "In progress";
    const totalSeconds = Math.round(Math.max(0, new Date(end).getTime() - new Date(start).getTime()) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes < 1 ? `${seconds}s` : `${minutes}m ${seconds}s`;
  }

  const liveBoard = { buildLiveBoard };
  root.PaddlePointLiveBoard = liveBoard;
  if (typeof module === "object" && module.exports) module.exports = liveBoard;
})(typeof globalThis === "object" ? globalThis : window);
