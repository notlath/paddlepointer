import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "./auth";
import { visitorMatch } from "./schema";
import { rallyEngine, type Game } from "./rally";

type Team = "A" | "B";

function cleanNames(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const names = value.map((name) => typeof name === "string" ? name.trim().replace(/\s+/gu, " ") : "");
  return names.every((name) => name.length > 0 && name.length <= 120) ? names : null;
}

export async function createVisitorMatch(ownerId: string, value: unknown) {
  const names = cleanNames(value);
  if (!names) return { error: "Enter four names, each up to 120 characters", status: 400 };
  const game = rallyEngine.createGame({
    id: randomUUID(), type: "doubles", targetScore: 11, firstServer: "A",
    teamA: { name: "Team A", players: names.slice(0, 2), startingRight: 0 },
    teamB: { name: "Team B", players: names.slice(2), startingRight: 0 },
  });
  await db.insert(visitorMatch).values({ id: game.id, ownerId, game, playedAt: new Date(game.startedAt) });
  return { id: game.id };
}

export async function readVisitorMatch(ownerId: string, id: string) {
  const [record] = await db.select({ game: visitorMatch.game }).from(visitorMatch)
    .where(and(eq(visitorMatch.id, id), eq(visitorMatch.ownerId, ownerId)));
  return record?.game ?? null;
}

export async function changeVisitorMatch(ownerId: string, id: string, action: "rally" | "undo" | "end" | "reset", winner?: unknown) {
  if (!["rally", "undo", "end", "reset"].includes(action)) return { error: "Unknown Match action", status: 400 };
  if (action === "rally" && winner !== "A" && winner !== "B") return { error: "Choose the Rally winner", status: 400 };
  return db.transaction(async (tx) => {
    const [record] = await tx.select().from(visitorMatch)
      .where(and(eq(visitorMatch.id, id), eq(visitorMatch.ownerId, ownerId))).for("update");
    if (!record) return { error: "Match not found", status: 404 };
    const game: Game = record.game;
    if (game.status === "completed" && action !== "undo") return { error: "Match is already saved", status: 409 };
    if (action === "rally") rallyEngine.recordRally(game, winner as Team, { eventId: randomUUID() });
    if (action === "undo" && (!game.events.length || game.status === "completed" && rallyEngine.detectWinner(game) === null || !rallyEngine.undoRally(game))) return { error: "No Rally action to undo", status: 409 };
    if (action === "end") rallyEngine.endGameEarly(game);
    if (action === "reset") rallyEngine.resetGame(game);
    await tx.update(visitorMatch).set({ game, status: game.status, playedAt: new Date(game.startedAt), endedAt: game.endedAt ? new Date(game.endedAt) : null })
      .where(eq(visitorMatch.id, id));
    return { game };
  });
}

export async function readVisitorHistory(ownerId: string) {
  const rows = await db.select({ id: visitorMatch.id, game: visitorMatch.game })
    .from(visitorMatch).where(eq(visitorMatch.ownerId, ownerId)).orderBy(desc(visitorMatch.playedAt));
  const active = rows.filter((row) => row.game.status === "active");
  const results = rows.filter((row) => row.game.status === "completed");
  type Standing = { name: string; played: number; wins: number; losses: number; pointsFor: number; pointsAgainst: number; minutesPlayed: number };
  const players = new Map<string, Standing>();
  const teams = new Map<string, Standing>();
  for (const { game } of results.filter((row) => row.game.winner)) for (const side of ["A", "B"] as const) {
    const names = (side === "A" ? game.teamA : game.teamB).players;
    const scored = side === "A" ? game.teamA.score : game.teamB.score;
    const conceded = side === "A" ? game.teamB.score : game.teamA.score;
    const minutes = Math.max(0, Math.round((Date.parse(game.endedAt!) - Date.parse(game.startedAt)) / 60_000));
    const record = (map: Map<string, Standing>, key: string, name: string) => {
      const row = map.get(key) ?? { name, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, minutesPlayed: 0 };
      row.played++;
      row.wins += Number(game.winner === side);
      row.losses += Number(game.winner !== side);
      row.pointsFor += scored;
      row.pointsAgainst += conceded;
      row.minutesPlayed += minutes;
      map.set(key, row);
    };
    for (const name of names) record(players, name.toLocaleLowerCase(), name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    record(teams, sorted.map((name) => name.toLocaleLowerCase()).join(":"), sorted.join(" & "));
  }
  const rank = (a: Standing, b: Standing) => b.wins - a.wins || Math.round(b.wins / b.played * 100) - Math.round(a.wins / a.played * 100) ||
    (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst) || b.minutesPlayed - a.minutesPlayed || b.pointsFor - a.pointsFor || a.name.localeCompare(b.name);
  return { active, results, leaderboard: [...players.values()].sort(rank), teamStandings: [...teams.values()].sort(rank) };
}
