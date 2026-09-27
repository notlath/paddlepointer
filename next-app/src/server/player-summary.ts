import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./auth";
import { match, matchPlayer, player, user } from "./schema";

export async function readPlayerSummary(accountId: string) {
  const [linked] = await db.select({ id: player.id, name: player.name, skillLevel: player.skillLevel })
    .from(user).innerJoin(player, eq(player.id, user.playerId)).where(eq(user.id, accountId));
  if (!linked) return null;
  const records = await db.select({ id: match.id, playedAt: match.playedAt, scoreA: match.scoreA, scoreB: match.scoreB, winner: match.winner, team: matchPlayer.team })
    .from(matchPlayer).innerJoin(match, eq(match.id, matchPlayer.matchId))
    .where(and(eq(matchPlayer.playerId, linked.id), eq(match.status, "completed"))).orderBy(desc(match.playedAt), desc(match.id));
  const participants = records.length ? await db.select({ matchId: matchPlayer.matchId, name: player.name, team: matchPlayer.team, position: matchPlayer.position })
    .from(matchPlayer).innerJoin(player, eq(player.id, matchPlayer.playerId))
    .where(inArray(matchPlayer.matchId, records.map((record) => record.id))) : [];
  const matches = records.map((record) => ({
    ...record,
    teamA: participants.filter((person) => person.matchId === record.id && person.team === "A").sort((a, b) => a.position - b.position).map((person) => person.name),
    teamB: participants.filter((person) => person.matchId === record.id && person.team === "B").sort((a, b) => a.position - b.position).map((person) => person.name),
    won: record.team === record.winner,
    lost: record.winner !== null && record.team !== record.winner,
  }));
  return { player: linked, matches, wins: matches.filter((item) => item.won).length, losses: matches.filter((item) => item.lost).length };
}
