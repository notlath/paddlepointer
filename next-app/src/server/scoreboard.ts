import { and, asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "./auth";
import { currentEvent, match, matchPlayer, player, tournament, tournamentMatch, tournamentMatchPlayer, tournamentRound } from "./schema";
import { rallyEngine, type Game } from "./rally";

type Team = "A" | "B";
type Failure = { error: string; status: number };
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function slotDetails(query: Pick<typeof db, "select">, id: string) {
  const [slot] = await query.select({
    id: tournamentMatch.id, status: tournamentMatch.status, court: tournamentMatch.court,
    eventId: currentEvent.eventId, targetScore: tournament.targetScore, round: tournamentRound.number,
  }).from(tournamentMatch)
    .innerJoin(tournament, eq(tournament.id, tournamentMatch.tournamentId))
    .innerJoin(currentEvent, eq(currentEvent.eventId, tournament.eventId))
    .innerJoin(tournamentRound, eq(tournamentRound.id, tournamentMatch.roundId))
    .where(and(eq(tournamentMatch.id, id), eq(currentEvent.singleton, 1)));
  return slot ?? null;
}

async function assignedPlayers(query: Pick<typeof db, "select">, id: string) {
  return query.select({ id: player.id, name: player.name, team: tournamentMatchPlayer.team, position: tournamentMatchPlayer.position })
    .from(tournamentMatchPlayer).innerJoin(player, eq(player.id, tournamentMatchPlayer.playerId))
    .where(eq(tournamentMatchPlayer.matchId, id)).orderBy(asc(tournamentMatchPlayer.team), asc(tournamentMatchPlayer.position));
}

type Players = Awaited<ReturnType<typeof assignedPlayers>>;
type Match = typeof match.$inferSelect;

function teamNames(players: Players, team: Team) {
  return players.filter((person) => person.team === team).map((person) => person.name);
}

function initialGame(record: Match, players: Players): Game {
  return rallyEngine.createGame({
    id: record.id, type: "doubles", targetScore: record.targetScore, winByTwo: record.winByTwo,
    firstServer: record.firstServer, now: record.playedAt.toISOString(),
    teamA: { name: "Team A", players: teamNames(players, "A"), startingRight: record.startingRightA },
    teamB: { name: "Team B", players: teamNames(players, "B"), startingRight: record.startingRightB },
  });
}

function validRallyLog(record: Match, players: Players) {
  if (!Array.isArray(record.rallyLog)) throw new Error("Invalid Rally history");
  const replay = initialGame(record, players);
  const ids = new Set<string>();
  let lastTime = record.playedAt.getTime();
  const fields = ["action", "previousScore", "newScore", "servingTeamBefore", "servingTeamAfter", "serverNumberBefore", "serverNumberAfter", "currentServerIndexBefore", "currentServerIndexAfter", "serveSideBefore", "serveSideAfter", "scoreBefore", "scoreAfter"];
  for (const value of record.rallyLog) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Rally history");
    const event = value as Record<string, unknown>;
    const time = typeof event.createdAt === "string" ? Date.parse(event.createdAt) : NaN;
    if (typeof event.id !== "string" || !event.id || ids.has(event.id) || !Number.isFinite(time) || time < lastTime || (event.rallyWinner !== "A" && event.rallyWinner !== "B")) throw new Error("Invalid Rally history");
    const result = rallyEngine.recordRally(replay, event.rallyWinner, { eventId: event.id, now: event.createdAt });
    const expected = replay.events.at(-1);
    if (!result || !expected || fields.some((field) => JSON.stringify(event[field]) !== JSON.stringify(expected[field]))) throw new Error("Invalid Rally history");
    ids.add(event.id);
    lastTime = time;
  }
  if (replay.teamA.score !== record.scoreA || replay.teamB.score !== record.scoreB || replay.servingTeam !== record.servingTeam || replay.serverNumber !== record.serverNumber || replay.currentServerIndex !== record.serverIndex || replay.teamA.positions.right !== record.rightA || replay.teamB.positions.right !== record.rightB || replay.sideOuts !== record.sideOuts) throw new Error("Invalid Rally history");
}

function gameFrom(record: Match, players: Players): Game {
  validRallyLog(record, players);
  const game = initialGame(record, players);
  game.teamA.score = record.scoreA;
  game.teamB.score = record.scoreB;
  game.teamA.positions = { right: record.rightA, left: 1 - record.rightA };
  game.teamB.positions = { right: record.rightB, left: 1 - record.rightB };
  game.servingTeam = record.servingTeam as Team;
  game.serverNumber = record.serverNumber;
  game.currentServerIndex = record.serverIndex;
  game.sideOuts = record.sideOuts;
  game.status = record.status as Game["status"];
  game.winner = record.winner as Team | null;
  game.endedAt = record.endedAt?.toISOString() ?? null;
  game.events = record.rallyLog;
  return game;
}

