import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { planLegacyMatches, type MatchSnapshot } from "./legacy-matches";

const snapshotPath = process.argv[2];
const mapPath = process.argv[3];
if (!snapshotPath || !process.env.DATABASE_URL) {
  console.error("Usage: DATABASE_URL=... bun scripts/import-legacy-matches.ts <snapshot.json> [verified-visitor-map.json]");
  process.exit(2);
}

const same = (actual: unknown, expected: unknown, column: string) => actual == null || expected == null ? actual == null && expected == null : column.endsWith("_at") ? new Date(String(actual)).getTime() === new Date(String(expected)).getTime() : actual === expected;
const exists = async (tx: postgres.TransactionSql, table: string, id: string) => (await tx.unsafe(`SELECT 1 FROM "${table}" WHERE id = $1`, [id])).length === 1;

let client: ReturnType<typeof postgres> | null = null;
try {
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8")) as MatchSnapshot;
  if (!Array.isArray(snapshot.games) || !Array.isArray(snapshot.gamePlayers) || !Array.isArray(snapshot.legacyUsers)) throw new Error("Snapshot must contain games, gamePlayers, and legacyUsers arrays");
  const plan = planLegacyMatches(snapshot);
  const ownerMap = mapPath ? JSON.parse(await readFile(mapPath, "utf8")) as Record<string, string> : {};
  const report = { sourceCounts: plan.sourceCounts, plannedCounts: { matches: plan.regular.length, visitorMatches: plan.visitors.length, playerLinks: plan.regular.reduce((n, item) => n + item.players.length, 0) }, importedCounts: { matches: 0, visitorMatches: 0, playerLinks: 0 }, rejected: plan.rejected, discrepancies: plan.discrepancies, targetConflicts: [] as string[], committed: false };
  if (plan.visitors.length && !mapPath) report.discrepancies.push("Visitor ownership requires an explicit verified-visitor-map.json");
  for (const visitor of plan.visitors) if (!ownerMap[visitor.legacyOwnerId]) report.discrepancies.push(`Visitor owner ${visitor.legacyOwnerId} has no explicit target mapping`);
  if (report.rejected.length || report.discrepancies.length) {
    console.log(JSON.stringify(report, null, 2)); process.exitCode = 1;
  } else {
    client = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
    try {
      await client.begin(async (tx) => {
        for (const item of plan.regular) {
          if (item.eventId && !(await exists(tx, "event", item.eventId))) report.discrepancies.push(`${item.id}: Event missing from target`);
          if (item.tournamentMatchId) {
            const slots = await tx`SELECT tournament_id FROM tournament_match WHERE id = ${item.tournamentMatchId}`;
            if (slots.length !== 1 || slots[0].tournament_id !== item.eventId) report.discrepancies.push(`${item.id}: Tournament Match missing or belongs to another Event`);
          }
          for (const person of item.players) if (!(await exists(tx, "player", person.playerId))) report.discrepancies.push(`${item.id}: Player ${person.playerId} missing from target`);
          if (item.tournamentMatchId) {
            const assigned = await tx`SELECT player_id, team, position FROM tournament_match_player WHERE match_id = ${item.tournamentMatchId}`;
            if (assigned.length !== 4 || item.players.some((person) => !assigned.some((slot) => slot.player_id === person.playerId && slot.team === person.team && slot.position === person.position))) report.discrepancies.push(`${item.id}: Team membership differs from Tournament Match assignment`);
          }
        }
        for (const visitor of plan.visitors) {
          const [owner] = await tx`SELECT role, email_verified, is_active FROM "user" WHERE id = ${ownerMap[visitor.legacyOwnerId]}`;
          if (!owner || owner.role !== "visitor" || !owner.email_verified || !owner.is_active) report.discrepancies.push(`${visitor.id}: mapped target owner is not an active verified Visitor`);
        }
        if (report.discrepancies.length) throw new Error("Relationship discrepancies; transaction rolled back");
        for (const item of plan.regular) {
          const row: Record<string, unknown> = { id: item.id, event_id: item.eventId, tournament_match_id: item.tournamentMatchId, played_at: item.playedAt, status: item.status, target_score: item.targetScore, win_by_two: item.winByTwo, first_server: item.firstServer, starting_right_a: item.startingRightA, starting_right_b: item.startingRightB, score_a: item.scoreA, score_b: item.scoreB, serving_team: item.servingTeam, server_number: item.serverNumber, server_index: item.serverIndex, right_a: item.rightA, right_b: item.rightB, side_outs: item.sideOuts, winner: item.winner, ended_early: item.endedEarly, retired_team: item.retiredTeam, rally_log: item.rallyLog, ended_at: item.endedAt };
          const inserted = await tx`INSERT INTO "match" (id, event_id, tournament_match_id, played_at, status, target_score, win_by_two, first_server, starting_right_a, starting_right_b, score_a, score_b, serving_team, server_number, server_index, right_a, right_b, side_outs, winner, ended_early, retired_team, rally_log, ended_at)
            VALUES (${item.id}, ${item.eventId}, ${item.tournamentMatchId}, ${item.playedAt}, ${item.status}, ${item.targetScore}, ${item.winByTwo}, ${item.firstServer}, ${item.startingRightA}, ${item.startingRightB}, ${item.scoreA}, ${item.scoreB}, ${item.servingTeam}, ${item.serverNumber}, ${item.serverIndex}, ${item.rightA}, ${item.rightB}, ${item.sideOuts}, ${item.winner}, ${item.endedEarly}, ${item.retiredTeam}, ${JSON.stringify(item.rallyLog)}::jsonb, ${item.endedAt}) ON CONFLICT DO NOTHING RETURNING 1`;
          if (!inserted.length) {
            const [existing] = await tx`SELECT * FROM "match" WHERE id = ${item.id}`;
            if (!existing) report.targetConflicts.push(`match ${item.id}: id occupied by another record`);
            else {
              const [rallyComparison] = await tx`SELECT rally_log = ${JSON.stringify(item.rallyLog)}::jsonb AS equal FROM "match" WHERE id = ${item.id}`;
              for (const column of Object.keys(row)) if (column === "rally_log" ? !rallyComparison.equal : !same(existing[column], row[column], column)) report.targetConflicts.push(`match ${item.id}: ${column} differs`);
            }
          }
          for (const person of item.players) {
            const link = await tx`INSERT INTO match_player (match_id, player_id, team, position) VALUES (${item.id}, ${person.playerId}, ${person.team}, ${person.position}) ON CONFLICT DO NOTHING RETURNING 1`;
            if (!link.length) {
              const [existing] = await tx`SELECT team, position FROM match_player WHERE match_id = ${item.id} AND player_id = ${person.playerId}`;
              if (!existing || existing.team !== person.team || existing.position !== person.position) report.targetConflicts.push(`match_player ${item.id}/${person.playerId}`);
            }
          }
        }
        for (const item of plan.visitors) {
          const ownerId = ownerMap[item.legacyOwnerId];
          const inserted = await tx`INSERT INTO visitor_match (id, owner_id, game, status, played_at, ended_at) VALUES (${item.id}, ${ownerId}, ${JSON.stringify(item.game)}::jsonb, ${item.status}, ${item.playedAt}, ${item.endedAt}) ON CONFLICT DO NOTHING RETURNING 1`;
          if (!inserted.length) {
            const [existing] = await tx`SELECT owner_id, game, status, played_at, ended_at FROM visitor_match WHERE id = ${item.id}`;
            const [gameComparison] = await tx`SELECT game = ${JSON.stringify(item.game)}::jsonb AS equal FROM visitor_match WHERE id = ${item.id}`;
            if (!existing) report.targetConflicts.push(`visitor_match ${item.id}: id occupied`);
            else {
              if (existing.owner_id !== ownerId) report.targetConflicts.push(`visitor_match ${item.id}: owner_id differs`);
              if (!gameComparison.equal) report.targetConflicts.push(`visitor_match ${item.id}: game differs`);
              if (existing.status !== item.status) report.targetConflicts.push(`visitor_match ${item.id}: status differs`);
              if (!same(existing.played_at, item.playedAt, "played_at")) report.targetConflicts.push(`visitor_match ${item.id}: played_at differs`);
              if (!same(existing.ended_at, item.endedAt, "ended_at")) report.targetConflicts.push(`visitor_match ${item.id}: ended_at differs`);
            }
          }
        }
        if (report.targetConflicts.length) throw new Error("Target conflicts; transaction rolled back");
      });
      report.committed = true;
      report.importedCounts = report.plannedCounts;
    } catch (error) {
      if (!report.discrepancies.length && !report.targetConflicts.length) throw error;
      process.exitCode = 1;
    }
    console.log(JSON.stringify(report, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
} finally {
  if (client) await client.end();
}
