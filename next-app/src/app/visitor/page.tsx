import Link from "next/link";
import { redirect } from "next/navigation";
import { currentPrincipal } from "@/server/authorize";
import { readVisitorHistory } from "@/server/visitor-matches";
import { NewVisitorMatch } from "./new-match";

export const dynamic = "force-dynamic";

export default async function VisitorPage() {
  const principal = await currentPrincipal();
  if (!principal) redirect("/sign-in");
  if (principal.role !== "visitor") redirect("/staff");
  const { active, results, leaderboard, teamStandings } = await readVisitorHistory(principal.id);
  return <main><p><Link href="/account">Your account</Link></p><h1>Visitor Matches</h1><NewVisitorMatch />
    <h2>Matches in progress</h2>
    {active.length === 0 ? <p>No active Visitor Matches.</p> : <ul>{active.map(({ id, game }) => <li key={id}><Link href={`/visitor/matches/${id}`}>{game.teamA.players.join(" & ")} vs {game.teamB.players.join(" & ")}</Link></li>)}</ul>}
    <h2>Match History</h2>
    {results.length === 0 ? <p>No completed Visitor Matches yet.</p> : <ol>{results.map(({ id, game }) => <li key={id}>
      <Link href={`/visitor/matches/${id}`}>{game.teamA.players.join(" & ")} {game.teamA.score}–{game.teamB.score} {game.teamB.players.join(" & ")}</Link>
      {" · "}{game.endedAt?.slice(0, 10)} · {game.winner ? `Winner: Team ${game.winner}` : "No winner"}
    </li>)}</ol>}
    <h2>Visitor Leaderboard</h2>
    {leaderboard.length === 0 ? <p>No Visitor standings yet.</p> : <table><thead><tr><th>Name</th><th>Played</th><th>Wins</th><th>Losses</th></tr></thead><tbody>{leaderboard.map((row) => <tr key={row.name}><th>{row.name}</th><td>{row.played}</td><td>{row.wins}</td><td>{row.losses}</td></tr>)}</tbody></table>}
    <h2>Visitor Team Leaderboard</h2>
    {teamStandings.length === 0 ? <p>No Visitor Team standings yet.</p> : <table><thead><tr><th>Team</th><th>Played</th><th>Wins</th><th>Losses</th></tr></thead><tbody>{teamStandings.map((row) => <tr key={row.name}><th>{row.name}</th><td>{row.played}</td><td>{row.wins}</td><td>{row.losses}</td></tr>)}</tbody></table>}
  </main>;
}
