import { asc, eq } from "drizzle-orm";
import { db } from "./auth";
import { currentEvent, event, eventRevision, match, player, tournament, tournamentMatch, tournamentMatchPlayer, tournamentRound } from "./schema";

type BoardMatch = { id: string; round: number; court: number; teamA: string[]; teamB: string[]; scoreA: number; scoreB: number; winner: string | null; status: string; startedAt: string | null; endedAt: string | null };

export async function readLiveBoard() {
  const [config] = await db.select({ eventId: event.id, eventName: event.name, courts: tournament.courts, revision: eventRevision.revision })
    .from(currentEvent).innerJoin(event, eq(event.id, currentEvent.eventId))
    .innerJoin(tournament, eq(tournament.eventId, event.id))
    .leftJoin(eventRevision, eq(eventRevision.eventId, event.id)).where(eq(currentEvent.singleton, 1));
  if (!config) return { eventId: null, eventName: null, revision: 0, courts: [] };
  const [slots, assignments] = await Promise.all([
    db.select({ id: tournamentMatch.id, round: tournamentRound.number, court: tournamentMatch.court, status: tournamentMatch.status, scoreA: match.scoreA, scoreB: match.scoreB, winner: match.winner, startedAt: match.playedAt, endedAt: match.endedAt })
      .from(tournamentMatch).innerJoin(tournamentRound, eq(tournamentRound.id, tournamentMatch.roundId))
      .leftJoin(match, eq(match.tournamentMatchId, tournamentMatch.id))
      .where(eq(tournamentMatch.tournamentId, config.eventId))
      .orderBy(asc(tournamentRound.number), asc(tournamentMatch.court)),
    db.select({ matchId: tournamentMatchPlayer.matchId, team: tournamentMatchPlayer.team, name: player.name })
      .from(tournamentMatchPlayer).innerJoin(player, eq(player.id, tournamentMatchPlayer.playerId))
      .innerJoin(tournamentMatch, eq(tournamentMatch.id, tournamentMatchPlayer.matchId))
      .where(eq(tournamentMatch.tournamentId, config.eventId))
      .orderBy(asc(tournamentMatchPlayer.position)),
  ]);
  const names = new Map<string, { A: string[]; B: string[] }>();
  for (const row of assignments) {
    const teams = names.get(row.matchId) ?? { A: [], B: [] };
    if (row.team === "A" || row.team === "B") teams[row.team].push(row.name);
    names.set(row.matchId, teams);
  }
  const matches: BoardMatch[] = slots.map((slot) => ({
    id: slot.id, round: slot.round, court: slot.court, status: slot.status,
    teamA: names.get(slot.id)?.A ?? [], teamB: names.get(slot.id)?.B ?? [],
    scoreA: slot.scoreA ?? 0, scoreB: slot.scoreB ?? 0, winner: slot.winner,
    startedAt: slot.status === "scheduled" ? null : slot.startedAt?.toISOString() ?? null,
    endedAt: slot.endedAt?.toISOString() ?? null,
  }));
  return { eventId: config.eventId, eventName: config.eventName, revision: config.revision ?? 0, courts: Array.from({ length: config.courts }, (_, index) => {
    const court = index + 1;
    const onCourt = matches.filter((item) => item.court === court);
    return {
      number: court,
      current: onCourt.find((item) => item.status === "in_progress") ?? null,
      next: onCourt.find((item) => item.status === "scheduled") ?? null,
      completed: onCourt.filter((item) => item.status === "completed").sort((a, b) => (b.endedAt ?? "").localeCompare(a.endedAt ?? ""))[0] ?? null,
    };
  }) };
}

export type LiveBoardData = Awaited<ReturnType<typeof readLiveBoard>>;
