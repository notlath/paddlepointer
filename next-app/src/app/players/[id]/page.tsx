import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { currentPrincipal } from "@/server/authorize";
import { db } from "@/server/auth";
import { match, matchPlayer, player, user } from "@/server/schema";

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const principal = await currentPrincipal();
  if (!principal) redirect("/sign-in");
  if (principal.role === "visitor") redirect("/account");
  const { id } = await params;
  const [record] = await db.select({ name: player.name, skillLevel: player.skillLevel, accountId: user.id })
    .from(player).leftJoin(user, eq(user.playerId, player.id)).where(eq(player.id, id));
  if (!record) notFound();
  const matches = await db.select({ id: match.id, playedAt: match.playedAt }).from(matchPlayer)
    .innerJoin(match, eq(match.id, matchPlayer.matchId)).where(eq(matchPlayer.playerId, id));
  return <main>
    <Link href="/players">All Players</Link>
    <h1>{record.name}</h1>
    <p>Skill level: {record.skillLevel ?? "Unrated"}</p>
    <p>Linked account: {record.accountId ? "Yes" : "No"}</p>
    <h2>Matches</h2>
    {matches.length === 0 ? <p>No Matches yet</p> : <ul>{matches.map((item) => <li key={item.id}><Link href={`/matches/${item.id}`}>Match {item.id}</Link> — {item.playedAt.toISOString().slice(0, 10)}</li>)}</ul>}
  </main>;
}
