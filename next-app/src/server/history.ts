import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "./auth";
import { currentEvent, event, match, matchPlayer, player } from "./schema";

export async function readHistory(selection: string | null) {
  const [events, current] = await Promise.all([
    db.select({ id: event.id, name: event.name }).from(event).orderBy(desc(event.createdAt), desc(event.id)),
    db.select({ eventId: currentEvent.eventId }).from(currentEvent).where(eq(currentEvent.singleton, 1)),
  ]);
  const currentId = current[0]?.eventId ?? null;
  const selectedId = selection === "all" ? null : selection && events.some((item) => item.id === selection) ? selection : currentId;
  const selected = selection === "all" ? "all" : selectedId ?? "none";
  const conditions = and(eq(match.status, "completed"), isNotNull(match.endedAt), inArray(match.winner, ["A", "B"]));
  const records = await db.select({ id: match.id, eventId: match.eventId, playedAt: match.playedAt, endedAt: match.endedAt, scoreA: match.scoreA, scoreB: match.scoreB, winner: match.winner })
    .from(match).where(selected === "none" ? and(conditions, eq(match.id, "")) : selected === "all" ? conditions : and(conditions, eq(match.eventId, selected)))
    .orderBy(desc(match.endedAt), desc(match.id));
  const eligible = records.filter((item) => (item.winner === "A" || item.winner === "B") && item.endedAt);
  const participants = eligible.length ? await db.select({ matchId: matchPlayer.matchId, id: player.id, name: player.name, team: matchPlayer.team, position: matchPlayer.position })
    .from(matchPlayer).innerJoin(player, eq(player.id, matchPlayer.playerId))
    .where(inArray(matchPlayer.matchId, eligible.map((item) => item.id))) : [];
  const byMatch = new Map<string, typeof participants>();
  for (const person of participants) byMatch.set(person.matchId, [...(byMatch.get(person.matchId) ?? []), person]);
  const results = eligible.filter((item) => {
    const people = byMatch.get(item.id) ?? [];
    return people.length === 4 && people.filter((person) => person.team === "A").length === 2 && people.filter((person) => person.team === "B").length === 2;
  }).map((item) => ({ ...item, players: (byMatch.get(item.id) ?? []).sort((a, b) => a.position - b.position) }));
  type Standing = { id: string; name: string; played: number; wins: number; losses: number; pointsFor: number; pointsAgainst: number; minutesPlayed: number };
  const totals = new Map<string, Standing>();
  const teams = new Map<string, Standing>();
  for (const result of results) for (const person of result.players) {
    const row = totals.get(person.id) ?? { id: person.id, name: person.name, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, minutesPlayed: 0 };
    row.played++;
    row.wins += Number(person.team === result.winner);
    row.losses += Number(person.team !== result.winner);
    row.pointsFor += person.team === "A" ? result.scoreA : result.scoreB;
    row.pointsAgainst += person.team === "A" ? result.scoreB : result.scoreA;
    row.minutesPlayed += Math.max(0, Math.round((result.endedAt!.getTime() - result.playedAt.getTime()) / 60_000));
    totals.set(person.id, row);
  }
  for (const result of results) for (const side of ["A", "B"]) {
    const people = result.players.filter((person) => person.team === side).sort((a, b) => a.id.localeCompare(b.id));
    const id = people.map((person) => person.id).join(":");
    const row = teams.get(id) ?? { id, name: people.map((person) => person.name).join(" & "), played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, minutesPlayed: 0 };
    row.played++;
    row.wins += Number(side === result.winner);
    row.losses += Number(side !== result.winner);
    row.pointsFor += side === "A" ? result.scoreA : result.scoreB;
    row.pointsAgainst += side === "A" ? result.scoreB : result.scoreA;
    row.minutesPlayed += Math.max(0, Math.round((result.endedAt!.getTime() - result.playedAt.getTime()) / 60_000));
    teams.set(id, row);
  }
  const rank = (a: Standing, b: Standing) => b.wins - a.wins || Math.round(b.wins / b.played * 100) - Math.round(a.wins / a.played * 100) ||
    (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst) || b.minutesPlayed - a.minutesPlayed || b.pointsFor - a.pointsFor || a.name.localeCompare(b.name);
  const standings = [...totals.values()].sort(rank);
  const teamStandings = [...teams.values()].sort(rank);
  return { events, currentId, selected, results, standings, teamStandings };
}
