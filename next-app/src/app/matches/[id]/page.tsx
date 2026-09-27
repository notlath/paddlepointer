import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { currentPrincipal, isStaff } from "@/server/authorize";
import { db } from "@/server/auth";
import { match, matchPlayer, player } from "@/server/schema";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const principal = await currentPrincipal();
  if (!principal) redirect("/sign-in");
  if (!isStaff(principal.role)) redirect("/account");
  const { id } = await params;
  const [record] = await db.select({ id: match.id, playedAt: match.playedAt }).from(match).where(eq(match.id, id));
  if (!record) notFound();
  const participants = await db.select({ id: player.id, name: player.name, team: matchPlayer.team, position: matchPlayer.position })
    .from(matchPlayer).innerJoin(player, eq(player.id, matchPlayer.playerId))
    .where(eq(matchPlayer.matchId, id)).orderBy(asc(matchPlayer.team), asc(matchPlayer.position));
  return <main>
    <Link href="/players">Players</Link>
    <h1>Match {record.id}</h1>
    <p>Played: {record.playedAt.toISOString()}</p>
    <ul>{participants.map((item) => <li key={item.id}>Team {item.team}: <Link href={`/players/${item.id}`}>{item.name}</Link></li>)}</ul>
  </main>;
}
