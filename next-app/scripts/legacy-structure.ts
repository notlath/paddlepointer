export type LegacySnapshot = {
  players: Record<string, unknown>[];
  tournaments: Record<string, unknown>[];
  matches: Record<string, unknown>[];
  currentEventId: string | null;
};

export type ImportRow = { id: string; [key: string]: string | number | boolean | null };
export type ImportPlan = {
  rows: { players: ImportRow[]; events: ImportRow[]; tournaments: ImportRow[]; rosters: ImportRow[]; rounds: ImportRow[]; matches: ImportRow[]; slots: ImportRow[] };
  sourceCounts: Record<string, number>;
  rejected: string[];
  discrepancies: string[];
  currentEventId: string | null;
};

const id = (value: unknown) => String(value ?? "").trim();
const nameKey = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
const positive = (value: unknown, fallback: number, max: number) => {
  const n = Number(value ?? fallback);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
};
const parse = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return null; }
};
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const teamNames = (value: unknown): string[] | null => {
  if (value === null || value === "") return [];
  const decoded = parse(value);
  const values = Array.isArray(decoded) ? decoded : record(decoded)?.players ?? (record(decoded)?.name ? [record(decoded)?.name] : null);
  if (!Array.isArray(values) || values.some((item) => typeof item !== "string")) return null;
  return values.map((item) => item.trim());
};

