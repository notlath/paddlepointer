import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "./auth";
import { currentEvent, event, match, matchPlayer, tournament, tournamentMatch, tournamentMatchPlayer, tournamentPlayer, tournamentRound } from "./schema";

type Failure = { error: string; status: number };
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function readEventOperations(eventId: string) {
  const [record] = await db.select({ id: event.id, name: event.name, createdAt: event.createdAt, tournamentId: tournament.id })
    .from(event).innerJoin(tournament, eq(tournament.eventId, event.id)).where(eq(event.id, eventId));
  if (!record) return null;
  const [current, slots] = await Promise.all([
    db.select({ eventId: currentEvent.eventId }).from(currentEvent).where(eq(currentEvent.singleton, 1)),
    db.select({ id: tournamentMatch.id, status: tournamentMatch.status, court: tournamentMatch.court, round: tournamentRound.number, scoreA: match.scoreA, scoreB: match.scoreB, winner: match.winner, retiredTeam: match.retiredTeam })
      .from(tournamentMatch).innerJoin(tournamentRound, eq(tournamentRound.id, tournamentMatch.roundId))
      .leftJoin(match, eq(match.tournamentMatchId, tournamentMatch.id))
      .where(eq(tournamentMatch.tournamentId, record.tournamentId))
      .orderBy(asc(tournamentRound.number), asc(tournamentMatch.court)),
  ]);
  return { id: record.id, name: record.name, createdAt: record.createdAt.toISOString(), isCurrent: current[0]?.eventId === eventId, slots };
}

async function lockedCurrentTournament(tx: Transaction, eventId: string): Promise<{ id: string } | Failure> {
  const [current] = await tx.select({ eventId: currentEvent.eventId }).from(currentEvent).where(eq(currentEvent.singleton, 1)).for("update");
  if (current?.eventId !== eventId) return { error: "Past Events are protected", status: 409 };
  const [config] = await tx.select({ id: tournament.id }).from(tournament).where(eq(tournament.eventId, eventId)).for("update");
  return config ?? { error: "Tournament not found", status: 404 };
}

async function deleteScoredMatches(tx: Transaction, slotIds: string[]) {
  if (slotIds.length === 0) return 0;
  const records = await tx.select({ id: match.id }).from(match).where(inArray(match.tournamentMatchId, slotIds));
  const ids = records.map((record) => record.id);
  if (ids.length) {
    await tx.delete(matchPlayer).where(inArray(matchPlayer.matchId, ids));
    await tx.delete(match).where(inArray(match.id, ids));
  }
  return ids.length;
}

export async function resetMatchResult(eventId: string, slotId: string): Promise<Failure | { ok: true }> {
  return db.transaction(async (tx) => {
    const config = await lockedCurrentTournament(tx, eventId);
    if ("error" in config) return config;
    const [slot] = await tx.select({ id: tournamentMatch.id, status: tournamentMatch.status }).from(tournamentMatch)
      .where(and(eq(tournamentMatch.tournamentId, config.id), eq(tournamentMatch.id, slotId))).for("update");
    if (!slot) return { error: "Tournament Match not found", status: 404 };
    if (slot.status === "scheduled") return { error: "This Match has no result to reset", status: 409 };
    const deleted = await deleteScoredMatches(tx, [slotId]);
    if (!deleted) return { error: "Saved Match not found", status: 409 };
    await tx.update(tournamentMatch).set({ status: "scheduled" }).where(eq(tournamentMatch.id, slotId));
    return { ok: true };
  });
}

export async function removeTournamentMatch(eventId: string, slotId: string): Promise<Failure | { ok: true }> {
  return db.transaction(async (tx) => {
    const config = await lockedCurrentTournament(tx, eventId);
    if ("error" in config) return config;
    const [slot] = await tx.select({ id: tournamentMatch.id, roundId: tournamentMatch.roundId }).from(tournamentMatch)
      .where(and(eq(tournamentMatch.tournamentId, config.id), eq(tournamentMatch.id, slotId))).for("update");
    if (!slot) return { error: "Tournament Match not found", status: 404 };
    await deleteScoredMatches(tx, [slotId]);
    await tx.delete(tournamentMatchPlayer).where(eq(tournamentMatchPlayer.matchId, slotId));
    await tx.delete(tournamentMatch).where(eq(tournamentMatch.id, slotId));
    const remaining = await tx.select({ id: tournamentMatch.id }).from(tournamentMatch).where(eq(tournamentMatch.roundId, slot.roundId)).limit(1);
    if (!remaining.length) await tx.delete(tournamentRound).where(eq(tournamentRound.id, slot.roundId));
    return { ok: true };
  });
}

export async function clearTournamentResults(eventId: string): Promise<Failure | { ok: true; deleted: number }> {
  return db.transaction(async (tx) => {
    const config = await lockedCurrentTournament(tx, eventId);
    if ("error" in config) return config;
    const slots = await tx.select({ id: tournamentMatch.id }).from(tournamentMatch).where(eq(tournamentMatch.tournamentId, config.id));
    const deleted = await deleteScoredMatches(tx, slots.map((slot) => slot.id));
    await tx.update(tournamentMatch).set({ status: "scheduled" }).where(eq(tournamentMatch.tournamentId, config.id));
    return { ok: true, deleted };
  });
}

export async function resetTournament(eventId: string): Promise<Failure | { ok: true; deleted: number }> {
  return db.transaction(async (tx) => {
    const config = await lockedCurrentTournament(tx, eventId);
    if ("error" in config) return config;
    const slots = await tx.select({ id: tournamentMatch.id }).from(tournamentMatch).where(eq(tournamentMatch.tournamentId, config.id));
    const ids = slots.map((slot) => slot.id);
    const deleted = await deleteScoredMatches(tx, ids);
    if (ids.length) await tx.delete(tournamentMatchPlayer).where(inArray(tournamentMatchPlayer.matchId, ids));
    await tx.delete(tournamentMatch).where(eq(tournamentMatch.tournamentId, config.id));
    await tx.delete(tournamentRound).where(eq(tournamentRound.tournamentId, config.id));
    await tx.delete(tournamentPlayer).where(eq(tournamentPlayer.tournamentId, config.id));
    await tx.update(tournament).set({ courts: 1, matchesPerPlayer: 3, targetScore: 11, transitionMinutes: 2 }).where(eq(tournament.id, config.id));
    return { ok: true, deleted };
  });
}
