export type MatchSnapshot = {
  games: Record<string, unknown>[];
  gamePlayers: Record<string, unknown>[];
  legacyUsers: Record<string, unknown>[];
};

export type PlannedMatch = {
  id: string; eventId: string | null; tournamentMatchId: string | null;
  playedAt: string; endedAt: string | null; status: "active" | "completed";
  targetScore: number; winByTwo: boolean; firstServer: "A" | "B";
  startingRightA: number; startingRightB: number; scoreA: number; scoreB: number;
  servingTeam: "A" | "B"; serverNumber: number; serverIndex: number;
  rightA: number; rightB: number; sideOuts: number; winner: "A" | "B" | null;
  endedEarly: boolean; retiredTeam: "A" | "B" | null;
  rallyLog: Record<string, unknown>[];
  players: { playerId: string; team: "A" | "B"; position: number }[];
};
export type PlannedVisitor = { id: string; legacyOwnerId: string; game: Record<string, unknown>; status: "active" | "completed"; playedAt: string; endedAt: string | null };
export type MatchPlan = { regular: PlannedMatch[]; visitors: PlannedVisitor[]; rejected: string[]; discrepancies: string[]; sourceCounts: { games: number; gamePlayers: number; visitorGames: number } };

const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const decode = (value: unknown) => { try { return object(typeof value === "string" ? JSON.parse(value) : value); } catch { return null; } };
const text = (value: unknown) => String(value ?? "").trim();
const team = (value: unknown): "A" | "B" | null => value === "A" || value === "B" ? value : null;
const int = (value: unknown, min: number, max: number): number | null => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;
const time = (value: unknown): string | null => typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const nameKey = (value: unknown) => text(value).replace(/\s+/g, " ").toLocaleLowerCase();
const validRallies = (events: unknown, playedAt: string, scoreA: number, scoreB: number): events is Record<string, unknown>[] => {
  if (!Array.isArray(events) || events.length > 5000) return false;
  let previous = Date.parse(playedAt);
  let previousScore = { A: 0, B: 0 };
  const ids = new Set<string>();
  for (const value of events) {
    const event = object(value);
    const at = time(event?.createdAt);
    const eventId = text(event?.id);
    if (!event || !at || !eventId || ids.has(eventId) || Date.parse(at) < previous) return false;
    ids.add(eventId); previous = Date.parse(at);
    const before = object(event.scoreBefore);
    const after = object(event.scoreAfter);
    if (!before || !after || before.A !== previousScore.A || before.B !== previousScore.B || int(after.A, 0, 999) === null || int(after.B, 0, 999) === null) return false;
    previousScore = { A: after.A as number, B: after.B as number };
  }
  if (events.length) {
    const final = object(events.at(-1).scoreAfter)!;
    if (final.A !== scoreA || final.B !== scoreB) return false;
  }
  return true;
};

