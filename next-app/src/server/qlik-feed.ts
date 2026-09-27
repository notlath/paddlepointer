import { asc, eq, inArray } from "drizzle-orm";
import { db } from "./auth";
import { currentEvent, event, match, matchPlayer, player, tournament, tournamentMatch, tournamentMatchPlayer, tournamentRound } from "./schema";

export type FeedName = "get-events" | "get-matches" | "get-leaderboard-results" | "get-leaderboard-players";

type FeedResult = { status: number; body: { ok: boolean; rows?: Record<string, unknown>[]; error?: string } };
const iso = (value: Date | null) => value?.toISOString() ?? null;

function rallyStats(log: Record<string, unknown>[]) {
  const run = { A: 0, B: 0 };
  const longest = { A: 0, B: 0 };
  let sideOuts = 0;
  let rallyCount = 0;
  for (const entry of log) {
    const action = entry.action;
    if (action !== "correction" && action !== "timeout") rallyCount++;
    if (action === "point" && (entry.rallyWinner === "A" || entry.rallyWinner === "B")) {
      run[entry.rallyWinner]++;
      longest[entry.rallyWinner] = Math.max(longest[entry.rallyWinner], run[entry.rallyWinner]);
    } else if (action === "side-out") {
      sideOuts++;
      run.A = 0;
      run.B = 0;
    }
  }
  return { sideOuts, rallyCount, teamALongestRun: longest.A, teamBLongestRun: longest.B };
}

export async function readQlikFeed(name: FeedName, eventId: string): Promise<FeedResult> {
  const events = await db.select({ id: event.id, name: event.name, courts: tournament.courts })
    .from(event).innerJoin(tournament, eq(tournament.eventId, event.id)).orderBy(asc(event.id));
  if (eventId && !events.some((item) => item.id === eventId)) return { status: 404, body: { ok: false, error: "Event was not found" } };
  const selectedEvents = eventId ? events.filter((item) => item.id === eventId) : events;
  const slots = await db.select({ id: tournamentMatch.id, eventId: tournament.eventId, round: tournamentRound.number, court: tournamentMatch.court, status: tournamentMatch.status })
    .from(tournamentMatch).innerJoin(tournament, eq(tournament.id, tournamentMatch.tournamentId))
    .innerJoin(tournamentRound, eq(tournamentRound.id, tournamentMatch.roundId))
    .orderBy(asc(tournament.eventId), asc(tournamentRound.number), asc(tournamentMatch.court), asc(tournamentMatch.id));
  const selectedSlots = eventId ? slots.filter((slot) => slot.eventId === eventId) : slots;
  const games = await db.select({ id: match.id, eventId: match.eventId, slotId: match.tournamentMatchId, status: match.status, playedAt: match.playedAt, endedAt: match.endedAt, scoreA: match.scoreA, scoreB: match.scoreB, winner: match.winner, targetScore: match.targetScore, rallyLog: match.rallyLog })
    .from(match).orderBy(asc(match.id));
  const gameBySlot = new Map(games.filter((game) => game.slotId).map((game) => [game.slotId, game]));
  const ok = (rows: Record<string, unknown>[]): FeedResult => ({ status: 200, body: { ok: true, rows } });

  if (name === "get-events") {
    const [current] = await db.select({ id: currentEvent.eventId }).from(currentEvent).where(eq(currentEvent.singleton, 1));
    return ok(selectedEvents.map((item) => {
      const relevant = selectedSlots.filter((slot) => slot.eventId === item.id);
      const played = relevant.map((slot) => gameBySlot.get(slot.id)).filter((game) => game !== undefined);
      const starts = played.map((game) => game.playedAt.getTime());
      const ends = played.map((game) => game.endedAt?.getTime()).filter((time): time is number => time !== undefined);
      return { id: item.id, name: item.name, courts: item.courts, matchCount: relevant.length,
        completedCount: relevant.filter((slot) => slot.status === "completed").length,
        eventWindow: starts.length || ends.length ? { start: starts.length ? new Date(Math.min(...starts)).toISOString() : null, end: ends.length ? new Date(Math.max(...ends)).toISOString() : null } : null,
        isCurrent: item.id === current?.id };
    }));
  }

  const slotPlayers = selectedSlots.length ? await db.select({ slotId: tournamentMatchPlayer.matchId, name: player.name, team: tournamentMatchPlayer.team, position: tournamentMatchPlayer.position })
    .from(tournamentMatchPlayer).innerJoin(player, eq(player.id, tournamentMatchPlayer.playerId))
    .where(inArray(tournamentMatchPlayer.matchId, selectedSlots.map((slot) => slot.id))) : [];
  const namesForSlot = (id: string, team: string) => slotPlayers.filter((person) => person.slotId === id && person.team === team).sort((a, b) => a.position - b.position).map((person) => person.name);
  if (name === "get-matches") return ok(selectedSlots.map((slot) => {
    const game = gameBySlot.get(slot.id);
    return { eventId: slot.eventId, matchId: slot.id, round: slot.round, court: slot.court, status: slot.status,
      teamA: namesForSlot(slot.id, "A"), teamB: namesForSlot(slot.id, "B"), scoreA: game?.scoreA ?? null, scoreB: game?.scoreB ?? null,
      winner: game?.winner ?? null, startedAt: iso(game?.playedAt ?? null), completedAt: iso(game?.endedAt ?? null), gameId: game?.id ?? null };
  }));

  const selectedGames = games.filter((game) => !eventId || game.eventId === eventId);
  if (name === "get-leaderboard-results") return ok(selectedGames.filter((game) => game.status === "completed" && (game.winner === "A" || game.winner === "B")).map((game) => {
    const slot = slots.find((item) => item.id === game.slotId);
    const duration = game.endedAt ? Math.round((game.endedAt.getTime() - game.playedAt.getTime()) / 1000) : 0;
    return { matchId: game.id, eventId: game.eventId, winner: game.winner, teamAScore: game.scoreA, teamBScore: game.scoreB,
      targetScore: game.targetScore, durationSeconds: duration > 0 ? duration : null, completedAt: iso(game.endedAt), round: slot?.round ?? null, court: slot?.court ?? null,
      ...rallyStats(game.rallyLog) };
  }));

  const gamePlayers = selectedGames.length ? await db.select({ matchId: matchPlayer.matchId, team: matchPlayer.team, name: player.name, position: matchPlayer.position })
    .from(matchPlayer).innerJoin(player, eq(player.id, matchPlayer.playerId))
    .where(inArray(matchPlayer.matchId, selectedGames.map((game) => game.id))) : [];
  const rows: Record<string, unknown>[] = selectedGames.flatMap((game) => gamePlayers.filter((person) => person.matchId === game.id)
    .sort((a, b) => a.team.localeCompare(b.team) || a.position - b.position)
    .map((person) => ({ matchId: game.id, eventId: game.eventId, team: person.team, playerName: person.name.trim() })));
  for (const slot of selectedSlots.filter((item) => (item.status === "scheduled" || item.status === "in_progress") && !gameBySlot.has(item.id))) {
    for (const team of ["A", "B"]) for (const name of namesForSlot(slot.id, team)) rows.push({ matchId: slot.id, eventId: slot.eventId, team, playerName: name.trim() });
  }
  return ok(rows);
}
