import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import postgres from "postgres";
import { planLegacyMatches } from "./legacy-matches";
import { planLegacyStructure } from "./legacy-structure";
import { digest, expectedQlikRows, normalizedRows, type Feed, type FullSnapshot } from "./reconciliation";
import { fixtureIds, rehearsalFixture } from "./rehearsal-fixture";

const args = process.argv.slice(2);
const option = (name: string) => { const index = args.indexOf(name); return index < 0 ? null : args[index + 1] ?? null; };
const fixture = args.includes("--fixture");
const verifyOnly = args.includes("--verify-only");
const reportPath = option("--report");
const sourcePath = option("--snapshot");
const visitorMapPath = option("--visitor-map");
const playerMapPath = option("--player-map");
const targetURL = verifyOnly ? process.env.CUTOVER_DATABASE_URL : process.env.MIGRATION_TEST_DATABASE_URL;
const guardToken = process.env.MIGRATION_TEST_GUARD_TOKEN;
if (!reportPath || !targetURL || fixture === Boolean(sourcePath)) {
  console.error("Usage: bun scripts/rehearse-migration.ts [--verify-only] (--fixture | --snapshot file [--visitor-map file] [--player-map file]) --report file; set MIGRATION_TEST_DATABASE_URL for rehearsal or CUTOVER_DATABASE_URL for read-only verification");
  process.exit(2);
}
const target = new URL(targetURL);
for (const key of verifyOnly ? [] : ["DATABASE_URL", "DIRECT_DATABASE_URL"]) {
  if (!process.env[key]) continue;
  const runtime = new URL(process.env[key]);
  if (target.hostname === runtime.hostname) throw new Error(`Refusing rehearsal: test database shares the ${key} host`);
}

