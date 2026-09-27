import { createHash } from "node:crypto";
import type { LegacySnapshot } from "./legacy-structure";
import type { MatchSnapshot } from "./legacy-matches";

export type FullSnapshot = LegacySnapshot & MatchSnapshot;
export type Feed = "get-events" | "get-matches" | "get-leaderboard-results" | "get-leaderboard-players";
const str = (value: unknown) => String(value ?? "");
const iso = (value: unknown): string | null => value == null || value === "" ? null : new Date(str(value)).toISOString();
const json = (value: unknown): Record<string, unknown> => typeof value === "string" ? JSON.parse(value) as Record<string, unknown> : value as Record<string, unknown>;
const names = (value: unknown): string[] => {
  if (value == null || value === "") return [];
  const team = json(value);
  return Array.isArray(team) ? team.map(str) : Array.isArray(team.players) ? team.players.map(str) : team.name ? [str(team.name)] : [];
};
const stable = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
export const digest = (value: unknown) => createHash("sha256").update(stable(value)).digest("hex");
export const normalizedRows = (rows: Record<string, unknown>[]) => rows.map(stable).sort();

function rallyStats(events: Record<string, unknown>[]) {
  let rallyCount = 0; let sideOuts = 0;
  const run = { A: 0, B: 0 }; const longest = { A: 0, B: 0 };
  for (const item of events) {
    if (item.action !== "correction" && item.action !== "timeout") rallyCount++;
    if (item.action === "point" && (item.rallyWinner === "A" || item.rallyWinner === "B")) {
      run[item.rallyWinner]++;
      longest[item.rallyWinner] = Math.max(longest[item.rallyWinner], run[item.rallyWinner]);
    } else if (item.action === "side-out") { sideOuts++; run.A = 0; run.B = 0; }
  }
  return { sideOuts, rallyCount, teamALongestRun: longest.A, teamBLongestRun: longest.B };
}

export function expectedQlikRows(snapshot: FullSnapshot, sourceEventId: string, feed: Feed): Record<string, unknown>[] {
  const event = snapshot.tournaments.find((row) => str(row.id) === sourceEventId);
  if (!event) throw new Error(`Source Event ${sourceEventId} is missing`);
  const slots = snapshot.matches.filter((row) => str(row.tournament_id) === sourceEventId);
  const games = snapshot.games.filter((row) => str(row.tournament_id) === sourceEventId && row.match_scope !== "visitor" && row.created_by_role !== "visitor");
  const gameBySlot = new Map(games.filter((row) => row.tournament_match_id).map((row) => [str(row.tournament_match_id), row]));
  const eventId = `legacy:event:${sourceEventId}`;
  if (feed === "get-events") {
    const starts = slots.map((row) => iso(row.started_at)).filter((value): value is string => value !== null).sort();
    const ends = slots.map((row) => iso(row.completed_at)).filter((value): value is string => value !== null).sort();
    return [{ id: eventId, name: event.name, courts: Number(event.court_count), matchCount: slots.length, completedCount: slots.filter((row) => row.status === "completed").length,
      eventWindow: starts.length || ends.length ? { start: starts[0] ?? null, end: ends.at(-1) ?? null } : null,
      isCurrent: snapshot.currentEventId === sourceEventId }];
  }
  if (feed === "get-matches") return slots.map((slot) => {
    const game = gameBySlot.get(str(slot.id));
    return { eventId, matchId: `legacy:match:${sourceEventId}:${str(slot.id)}`, round: Number(slot.round), court: Number(slot.court), status: slot.status,
      teamA: names(slot.team_a), teamB: names(slot.team_b), scoreA: game ? Number(game.team_a_score) : null, scoreB: game ? Number(game.team_b_score) : null,
      winner: game?.winner_team ?? null, startedAt: iso(slot.started_at), completedAt: iso(slot.completed_at), gameId: game ? `legacy:game:${str(game.id)}` : null };
  });
  if (feed === "get-leaderboard-results") return games.filter((row) => row.winner_team === "A" || row.winner_team === "B").map((row) => {
    const source = json(row.game_json);
    const slot = slots.find((item) => item.id === row.tournament_match_id);
    const duration = Number(row.duration_seconds ?? 0);
    return { matchId: `legacy:game:${str(row.id)}`, eventId, winner: row.winner_team,
      teamAScore: Number(row.team_a_score), teamBScore: Number(row.team_b_score), targetScore: Number(row.target_score),
      durationSeconds: duration > 0 ? duration : null, completedAt: iso(row.ended_at), round: slot ? Number(slot.round) : null, court: slot ? Number(slot.court) : null,
      ...rallyStats(Array.isArray(source.events) ? source.events as Record<string, unknown>[] : []) };
  });
  const rows: Record<string, unknown>[] = [];
  for (const game of games) for (const person of snapshot.gamePlayers.filter((row) => row.game_id === game.id)) rows.push({ matchId: `legacy:game:${str(game.id)}`, eventId, team: person.team, playerName: str(person.player_name).trim() });
  for (const slot of slots.filter((row) => (row.status === "scheduled" || row.status === "in_progress") && !gameBySlot.has(str(row.id)))) {
    for (const [team, teamNames] of [["A", names(slot.team_a)], ["B", names(slot.team_b)]] as const) for (const playerName of teamNames) rows.push({ matchId: `legacy:match:${sourceEventId}:${str(slot.id)}`, eventId, team, playerName: playerName.trim() });
  }
  return rows;
}
