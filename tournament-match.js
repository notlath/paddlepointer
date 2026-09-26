(function (root) {
  "use strict";

  // Builds match update payload sent to the server for tournament match lifecycle actions.
  function buildMatchUpdate(game, status, extra = {}) {
    if (!game || !game.tournamentMatch) return null;
    const updateStatus = status === "completed" ? "completed" : status === "scheduled" ? "scheduled" : "in_progress";
    const update = {
      tournamentId: game.tournamentMatch.tournamentId || "open_play",
      matchId: game.tournamentMatch.matchId,
      court: game.tournamentMatch.court,
      activeGameId: game.id,
      status: updateStatus,
      scoreA: String(game.teamA && game.teamA.score != null ? game.teamA.score : 0),
      scoreB: String(game.teamB && game.teamB.score != null ? game.teamB.score : 0),
      winner: null,
      completedAt: null,
      gameId: null,
      durationSeconds: null,
      durationMinutes: null,
      startedAt: game.startedAt || null,
      startedBy: game.createdBy || null,
      liveEventCount: Array.isArray(game.events) ? game.events.length : 0,
      switchEnds: updateStatus === "in_progress" && Boolean(extra.switchEnds),
    };

    if (updateStatus === "completed") {
      update.winner = game.winner === "A" || game.winner === "B" ? game.winner : null;
      update.completedAt = game.endedAt || new Date().toISOString();
      update.gameId = game.id;
      update.durationSeconds = extra.durationSeconds != null ? extra.durationSeconds : null;
      update.durationMinutes = extra.durationMinutes != null ? extra.durationMinutes : null;
      update.targetScore = game.targetScore;
      update.winByTwo = Boolean(game.winByTwo);
      update.endedEarly = Boolean(game.endedEarly);
      update.endReason = game.endReason || null;
      update.retiredTeam = game.retiredTeam === "A" || game.retiredTeam === "B" ? game.retiredTeam : null;
    }

    return update;
  }

  // Adopts the server's return for a match update.
  // On refusal (ok === false), leaves the tournament completely untouched and returns the error reason.
  // On success (ok === true), returns the updated tournament and match.
  function applyServerMatch(tournament, response) {
    if (!response || !response.ok) {
      return {
        ok: false,
        tournament,
        error: response && response.error ? response.error : "Request failed",
      };
    }

    if (response.tournament) {
      const updatedTournament = response.tournament;
      const matchId = response.matchId;
      const updatedMatch = matchId && Array.isArray(updatedTournament.matches)
        ? updatedTournament.matches.find((m) => m.id === matchId)
        : null;
      return {
        ok: true,
        tournament: updatedTournament,
        match: updatedMatch,
      };
    }

    if (response.match && tournament && Array.isArray(tournament.matches)) {
      const updatedMatch = response.match;
      const updatedMatches = tournament.matches.map((m) => (m.id === updatedMatch.id ? updatedMatch : m));
      return {
        ok: true,
        tournament: { ...tournament, matches: updatedMatches },
        match: updatedMatch,
      };
    }

    return {
      ok: true,
      tournament,
      match: null,
    };
  }

  const tournamentMatch = { buildMatchUpdate, applyServerMatch };
  root.PaddlePointTournamentMatch = tournamentMatch;
  if (typeof module === "object" && module.exports) module.exports = tournamentMatch;
})(typeof globalThis === "object" ? globalThis : window);