export function planLegacyStructure(snapshot: LegacySnapshot): ImportPlan {
  const rows: ImportPlan["rows"] = { players: [], events: [], tournaments: [], rosters: [], rounds: [], matches: [], slots: [] };
  const rejected: string[] = [];
  const discrepancies: string[] = [];
  const sourceCounts = { players: snapshot.players.length, tournaments: snapshot.tournaments.length, matches: snapshot.matches.length };
  const playersByName = new Map<string, string>();
  const seen = new Set<string>();
  for (const source of snapshot.players) {
    const sourceId = id(source.id);
    const playerName = typeof source.name === "string" ? source.name.trim().replace(/\s+/g, " ") : "";
    const key = nameKey(playerName);
    const skill = source.skill_level == null || source.skill_level === "" ? null : String(source.skill_level).toLowerCase();
    if (!sourceId || !playerName || playerName.length > 120 || ![null, "beginner", "intermediate", "advanced"].includes(skill) || seen.has(`player:${sourceId}`) || playersByName.has(key)) {
      rejected.push(`player ${sourceId || "<missing id>"}: invalid or duplicate identity/skill`); continue;
    }
    seen.add(`player:${sourceId}`);
    const playerId = `legacy:player:${sourceId}`;
    playersByName.set(key, playerId);
    rows.players.push({ id: playerId, name: playerName, skill_level: skill, created_at: source.created_at == null ? "1970-01-01T00:00:00Z" : String(source.created_at) });
  }
  const tournamentIds = new Set<string>();
  const courtCounts = new Map<string, number>();
  for (const source of snapshot.tournaments) {
    const sourceId = id(source.id);
    const eventId = `legacy:event:${sourceId}`;
    const data = record(parse(source.tournament_json));
    const eventName = typeof source.name === "string" ? source.name.trim() : "";
    const courts = positive(source.court_count, 1, 16);
    const matchesPerPlayer = positive(data?.matchesPerPlayer, 3, 30);
    const targetScore = positive(data?.targetScore, 11, 99);
    const transition = Number(data?.transitionMinutes ?? 3);
    if (!sourceId || !eventName || !data || !courts || !matchesPerPlayer || !targetScore || !Number.isInteger(transition) || transition < 0 || transition > 20 || tournamentIds.has(sourceId)) {
      rejected.push(`tournament ${sourceId || "<missing id>"}: invalid id, name, configuration, or JSON`); continue;
    }
    tournamentIds.add(sourceId);
    courtCounts.set(sourceId, courts);
    rows.events.push({ id: eventId, name: eventName, created_at: source.updated_at == null ? "1970-01-01T00:00:00Z" : String(source.updated_at) });
    rows.tournaments.push({ id: eventId, event_id: eventId, courts, matches_per_player: matchesPerPlayer, target_score: targetScore, transition_minutes: transition });
    if (typeof data.playersText !== "string") rejected.push(`tournament ${sourceId}: playersText is missing or invalid`);
    const roster = typeof data.playersText === "string" ? data.playersText.split(/[\n,]+/).map((n) => n.trim()).filter(Boolean) : [];
    for (const rosterName of new Set(roster.map(nameKey))) {
      const playerId = playersByName.get(rosterName);
      if (!playerId) { discrepancies.push(`tournament ${sourceId}: roster player ${rosterName} has no Player`); continue; }
      rows.rosters.push({ id: `${sourceId}:${playerId}`, tournament_id: eventId, player_id: playerId, available: true });
    }
  }
  const rounds = new Set<string>();
  const occupied = new Set<string>();
  const roundPlayers = new Set<string>();
  for (const source of snapshot.matches) {
    const tournamentId = id(source.tournament_id);
    const matchId = id(source.id);
    const round = positive(source.round, 1, 1000000);
    const court = positive(source.court, 1, 16);
    const status = id(source.status);
    const a = teamNames(source.team_a);
    const b = teamNames(source.team_b);
    const key = `${tournamentId}:${round}:${court}`;
    const names = [...(a ?? []), ...(b ?? [])];
    if (!tournamentIds.has(tournamentId) || !matchId || !round || !court || court > (courtCounts.get(tournamentId) ?? 0) || !["scheduled", "in_progress", "completed"].includes(status) || !a || !b || a.length > 2 || b.length > 2 || occupied.has(key) || seen.has(`match:${tournamentId}:${matchId}`)) {
      rejected.push(`match ${tournamentId}/${matchId}: invalid relationship, schedule, teams, or duplicate`); continue;
    }
    const missing = names.find((n) => !playersByName.has(nameKey(n)));
    if (missing) { discrepancies.push(`match ${tournamentId}/${matchId}: player ${missing} has no Player`); rejected.push(`match ${tournamentId}/${matchId}: unresolved player`); continue; }
    const roundId = `legacy:round:${tournamentId}:${round}`;
    const playerIds = names.map((n) => playersByName.get(nameKey(n))!);
    if (new Set(playerIds).size !== playerIds.length || playerIds.some((p) => roundPlayers.has(`${roundId}:${p}`))) {
      rejected.push(`match ${tournamentId}/${matchId}: player repeated in match or round`); continue;
    }
    occupied.add(key); seen.add(`match:${tournamentId}:${matchId}`);
    if (!rounds.has(roundId)) { rounds.add(roundId); rows.rounds.push({ id: roundId, tournament_id: `legacy:event:${tournamentId}`, number: round }); }
    const targetId = `legacy:match:${tournamentId}:${matchId}`;
    rows.matches.push({ id: targetId, tournament_id: `legacy:event:${tournamentId}`, round_id: roundId, court, status });
    for (const [team, members] of [["A", a], ["B", b]] as const) {
      members.forEach((member, index) => {
        const playerId = playersByName.get(nameKey(member))!;
        roundPlayers.add(`${roundId}:${playerId}`);
        rows.slots.push({ id: `${targetId}:${playerId}`, match_id: targetId, round_id: roundId, player_id: playerId, team, position: index + 1 });
      });
    }
  }
  const currentEventId = snapshot.currentEventId && tournamentIds.has(snapshot.currentEventId) ? `legacy:event:${snapshot.currentEventId}` : null;
  if (snapshot.currentEventId && snapshot.currentEventId !== "open_play" && !currentEventId) discrepancies.push(`current Event ${snapshot.currentEventId} has no Tournament`);
  return { rows, sourceCounts, rejected, discrepancies, currentEventId };
}
