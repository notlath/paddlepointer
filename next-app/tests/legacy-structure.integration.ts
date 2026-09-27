import { strict as assert } from "node:assert";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import postgres from "postgres";

// Run only against a disposable, migrated PostgreSQL database.
const url = process.env.MIGRATION_TEST_DATABASE_URL;
if (!url) {
  console.log("SKIP legacy structure integration: set MIGRATION_TEST_DATABASE_URL");
} else {
  const sourceId = `fixture_${crypto.randomUUID().replaceAll("-", "")}`;
  const playerId = `legacy:player:${sourceId}`;
  const eventId = `legacy:event:${sourceId}`;
  const tournamentId = eventId;
  const roundId = `legacy:round:${sourceId}:1`;
  const matchId = `legacy:match:${sourceId}:m1`;
  const directory = await mkdtemp(join(tmpdir(), "mtc-legacy-import-"));
  const snapshotPath = join(directory, "snapshot.json");
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    await writeFile(snapshotPath, JSON.stringify({
      players: [{ id: sourceId, name: `Fixture ${sourceId}`, skill_level: "advanced", created_at: "2025-01-01T00:00:00Z" }],
      tournaments: [{ id: sourceId, name: `Fixture Event ${sourceId}`, court_count: 1, tournament_json: JSON.stringify({ playersText: `Fixture ${sourceId}`, targetScore: 11, matchesPerPlayer: 3, transitionMinutes: 2 }), updated_at: "2025-01-01T00:00:00Z" }],
      matches: [{ tournament_id: sourceId, id: "m1", round: 1, court: 1, status: "scheduled", team_a: JSON.stringify([`Fixture ${sourceId}`]), team_b: JSON.stringify([]) }],
      currentEventId: sourceId,
    }));
    for (let pass = 0; pass < 2; pass++) {
      const output = execFileSync("bun", ["scripts/import-legacy-structure.ts", snapshotPath], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url }, encoding: "utf8" });
      const report = JSON.parse(output);
      assert.equal(report.committed, true);
      assert.equal(report.importedCounts.matches, 1);
    }
    const links = await sql`SELECT p.id AS player_id, t.event_id, r.id AS round_id, m.id AS match_id, m.court, s.player_id AS slot_player_id FROM tournament_match_player s JOIN player p ON p.id = s.player_id JOIN tournament_match m ON m.id = s.match_id JOIN tournament_round r ON r.id = m.round_id JOIN tournament t ON t.id = m.tournament_id WHERE m.id = ${matchId}`;
    assert.equal(links.length, 1);
    assert.deepEqual({ ...links[0] }, { player_id: playerId, event_id: eventId, round_id: roundId, match_id: matchId, court: 1, slot_player_id: playerId });
    assert.equal((await sql`SELECT count(*)::int AS count FROM event WHERE id = ${eventId}`)[0].count, 1);
  } finally {
    await sql`DELETE FROM tournament_match_player WHERE match_id = ${matchId}`;
    await sql`DELETE FROM tournament_match WHERE id = ${matchId}`;
    await sql`DELETE FROM tournament_round WHERE id = ${roundId}`;
    await sql`DELETE FROM tournament_player WHERE tournament_id = ${tournamentId}`;
    await sql`DELETE FROM tournament WHERE id = ${tournamentId}`;
    await sql`DELETE FROM event_revision WHERE event_id = ${eventId}`;
    await sql`DELETE FROM event WHERE id = ${eventId}`;
    await sql`DELETE FROM player WHERE id = ${playerId}`;
    await sql.end();
    await rm(directory, { recursive: true, force: true });
  }
  console.log("Legacy structure database integration passed");
}
