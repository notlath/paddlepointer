import Link from "next/link";
import { redirect } from "next/navigation";
import { currentPrincipal } from "@/server/authorize";
import { readPlayerSummary } from "@/server/player-summary";

export const dynamic = "force-dynamic";

export default async function PlayerAccountPage() {
  const principal = await currentPrincipal();
  if (!principal) redirect("/sign-in");
  if (principal.role !== "player") redirect("/account");
  const summary = await readPlayerSummary(principal.id);
  return <main><p><Link href="/account">Your account</Link></p><h1>My Player Matches</h1>
    {!summary ? <p>Your account is not linked to a verified Player record. Ask staff to review your Player ID and link before Match summaries can be shown. You can also use <Link href="/recover">account recovery</Link> if your email access has changed.</p> : <>
      <h2>{summary.player.name}</h2><p>Skill level: {summary.player.skillLevel ?? "Unrated"}</p>
      <p>{summary.matches.length} completed Matches · {summary.wins} wins · {summary.losses} losses</p>
      <h2>Match summaries</h2>
      {summary.matches.length === 0 ? <p>No completed Matches yet.</p> : <ol>{summary.matches.map((record) => <li key={record.id}>
        {record.teamA.join(" & ")} {record.scoreA}–{record.scoreB} {record.teamB.join(" & ")}
        {" · "}{record.playedAt.toISOString().slice(0, 10)} · {record.won ? "Win" : record.lost ? "Loss" : "No winner"}
      </li>)}</ol>}
    </>}
  </main>;
}
