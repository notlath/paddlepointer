import { and, asc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "./auth";
import { buildOpenPlayMatches } from "./open-play-scheduler";
import { currentEvent, player, tournament, tournamentMatch, tournamentMatchPlayer, tournamentPlayer, tournamentRound } from "./schema";

type SetupInput = { courts: number; matchesPerPlayer: number; targetScore: number; transitionMinutes: number; playerIds: string[]; unavailablePlayerIds: string[] };
type Adjustment = { round: number; court: number; teamA: string[]; teamB: string[] };
type Failure = { error: string; status: number };

function integer(value: unknown, min: number, max: number) {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
}

export function validateSetup(body: unknown): SetupInput | Failure {
  if (!body || typeof body !== "object") return { error: "Tournament setup is required", status: 400 };
  const data = body as Record<string, unknown>;
  if (!integer(data.courts, 1, 16)) return { error: "Courts must be between 1 and 16", status: 400 };
  if (!integer(data.matchesPerPlayer, 1, 30)) return { error: "Matches per Player must be between 1 and 30", status: 400 };
  if (!integer(data.targetScore, 1, 99)) return { error: "Target score must be between 1 and 99", status: 400 };
  if (!integer(data.transitionMinutes, 0, 20)) return { error: "Transition minutes must be between 0 and 20", status: 400 };
  if (!Array.isArray(data.playerIds) || !data.playerIds.every((id) => typeof id === "string")) return { error: "Choose Tournament Players", status: 400 };
  if (!Array.isArray(data.unavailablePlayerIds) || !data.unavailablePlayerIds.every((id) => typeof id === "string")) return { error: "Unavailable Players must be selected from the roster", status: 400 };
  const ids = data.playerIds as string[];
  const unavailable = data.unavailablePlayerIds as string[];
  if (ids.length !== new Set(ids).size) return { error: "A Player appears more than once in the roster", status: 400 };
  if (unavailable.length !== new Set(unavailable).size || unavailable.some((id) => !ids.includes(id))) return { error: "Unavailable Players must be selected from the roster", status: 400 };
  if (ids.length < 4) return { error: "Add at least 4 registered Players", status: 400 };
  return { courts: data.courts as number, matchesPerPlayer: data.matchesPerPlayer as number, targetScore: data.targetScore as number, transitionMinutes: data.transitionMinutes as number, playerIds: ids, unavailablePlayerIds: unavailable };
}

async function currentTournament(tx: Pick<typeof db, "select">) {
  const [row] = await tx.select({ id: tournament.id, courts: tournament.courts, matchesPerPlayer: tournament.matchesPerPlayer, targetScore: tournament.targetScore, transitionMinutes: tournament.transitionMinutes })
    .from(currentEvent).innerJoin(tournament, eq(tournament.eventId, currentEvent.eventId)).where(eq(currentEvent.singleton, 1));
  return row ?? null;
}

async function lockedCurrentTournament(tx: Transaction) {
  await tx.select({ eventId: currentEvent.eventId }).from(currentEvent).where(eq(currentEvent.singleton, 1)).for("update");
  return currentTournament(tx);
}

export async function readOpenPlay() {
  const config = await currentTournament(db);
  if (!config) return null;
  const [roster, rounds, slots, assignments] = await Promise.all([
    db.select({ id: player.id, name: player.name, skillLevel: player.skillLevel, available: tournamentPlayer.available }).from(tournamentPlayer).innerJoin(player, eq(player.id, tournamentPlayer.playerId)).where(eq(tournamentPlayer.tournamentId, config.id)).orderBy(asc(player.name)),
    db.select({ id: tournamentRound.id, number: tournamentRound.number }).from(tournamentRound).where(eq(tournamentRound.tournamentId, config.id)).orderBy(asc(tournamentRound.number)),
    db.select({ id: tournamentMatch.id, roundId: tournamentMatch.roundId, court: tournamentMatch.court, status: tournamentMatch.status }).from(tournamentMatch).where(eq(tournamentMatch.tournamentId, config.id)).orderBy(asc(tournamentMatch.court)),
    db.select({ matchId: tournamentMatchPlayer.matchId, playerId: player.id, name: player.name, team: tournamentMatchPlayer.team, position: tournamentMatchPlayer.position }).from(tournamentMatchPlayer).innerJoin(player, eq(player.id, tournamentMatchPlayer.playerId)).innerJoin(tournamentMatch, eq(tournamentMatch.id, tournamentMatchPlayer.matchId)).where(eq(tournamentMatch.tournamentId, config.id)).orderBy(asc(tournamentMatchPlayer.position)),
  ]);
  const byMatch = new Map<string, typeof assignments>();
  for (const assignment of assignments) byMatch.set(assignment.matchId, [...(byMatch.get(assignment.matchId) ?? []), assignment]);
  const byRound = new Map<string, typeof slots>();
  for (const slot of slots) byRound.set(slot.roundId, [...(byRound.get(slot.roundId) ?? []), slot]);
  return { ...config, roster, rounds: rounds.map((round) => ({ number: round.number, matches: (byRound.get(round.id) ?? []).map((slot) => ({ id: slot.id, court: slot.court, status: slot.status, teamA: (byMatch.get(slot.id) ?? []).filter((person) => person.team === "A"), teamB: (byMatch.get(slot.id) ?? []).filter((person) => person.team === "B") })) })) };
}

export async function saveSetup(input: SetupInput): Promise<Failure | { ok: true }> {
  return db.transaction(async (tx) => {
    const config = await lockedCurrentTournament(tx);
    if (!config) return { error: "Start an Event first", status: 404 };
    await tx.select({ id: tournament.id }).from(tournament).where(eq(tournament.id, config.id)).for("update");
    const found = await tx.select({ id: player.id }).from(player).where(inArray(player.id, input.playerIds));
    if (found.length !== input.playerIds.length) return { error: "One or more Players no longer exist", status: 400 };
    const active = await tx.select({ id: tournamentMatch.id }).from(tournamentMatch).where(and(eq(tournamentMatch.tournamentId, config.id), inArray(tournamentMatch.status, ["in_progress", "completed"]))).limit(1);
    if (active.length) return { error: "This Schedule has Matches in play or completed; setup is locked", status: 409 };
    await clearSchedule(tx, config.id);
    await tx.delete(tournamentPlayer).where(eq(tournamentPlayer.tournamentId, config.id));
    await tx.update(tournament).set({ courts: input.courts, matchesPerPlayer: input.matchesPerPlayer, targetScore: input.targetScore, transitionMinutes: input.transitionMinutes }).where(eq(tournament.id, config.id));
    await tx.insert(tournamentPlayer).values(input.playerIds.map((id) => ({ tournamentId: config.id, playerId: id, available: !input.unavailablePlayerIds.includes(id) })));
    return { ok: true };
  });
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function clearSchedule(tx: Transaction, tournamentId: string) {
  const matches = await tx.select({ id: tournamentMatch.id }).from(tournamentMatch).where(eq(tournamentMatch.tournamentId, tournamentId));
  if (matches.length) await tx.delete(tournamentMatchPlayer).where(inArray(tournamentMatchPlayer.matchId, matches.map((item) => item.id)));
  await tx.delete(tournamentMatch).where(eq(tournamentMatch.tournamentId, tournamentId));
  await tx.delete(tournamentRound).where(eq(tournamentRound.tournamentId, tournamentId));
}

export async function generateSchedule(): Promise<Failure | { ok: true; matchCount: number }> {
  return db.transaction(async (tx) => {
    const config = await lockedCurrentTournament(tx);
    if (!config) return { error: "Start an Event first", status: 404 };
    await tx.select({ id: tournament.id }).from(tournament).where(eq(tournament.id, config.id)).for("update");
    const roster = await tx.select({ id: player.id, name: player.name, skillLevel: player.skillLevel, available: tournamentPlayer.available }).from(tournamentPlayer).innerJoin(player, eq(player.id, tournamentPlayer.playerId)).where(eq(tournamentPlayer.tournamentId, config.id));
    if (roster.length < 4) return { error: "Add at least 4 registered Players", status: 400 };
    const unavailable = roster.filter((item) => !item.available);
    if (unavailable.length) return { error: `Unavailable Players: ${unavailable.map((item) => item.name).join(", ")}. Mark them available or remove them.`, status: 400 };
    const active = await tx.select({ id: tournamentMatch.id }).from(tournamentMatch).where(and(eq(tournamentMatch.tournamentId, config.id), inArray(tournamentMatch.status, ["in_progress", "completed"]))).limit(1);
    if (active.length) return { error: "This Schedule has Matches in play or completed; regeneration is locked", status: 409 };
    const generated = buildOpenPlayMatches(roster.map((item) => item.name), config.courts, config.matchesPerPlayer, [], undefined, Object.fromEntries(roster.filter((item) => item.skillLevel).map((item) => [item.name, item.skillLevel!])));
    const byName = new Map(roster.map((item) => [item.name, item.id]));
    await clearSchedule(tx, config.id);
    const numbers = [...new Set(generated.map((item) => item.round))];
    const roundIds = new Map(numbers.map((number) => [number, randomUUID()]));
    await tx.insert(tournamentRound).values(numbers.map((number) => ({ id: roundIds.get(number)!, tournamentId: config.id, number })));
    const rows = generated.map((item) => ({ item, id: randomUUID(), roundId: roundIds.get(item.round)! }));
    await tx.insert(tournamentMatch).values(rows.map(({ item, id, roundId }) => ({ id, tournamentId: config.id, roundId, court: item.court })));
    await tx.insert(tournamentMatchPlayer).values(rows.flatMap(({ item, id, roundId }) => [...item.teamA.map((name, index) => ({ matchId: id, roundId, playerId: byName.get(name)!, team: "A", position: index + 1 })), ...item.teamB.map((name, index) => ({ matchId: id, roundId, playerId: byName.get(name)!, team: "B", position: index + 1 }))]));
    return { ok: true, matchCount: generated.length };
  });
}

export function validateAdjustment(body: unknown): Adjustment | Failure {
  if (!body || typeof body !== "object") return { error: "Match adjustment is required", status: 400 };
  const data = body as Record<string, unknown>;
  if (!integer(data.round, 1, 999)) return { error: "Round must be a positive number", status: 400 };
  if (!integer(data.court, 1, 16)) return { error: "Court must be between 1 and 16", status: 400 };
  if (!Array.isArray(data.teamA) || !Array.isArray(data.teamB) || data.teamA.length !== 2 || data.teamB.length !== 2 || ![...data.teamA, ...data.teamB].every((id) => typeof id === "string")) {
    return { error: "Choose two Players for each Team", status: 400 };
  }
  if (new Set([...data.teamA, ...data.teamB]).size !== 4) return { error: "A Player cannot occupy two Match slots", status: 400 };
  return { round: data.round as number, court: data.court as number, teamA: data.teamA as string[], teamB: data.teamB as string[] };
}

export async function adjustMatch(id: string, input: Adjustment): Promise<Failure | { ok: true }> {
  return db.transaction(async (tx) => {
    const config = await lockedCurrentTournament(tx);
    if (!config) return { error: "Start an Event first", status: 404 };
    await tx.select({ id: tournament.id }).from(tournament).where(eq(tournament.id, config.id)).for("update");
    const [slot] = await tx.select().from(tournamentMatch).where(and(eq(tournamentMatch.id, id), eq(tournamentMatch.tournamentId, config.id)));
    if (!slot) return { error: "Tournament Match not found", status: 404 };
    if (slot.status !== "scheduled") return { error: "Only scheduled Matches can be adjusted", status: 409 };
    if (input.court > config.courts) return { error: `Court must be between 1 and ${config.courts}`, status: 400 };
    const roster = await tx.select({ id: tournamentPlayer.playerId, available: tournamentPlayer.available }).from(tournamentPlayer).where(eq(tournamentPlayer.tournamentId, config.id));
    const availableIds = new Set(roster.filter((item) => item.available).map((item) => item.id));
    const requested = [...input.teamA, ...input.teamB];
    if (requested.some((playerId) => !availableIds.has(playerId))) return { error: "One or more Players are unavailable or not on the roster", status: 400 };
    let [round] = await tx.select({ id: tournamentRound.id }).from(tournamentRound).where(and(eq(tournamentRound.tournamentId, config.id), eq(tournamentRound.number, input.round)));
    const newRound = !round;
    if (!round) round = { id: randomUUID() };
    const otherSlots = await tx.select({ id: tournamentMatch.id, court: tournamentMatch.court }).from(tournamentMatch).where(and(eq(tournamentMatch.roundId, round.id), eq(tournamentMatch.tournamentId, config.id)));
    if (otherSlots.some((other) => other.id !== id && other.court === input.court)) return { error: `Court ${input.court} is already used in Round ${input.round}`, status: 409 };
    const otherPlayers = await tx.select({ matchId: tournamentMatchPlayer.matchId, playerId: tournamentMatchPlayer.playerId }).from(tournamentMatchPlayer).where(eq(tournamentMatchPlayer.roundId, round.id));
    if (otherPlayers.some((other) => other.matchId !== id && requested.includes(other.playerId))) return { error: `A Player is already scheduled in Round ${input.round}`, status: 409 };
    if (newRound) await tx.insert(tournamentRound).values({ id: round.id, tournamentId: config.id, number: input.round });
    await tx.delete(tournamentMatchPlayer).where(eq(tournamentMatchPlayer.matchId, id));
    await tx.update(tournamentMatch).set({ roundId: round.id, court: input.court }).where(eq(tournamentMatch.id, id));
    await tx.insert(tournamentMatchPlayer).values([...input.teamA.map((playerId, index) => ({ matchId: id, roundId: round.id, playerId, team: "A", position: index + 1 })), ...input.teamB.map((playerId, index) => ({ matchId: id, roundId: round.id, playerId, team: "B", position: index + 1 }))]);
    if (slot.roundId !== round.id) {
      const remaining = await tx.select({ id: tournamentMatch.id }).from(tournamentMatch).where(eq(tournamentMatch.roundId, slot.roundId)).limit(1);
      if (!remaining.length) await tx.delete(tournamentRound).where(eq(tournamentRound.id, slot.roundId));
    }
    return { ok: true };
  });
}
