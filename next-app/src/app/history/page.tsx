import Link from "next/link";
import { redirect } from "next/navigation";
import { currentPrincipal, isStaff } from "@/server/authorize";
import { readHistory } from "@/server/history";

export const dynamic = "force-dynamic";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const principal = await currentPrincipal();
  if (!principal) redirect("/sign-in");
  if (!isStaff(principal.role)) redirect("/account");
  const { event: eventId } = await searchParams;
  const { events, currentId, selected, results, standings, teamStandings } = await readHistory(eventId ?? null);
  const eventNames = new Map(events.map((item) => [item.id, item.name]));
  return <main>
    <p><Link href="/staff">Staff workspace</Link></p>
    <h1>Match History and Leaderboards</h1>
    <nav aria-label="Event selection">
      <Link href="/history" aria-current={selected === currentId || selected === "none" ? "page" : undefined}>Current Event</Link>{" · "}
      <Link href="/history?event=all" aria-current={selected === "all" ? "page" : undefined}>All Events</Link>
      {events.filter((item) => item.id !== currentId).map((item) => <span key={item.id}>{" · "}<Link href={`/history?event=${encodeURIComponent(item.id)}`} aria-current={selected === item.id ? "page" : undefined}>{item.name}</Link></span>)}
    </nav>
    <p>Showing: {selected === "all" ? "All Events" : selected === "none" ? "No Current Event" : eventNames.get(selected)}</p>
    <h2>Match History</h2>
    {results.length === 0 ? <p>No completed Matches in this selection.</p> : <ol>{results.map((result) => {
      const names = (team: string) => result.players.filter((person) => person.team === team).map((person) => person.name).join(" & ");
      return <li key={result.id}>
        <Link href={`/matches/${result.id}`}>{names("A")} {result.scoreA}–{result.scoreB} {names("B")}</Link>
        {" · "}{result.eventId ? eventNames.get(result.eventId) ?? "Event" : "Outside Tournament"}
        {" · "}{result.endedAt!.toISOString().slice(0, 10)} · Winner: {names(result.winner!)}
      </li>;
    })}</ol>}
    <h2>Player Leaderboard</h2>
    {standings.length === 0 ? <p>No standings in this selection.</p> : <table><thead><tr><th>Player</th><th>Played</th><th>Wins</th><th>Losses</th><th>Points for</th><th>Points against</th></tr></thead><tbody>{standings.map((row) => <tr key={row.id}><th><Link href={`/players/${row.id}`}>{row.name}</Link></th><td>{row.played}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.pointsFor}</td><td>{row.pointsAgainst}</td></tr>)}</tbody></table>}
    <h2>Team Leaderboard</h2>
    {teamStandings.length === 0 ? <p>No Team standings in this selection.</p> : <table><thead><tr><th>Team</th><th>Played</th><th>Wins</th><th>Losses</th><th>Points for</th><th>Points against</th></tr></thead><tbody>{teamStandings.map((row) => <tr key={row.id}><th>{row.name}</th><td>{row.played}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.pointsFor}</td><td>{row.pointsAgainst}</td></tr>)}</tbody></table>}
  </main>;
}