export function planLegacyMatches(snapshot: MatchSnapshot): MatchPlan {
  const regular: PlannedMatch[] = [];
  const visitors: PlannedVisitor[] = [];
  const rejected: string[] = [];
  const discrepancies: string[] = [];
  const playersByGame = new Map<string, Record<string, unknown>[]>();
  const sourceGameIds = new Set(snapshot.games.map((row) => text(row.id)));
  for (const row of snapshot.gamePlayers) {
    const gameId = text(row.game_id);
    if (!sourceGameIds.has(gameId) || (row.team !== "A" && row.team !== "B")) { discrepancies.push(`game_players ${gameId}: missing Game or invalid Team`); rejected.push(`game_players ${gameId}: orphan or invalid Team`); continue; }
    playersByGame.set(gameId, [...(playersByGame.get(gameId) ?? []), row]);
  }
  const visitorUsers = new Set(snapshot.legacyUsers.filter((row) => row.role === "visitor").map((row) => text(row.id)));
  const seen = new Set<string>();
  let visitorGames = 0;
  for (const source of snapshot.games) {
    const sourceId = text(source.id);
    const game = decode(source.game_json);
    const scope = text(source.match_scope) === "visitor" || source.created_by_role === "visitor" ? "visitor" : "regular";
    if (scope === "visitor") visitorGames++;
    const label = `game ${sourceId || "<missing id>"}`;
    if (!sourceId || seen.has(sourceId) || !game) { rejected.push(`${label}: invalid or duplicate id/JSON`); continue; }
    seen.add(sourceId);
    const a = object(game.teamA); const b = object(game.teamB);
    const scores = [int(a?.score, 0, 999), int(b?.score, 0, 999)];
    const playedAt = time(game.startedAt) ?? time(source.started_at);
    const endedAt = game.endedAt == null ? null : time(game.endedAt);
    const status = game.status === "in_progress" ? "active" : game.status;
    const winner = game.winner == null ? null : team(game.winner);
    const events = game.events;
    if (!a || !b || scores.includes(null) || !playedAt || (game.endedAt != null && !endedAt) || (status !== "active" && status !== "completed") || (status === "completed" && (!endedAt || !winner)) || (status === "active" && (endedAt || winner)) || (game.winner != null && !winner) || !validRallies(events, playedAt, scores[0]!, scores[1]!)) {
      rejected.push(`${label}: invalid score, status, time, or Rally order/state`); continue;
    }
    if (Number(source.team_a_score) !== scores[0] || Number(source.team_b_score) !== scores[1] || (source.winner_team ?? null) !== winner) {
      discrepancies.push(`${label}: relational scores/winner differ from game JSON`); rejected.push(`${label}: score discrepancy`); continue;
    }
    if (scope === "visitor") {
      const owner = text(source.created_by_user_id);
      if (!owner || !visitorUsers.has(owner)) { discrepancies.push(`${label}: Visitor owner is missing or not a Visitor`); rejected.push(`${label}: unsafe Visitor identity`); continue; }
      const namesA = a.players, namesB = b.players;
      if (!Array.isArray(namesA) || !Array.isArray(namesB) || namesA.length !== 2 || namesB.length !== 2 || [...namesA, ...namesB].some((name) => !nameKey(name))) { rejected.push(`${label}: invalid Visitor Teams`); continue; }
      const sourceNames = playersByGame.get(sourceId) ?? [];
      if (sourceNames.length && (sourceNames.length !== 4 || (["A", "B"] as const).some((side) => {
        const expected = side === "A" ? namesA : namesB;
        const actual = sourceNames.filter((row) => row.team === side).map((row) => nameKey(row.player_name));
        return expected.some((name, index) => nameKey(name) !== actual[index]);
      }))) { discrepancies.push(`${label}: Visitor Team names disagree with game_players`); rejected.push(`${label}: Visitor Team discrepancy`); continue; }
      visitors.push({ id: `legacy:visitor:${sourceId}`, legacyOwnerId: owner, game: { ...game, id: `legacy:visitor:${sourceId}`, status, startedAt: playedAt, endedAt }, status, playedAt, endedAt });
      continue;
    }
    const eventSourceId = text(source.tournament_id);
    const slotSourceId = text(source.tournament_match_id);
    if (slotSourceId && !eventSourceId) { discrepancies.push(`${label}: Tournament Match has no Event`); rejected.push(`${label}: broken Tournament relationship`); continue; }
    const memberships = playersByGame.get(sourceId) ?? [];
    const members: PlannedMatch["players"] = [];
    for (const side of ["A", "B"] as const) {
      const sideRows = memberships.filter((row) => row.team === side);
      if (sideRows.length !== 2) break;
      for (const [index, row] of sideRows.entries()) {
        const playerId = text(row.player_id);
        if (!playerId) break;
        members.push({ playerId: `legacy:player:${playerId}`, team: side, position: index + 1 });
      }
    }
    if (memberships.length !== 4 || members.length !== 4 || new Set(members.map((item) => item.playerId)).size !== 4) { discrepancies.push(`${label}: exactly four linked Player identities required`); rejected.push(`${label}: unresolved Team membership`); continue; }
    const namesMatch = (["A", "B"] as const).every((side) => {
      const expected = side === "A" ? a.players : b.players;
      const actual = memberships.filter((row) => row.team === side).map((row) => nameKey(row.player_name));
      return Array.isArray(expected) && expected.length === 2 && expected.every((name, index) => nameKey(name) === actual[index]);
    });
    if (!namesMatch) { discrepancies.push(`${label}: Team names disagree with game_players`); rejected.push(`${label}: Team identity discrepancy`); continue; }
    const startA = int(a.startingRight, 0, 1); const startB = int(b.startingRight, 0, 1);
    const rightA = int(object(a.positions)?.right, 0, 1); const rightB = int(object(b.positions)?.right, 0, 1);
    const firstServer = team(game.firstServer); const servingTeam = team(game.servingTeam);
    const serverNumber = int(game.serverNumber, 1, 2); const serverIndex = int(game.currentServerIndex, 0, 1);
    const targetScore = int(game.targetScore, 1, 99); const sideOuts = int(game.sideOuts, 0, 999999);
    const retiredTeam = game.retiredTeam == null ? null : team(game.retiredTeam);
    if (startA === null || startB === null || rightA === null || rightB === null || !firstServer || !servingTeam || serverNumber === null || serverIndex === null || targetScore === null || sideOuts === null || (game.retiredTeam != null && !retiredTeam) || typeof game.winByTwo !== "boolean" || typeof game.endedEarly !== "boolean") { rejected.push(`${label}: invalid scoring state`); continue; }
    regular.push({ id: `legacy:game:${sourceId}`, eventId: eventSourceId ? `legacy:event:${eventSourceId}` : null, tournamentMatchId: slotSourceId ? `legacy:match:${eventSourceId}:${slotSourceId}` : null, playedAt, endedAt, status, targetScore, winByTwo: game.winByTwo, firstServer, startingRightA: startA, startingRightB: startB, scoreA: scores[0]!, scoreB: scores[1]!, servingTeam, serverNumber, serverIndex, rightA, rightB, sideOuts, winner, endedEarly: game.endedEarly, retiredTeam, rallyLog: events, players: members });
  }
  return { regular, visitors, rejected, discrepancies, sourceCounts: { games: snapshot.games.length, gamePlayers: snapshot.gamePlayers.length, visitorGames } };
}