function savedFields(game: Game) {
  return {
    status: game.status, scoreA: game.teamA.score, scoreB: game.teamB.score,
    servingTeam: game.servingTeam, serverNumber: game.serverNumber, serverIndex: game.currentServerIndex,
    rightA: game.teamA.positions.right, rightB: game.teamB.positions.right, sideOuts: game.sideOuts,
    winner: game.winner, endedAt: game.endedAt ? new Date(game.endedAt) : null,
    rallyLog: game.events,
  };
}

export async function readScoreboard(id: string) {
  const slot = await slotDetails(db, id);
  if (!slot) return null;
  const [players, records] = await Promise.all([
    assignedPlayers(db, id),
    db.select().from(match).where(eq(match.tournamentMatchId, id)),
  ]);
  const record = records[0];
  const game = record ? gameFrom(record, players) : null;
  return {
    slot, players,
    match: game ? {
      id: game.id, status: game.status, scoreA: game.teamA.score, scoreB: game.teamB.score,
      scoreCall: rallyEngine.scoreCall(game), servingTeam: game.servingTeam,
      serverNumber: game.serverNumber, serverName: rallyEngine.currentServerName(game),
      serveSide: rallyEngine.servePosition(game).side, winner: game.winner,
      sideOuts: game.sideOuts, events: game.events,
      canUndo: game.events.length > 0 && (game.status === "active" || rallyEngine.detectWinner(game) !== null),
    } : null,
  };
}

async function lockedSlot(tx: Transaction, id: string) {
  await tx.select({ eventId: currentEvent.eventId }).from(currentEvent).where(eq(currentEvent.singleton, 1)).for("update");
  const slot = await slotDetails(tx, id);
  if (!slot) return null;
  await tx.select({ id: tournamentMatch.id }).from(tournamentMatch).where(eq(tournamentMatch.id, id)).for("update");
  return slot;
}

export async function startMatch(id: string, firstServer: unknown, rightA: unknown, rightB: unknown): Promise<Failure | { ok: true }> {
  if (firstServer !== "A" && firstServer !== "B") return { error: "Choose the first serving Team", status: 400 };
  if (![0, 1].includes(rightA as number) || ![0, 1].includes(rightB as number)) return { error: "Choose each Team's right-court Player", status: 400 };
  return db.transaction(async (tx) => {
    const slot = await lockedSlot(tx, id);
    if (!slot) return { error: "Tournament Match not found in Current Event", status: 404 };
    if (slot.status !== "scheduled") return { error: "Match has already started", status: 409 };
    const players = await assignedPlayers(tx, id);
    if (players.length !== 4 || players.filter((person) => person.team === "A").length !== 2 || players.filter((person) => person.team === "B").length !== 2) return { error: "Assign two Players to each Team first", status: 409 };
    const game = rallyEngine.createGame({
      id: randomUUID(), type: "doubles", targetScore: slot.targetScore, firstServer,
      teamA: { name: "Team A", players: teamNames(players, "A"), startingRight: rightA },
      teamB: { name: "Team B", players: teamNames(players, "B"), startingRight: rightB },
    });
    await tx.insert(match).values({
      id: game.id, eventId: slot.eventId, tournamentMatchId: id, targetScore: slot.targetScore,
      firstServer, startingRightA: rightA as number, startingRightB: rightB as number,
      playedAt: new Date(game.startedAt), ...savedFields(game),
    });
    await tx.insert(matchPlayer).values(players.map((person) => ({ matchId: game.id, playerId: person.id, team: person.team, position: person.position })));
    await tx.update(tournamentMatch).set({ status: "in_progress" }).where(eq(tournamentMatch.id, id));
    return { ok: true };
  });
}

export async function changeMatch(id: string, action: "rally" | "undo" | "end", winner?: unknown): Promise<Failure | { ok: true }> {
  if (!["rally", "undo", "end"].includes(action)) return { error: "Unknown Match action", status: 400 };
  if (action === "rally" && winner !== "A" && winner !== "B") return { error: "Choose the Rally winner", status: 400 };
  return db.transaction(async (tx) => {
    const slot = await lockedSlot(tx, id);
    if (!slot) return { error: "Tournament Match not found in Current Event", status: 404 };
    const [record] = await tx.select().from(match).where(eq(match.tournamentMatchId, id)).for("update");
    if (!record) return { error: "Start Match first", status: 409 };
    if (record.status !== "active" && action !== "undo") return { error: "Match is already saved", status: 409 };
    const players = await assignedPlayers(tx, id);
    const game = gameFrom(record, players);
    if (action === "undo" && game.status === "completed" && rallyEngine.detectWinner(game) === null) return { error: "A saved Match cannot be undone", status: 409 };
    if (action === "rally") rallyEngine.recordRally(game, winner as Team, { eventId: randomUUID() });
    if (action === "undo" && !rallyEngine.undoRally(game)) return { error: "No Rally action to undo", status: 409 };
    if (action === "end") rallyEngine.endGameEarly(game);
    await tx.update(match).set(savedFields(game)).where(eq(match.id, record.id));
    await tx.update(tournamentMatch).set({ status: game.status === "completed" ? "completed" : "in_progress" }).where(eq(tournamentMatch.id, id));
    return { ok: true };
  });
}