const report: { version: number; sourceDigest: string | null; mode: string; importReports: Record<string, unknown>; checks: { name: string; expected: unknown; actual: unknown; passed: boolean }[]; reviewItems: string[]; failures: string[]; status: string; comparisonDigest: string | null } = {
  version: 1, sourceDigest: null, mode: `${verifyOnly ? "read-only verification" : "rehearsal"}: ${fixture ? "representative fixture" : "operator snapshot"}`, importReports: {}, checks: [], reviewItems: [], failures: [], status: "fail", comparisonDigest: null,
};
const check = (name: string, expected: unknown, actual: unknown) => {
  const passed = digest(expected) === digest(actual);
  report.checks.push({ name, expected, actual, passed });
  if (!passed) report.failures.push(name);
};
const sql = postgres(targetURL, { max: 1, prepare: false });
const directory = await mkdtemp(join(tmpdir(), "mtc-migration-rehearsal-"));
let closeAppDb = async () => {};
try {
  const snapshot = fixture ? rehearsalFixture() : JSON.parse(await readFile(sourcePath!, "utf8")) as FullSnapshot;
  if (!verifyOnly) {
    if (!guardToken) throw new Error("MIGRATION_TEST_GUARD_TOKEN is required before rehearsal writes");
    const [guardTable] = await sql`SELECT to_regclass(${"public.migration_rehearsal_guard"}) AS relation`;
    if (!guardTable.relation) throw new Error("Disposable database guard table is missing");
    const [guard] = await sql`SELECT token_hash FROM migration_rehearsal_guard WHERE singleton = 1`;
    if (!guard || guard.token_hash !== digest(guardToken)) throw new Error("Disposable database guard token does not match");
    check("disposable database guard", true, true);
  }
  const structure = planLegacyStructure(snapshot);
  const matches = planLegacyMatches(snapshot);
  report.sourceDigest = digest(snapshot);
  if (structure.rejected.length || structure.discrepancies.length || matches.rejected.length || matches.discrepancies.length) {
    report.failures.push(...structure.rejected, ...structure.discrepancies, ...matches.rejected, ...matches.discrepancies);
    throw new Error("Source snapshot has unresolved validation findings");
  }
  const snapshotFile = fixture ? join(directory, "fixture.json") : sourcePath!;
  if (fixture) await writeFile(snapshotFile, JSON.stringify(snapshot));
  const visitors = fixture ? { 7: fixtureIds.visitorUser } : visitorMapPath ? JSON.parse(await readFile(visitorMapPath, "utf8")) as Record<string, string> : {};
  const players = fixture ? { 8: fixtureIds.playerUser } : playerMapPath ? JSON.parse(await readFile(playerMapPath, "utf8")) as Record<string, string> : {};
  const visitorFile = join(directory, "visitors.json");
  await writeFile(visitorFile, JSON.stringify(visitors));
  if (fixture && !verifyOnly) {
    await sql`INSERT INTO "user" (id, name, email, email_verified, role, is_active) VALUES (${fixtureIds.visitorUser}, ${"Rehearsal Visitor"}, ${"rehearsal-visitor-v1@example.test"}, true, ${"visitor"}, true) ON CONFLICT DO NOTHING`;
    await sql`INSERT INTO "user" (id, name, email, email_verified, role, is_active) VALUES (${fixtureIds.playerUser}, ${"Rehearsal Player"}, ${"rehearsal-player-v1@example.test"}, true, ${"player"}, true) ON CONFLICT DO NOTHING`;
  }
  const runImport = (script: string, params: string[]) => {
    const result = spawnSync("bun", [`scripts/${script}`, ...params], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: targetURL }, encoding: "utf8" });
    const parsed = result.stdout ? JSON.parse(result.stdout) as Record<string, unknown> : { error: result.stderr || "Importer produced no report" };
    report.importReports[script] = parsed;
    if (result.status !== 0 || parsed.committed !== true) { report.failures.push(`${script} did not commit`); throw new Error(`${script} failed`); }
  };
  if (!verifyOnly) {
    runImport("import-legacy-structure.ts", [snapshotFile]);
    if (fixture) await sql`UPDATE "user" SET player_id = ${"legacy:player:1"} WHERE id = ${fixtureIds.playerUser} AND (player_id IS NULL OR player_id = ${"legacy:player:1"})`;
    runImport("import-legacy-matches.ts", [snapshotFile, visitorFile]);
  }

  const tables = {
    players: { table: "player", ids: structure.rows.players.map((row) => row.id) },
    events: { table: "event", ids: structure.rows.events.map((row) => row.id) },
    tournaments: { table: "tournament", ids: structure.rows.tournaments.map((row) => row.id) },
    rosters: { table: "tournament_player", ids: structure.rows.rosters.map((row) => `${row.tournament_id}/${row.player_id}`) },
    rounds: { table: "tournament_round", ids: structure.rows.rounds.map((row) => row.id) },
    slots: { table: "tournament_match", ids: structure.rows.matches.map((row) => row.id) },
    slotPlayers: { table: "tournament_match_player", ids: structure.rows.slots.map((row) => `${row.match_id}/${row.player_id}`) },
    matches: { table: "match", ids: matches.regular.map((row) => row.id) },
    matchPlayers: { table: "match_player", ids: matches.regular.flatMap((row) => row.players.map((p) => `${row.id}/${p.playerId}`)) },
    visitors: { table: "visitor_match", ids: matches.visitors.map((row) => row.id) },
  };
  for (const [name, spec] of Object.entries(tables)) {
    const rows = await sql.unsafe(`SELECT * FROM "${spec.table}"`);
    const actual = rows.map((row) => name === "rosters" ? `${row.tournament_id}/${row.player_id}` : name === "slotPlayers" || name === "matchPlayers" ? `${row.match_id}/${row.player_id}` : String(row.id)).filter((id) => spec.ids.includes(id));
    check(`${name} count`, spec.ids.length, actual.length);
    check(`${name} identities`, [...spec.ids].sort(), actual.sort());
  }
  const targetMatches = await sql`SELECT id, event_id, tournament_match_id, status, score_a, score_b, winner, rally_log FROM "match"`;
  for (const source of matches.regular) {
    const targetMatch = targetMatches.find((row) => row.id === source.id);
    const log = typeof targetMatch?.rally_log === "string" ? JSON.parse(targetMatch.rally_log) : targetMatch?.rally_log;
    check(`${source.id} score and references`, { eventId: source.eventId, slotId: source.tournamentMatchId, status: source.status, scoreA: source.scoreA, scoreB: source.scoreB, winner: source.winner }, targetMatch ? { eventId: targetMatch.event_id, slotId: targetMatch.tournament_match_id, status: targetMatch.status, scoreA: targetMatch.score_a, scoreB: targetMatch.score_b, winner: targetMatch.winner } : null);
    check(`${source.id} Rally order`, source.rallyLog, log ?? null);
  }
  const users = await sql`SELECT id, role, player_id, email_verified, is_active FROM "user"`;
  for (const legacy of snapshot.legacyUsers) {
    if (legacy.role === "player" && legacy.player_id != null) {
      const id = players[String(legacy.id)];
      const targetUser = users.find((row) => row.id === id);
      check(`Player account ${legacy.id}`, { id, role: "player", playerId: `legacy:player:${legacy.player_id}`, verified: true, active: true }, targetUser ? { id: targetUser.id, role: targetUser.role, playerId: targetUser.player_id, verified: targetUser.email_verified, active: targetUser.is_active } : null);
    }
  }
  const targetVisitors = await sql`SELECT id, owner_id, status, game FROM visitor_match`;
  process.env.DATABASE_URL = targetURL;
  const [{ readVisitorMatch }, { readQlikFeed }, { db: appDb }] = await Promise.all([import("../src/server/visitor-matches"), import("../src/server/qlik-feed"), import("../src/server/auth")]);
  closeAppDb = () => appDb.$client.end();
  for (const source of matches.visitors) {
    const row = targetVisitors.find((item) => item.id === source.id);
    const targetGame = typeof row?.game === "string" ? JSON.parse(row.game) : row?.game;
    check(`${source.id} Visitor ownership and history`, { ownerId: visitors[source.legacyOwnerId], status: source.status, game: source.game }, row ? { ownerId: row.owner_id, status: row.status, game: targetGame } : null);
    check(`${source.id} Visitor isolation`, { owner: source.id, other: null, regular: false }, { owner: (await readVisitorMatch(visitors[source.legacyOwnerId], source.id))?.id ?? null, other: await readVisitorMatch("unmapped-visitor", source.id), regular: targetMatches.some((item) => item.id === source.id) });
  }
  const feeds: Feed[] = ["get-events", "get-matches", "get-leaderboard-results", "get-leaderboard-players"];
  for (const tournament of snapshot.tournaments) for (const feed of feeds) {
    const sourceEventId = String(tournament.id);
    const targetEventId = `legacy:event:${sourceEventId}`;
    const expected = expectedQlikRows(snapshot, sourceEventId, feed);
    const result = await readQlikFeed(feed, targetEventId);
    if (result.status !== 200 || !result.body.rows) { report.failures.push(`${feed} ${sourceEventId}: HTTP ${result.status}`); continue; }
    const actual = result.body.rows;
    if (feed === "get-events") {
      const sourceCurrent = expected[0]?.isCurrent;
      const targetCurrent = actual[0]?.isCurrent;
      if (sourceCurrent !== targetCurrent) report.reviewItems.push(`Current Event differs for ${sourceEventId}; switch only at cutover`);
      for (const row of expected) delete row.isCurrent;
      for (const row of actual) delete row.isCurrent;
    }
    check(`Qlik ${feed} ${sourceEventId}`, { count: expected.length, digest: digest(normalizedRows(expected)) }, { count: actual.length, digest: digest(normalizedRows(actual)) });
  }
  report.status = report.failures.length ? "fail" : report.reviewItems.length ? "review" : "pass";
} catch (error) {
  if (!report.failures.length) report.failures.push(error instanceof Error ? error.message : String(error));
} finally {
  await closeAppDb();
  await sql.end();
  await rm(directory, { recursive: true, force: true });
  report.comparisonDigest = digest({ sourceDigest: report.sourceDigest, checks: report.checks, reviewItems: report.reviewItems, failures: report.failures });
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, failed: report.failures.length, reviewItems: report.reviewItems.length, comparisonDigest: report.comparisonDigest, report: reportPath }));
  if (report.failures.length) process.exitCode = 1;
}
