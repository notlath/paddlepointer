import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { planLegacyStructure, type ImportRow, type LegacySnapshot } from "./legacy-structure";

const file = process.argv[2];
if (!file || !process.env.DATABASE_URL) {
  console.error("Usage: DATABASE_URL=... bun scripts/import-legacy-structure.ts <snapshot.json>");
  process.exit(2);
}

const tables = [
  { key: "players", table: "player", columns: ["id", "name", "skill_level", "created_at"] },
  { key: "events", table: "event", columns: ["id", "name", "created_at"] },
  { key: "tournaments", table: "tournament", columns: ["id", "event_id", "courts", "matches_per_player", "target_score", "transition_minutes"] },
  { key: "rosters", table: "tournament_player", columns: ["tournament_id", "player_id", "available"] },
  { key: "rounds", table: "tournament_round", columns: ["id", "tournament_id", "number"] },
  { key: "matches", table: "tournament_match", columns: ["id", "tournament_id", "round_id", "court", "status"] },
  { key: "slots", table: "tournament_match_player", columns: ["match_id", "round_id", "player_id", "team", "position"] },
] as const;

let client: ReturnType<typeof postgres> | null = null;
try {
  const snapshot = JSON.parse(await readFile(file, "utf8")) as LegacySnapshot;
  if (!Array.isArray(snapshot.players) || !Array.isArray(snapshot.tournaments) || !Array.isArray(snapshot.matches)) throw new Error("Snapshot must contain players, tournaments, and matches arrays");
  const plan = planLegacyStructure(snapshot);
  const report = { sourceCounts: plan.sourceCounts, plannedCounts: Object.fromEntries(Object.entries(plan.rows).map(([key, value]) => [key, value.length])), importedCounts: Object.fromEntries(Object.keys(plan.rows).map((key) => [key, 0])), rejected: plan.rejected, relationshipDiscrepancies: plan.discrepancies, targetConflicts: [] as string[], committed: false };
  if (plan.rejected.length || plan.discrepancies.length) {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  } else {
    client = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
    try { await client.begin(async (tx) => {
      for (const spec of tables) {
        for (const row of plan.rows[spec.key] as ImportRow[]) {
          const values = spec.columns.map((column) => row[column] ?? null);
          const inserted = await tx.unsafe(`INSERT INTO "${spec.table}" (${spec.columns.map((c) => `"${c}"`).join(",")}) VALUES (${values.map((_, i) => `$${i + 1}`).join(",")}) ON CONFLICT DO NOTHING RETURNING 1`, values);
          if (inserted.length) continue;
          const predicate = spec.table === "tournament_player" ? '"tournament_id" = $1 AND "player_id" = $2' : spec.table === "tournament_match_player" ? '"match_id" = $1 AND "player_id" = $2' : '"id" = $1';
          const keys = spec.table === "tournament_player" ? [row.tournament_id, row.player_id] : spec.table === "tournament_match_player" ? [row.match_id, row.player_id] : [row.id];
          const existing = await tx.unsafe(`SELECT ${spec.columns.map((c) => `"${c}"`).join(",")} FROM "${spec.table}" WHERE ${predicate}`, keys);
          if (existing.length !== 1 || spec.columns.some((column) => {
            const actual = existing[0][column];
            const expected = row[column] ?? null;
            if (column === "created_at") return expected !== null && new Date(actual).getTime() !== new Date(String(expected)).getTime();
            return actual !== expected;
          })) report.targetConflicts.push(`${spec.table} ${row.id}`);
        }
      }
      if (report.targetConflicts.length) throw new Error("Target conflicts; transaction rolled back");
    });
    report.committed = true;
    report.importedCounts = report.plannedCounts;
    } catch (error) {
      if (!report.targetConflicts.length) throw error;
      process.exitCode = 1;
    }
    console.log(JSON.stringify(report, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (client) await client.end();
}
