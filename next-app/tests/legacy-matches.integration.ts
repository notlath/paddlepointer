import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";

const url = process.env.MIGRATION_TEST_DATABASE_URL;
if (!url) {
  console.log("SKIP legacy match integration: set MIGRATION_TEST_DATABASE_URL");
} else {
  const suffix = crypto.randomUUID().replaceAll("-", "");
  const sourceId = `fixture_${suffix}`;
  const eventId = `legacy:event:${sourceId}`;
  const slotId = `legacy:match:${sourceId}:m1`;
  const matchId = `legacy:game:${sourceId}`;
  const ownerId = `fixture:visitor:${suffix}`;
  const playerIds = [1, 2, 3, 4].map((n) => `legacy:player:${sourceId}_${n}`);
  const directory = await mkdtemp(join(tmpdir(), "mtc-match-import-"));
  const snapshotPath = join(directory, "snapshot.json");
  const mapPath = join(directory, "visitor-map.json");
  const sql = postgres(url, { max: 1, prepare: false });
  let closeAppDb = async () => {};
  const engine = require("../../rally-engine.js");
  const game = engine.createGame({ id: sourceId, type: "doubles", now: "2025-01-01T00:00:00Z", targetScore: 3, firstServer: "A", teamA: { name: "Team A", players: ["Ada", "Bob"], startingRight: 0 }, teamB: { name: "Team B", players: ["Cal", "Dee"], startingRight: 0 } });
  for (let n = 1; n <= 3; n++) engine.recordRally(game, "A", { eventId: `r${n}`, now: `2025-01-01T00:0${n}:00Z` });
  const visitor = engine.createGame({ id: sourceId, type: "doubles", now: "2025-01-02T00:00:00Z", targetScore: 11, firstServer: "A", teamA: { name: "Team A", players: ["Vera", "Wes"], startingRight: 0 }, teamB: { name: "Team B", players: ["Xena", "Yuri"], startingRight: 0 } });
  engine.recordRally(visitor, "A", { eventId: "vr1", now: "2025-01-02T00:01:00Z" });
  const snapshot = {
    players: ["Ada", "Bob", "Cal", "Dee"].map((name, index) => ({ id: `${sourceId}_${index + 1}`, name, skill_level: null })),
    tournaments: [{ id: sourceId, name: "Fixture Event", court_count: 1, tournament_json: JSON.stringify({ playersText: "Ada,Bob,Cal,Dee", targetScore: 3, matchesPerPlayer: 3, transitionMinutes: 2 }) }],
    matches: [{ tournament_id: sourceId, id: "m1", round: 1, court: 1, status: "completed", team_a: JSON.stringify(["Ada", "Bob"]), team_b: JSON.stringify(["Cal", "Dee"]) }],
    currentEventId: sourceId,
    games: [
      { id: sourceId, match_scope: "tournament", tournament_id: sourceId, tournament_match_id: "m1", team_a_score: game.teamA.score, team_b_score: game.teamB.score, winner_team: game.winner, game_json: JSON.stringify(game) },
      { id: `${sourceId}_visitor`, match_scope: "visitor", created_by_role: "visitor", created_by_user_id: 7, team_a_score: visitor.teamA.score, team_b_score: visitor.teamB.score, winner_team: visitor.winner, game_json: JSON.stringify(visitor) },
    ],
    gamePlayers: ["Ada", "Bob", "Cal", "Dee"].map((name, index) => ({ game_id: sourceId, team: index < 2 ? "A" : "B", player_name: name, player_id: `${sourceId}_${index + 1}` })),
    legacyUsers: [{ id: 7, role: "visitor" }],
  };
  // The Visitor's source game ID is separate from the Tournament game ID.
  snapshot.games[1].game_json = JSON.stringify({ ...visitor, id: `${sourceId}_visitor` });
  const visitorTargetId = `legacy:visitor:${sourceId}_visitor`;
  try {
    await writeFile(snapshotPath, JSON.stringify(snapshot));
    await writeFile(mapPath, JSON.stringify({ 7: ownerId }));
    await sql`INSERT INTO "user" (id, name, email, email_verified, role, is_active) VALUES (${ownerId}, ${"Fixture Visitor"}, ${`fixture-${suffix}@example.test`}, true, ${"visitor"}, true)`;
    const run = (script: string, args: string[]) => JSON.parse(execFileSync("bun", [`scripts/${script}`, ...args], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url }, encoding: "utf8" }));
    assert.equal(run("import-legacy-structure.ts", [snapshotPath]).committed, true);
    for (let n = 0; n < 2; n++) {
      const report = run("import-legacy-matches.ts", [snapshotPath, mapPath]);
      assert.equal(report.committed, true);
      assert.deepEqual(report.importedCounts, { matches: 1, visitorMatches: 1, playerLinks: 4 });
    }
    const [stored] = await sql`SELECT event_id, tournament_match_id, score_a, score_b, status, winner, rally_log FROM "match" WHERE id = ${matchId}`;
    assert.equal(stored.event_id, eventId);
    assert.equal(stored.tournament_match_id, slotId);
    assert.deepEqual([stored.score_a, stored.score_b, stored.status, stored.winner], [3, 0, "completed", "A"]);
    const rallies = typeof stored.rally_log === "string" ? JSON.parse(stored.rally_log) : stored.rally_log;
    assert.deepEqual(rallies.map((r: { id: string }) => r.id), ["r1", "r2", "r3"]);
    const links = await sql`SELECT player_id FROM match_player WHERE match_id = ${matchId}`;
    assert.deepEqual(new Set(links.map((row) => row.player_id)), new Set(playerIds));
    const [privateMatch] = await sql`SELECT owner_id, status, game FROM visitor_match WHERE id = ${visitorTargetId}`;
    assert.equal(privateMatch.owner_id, ownerId);
    assert.equal(privateMatch.status, "active");
    const privateGame = typeof privateMatch.game === "string" ? JSON.parse(privateMatch.game) : privateMatch.game;
    assert.equal(privateGame.events[0].id, "vr1");
    process.env.DATABASE_URL = url;
    const { readVisitorMatch, readVisitorHistory } = await import("../src/server/visitor-matches");
    const { db: appDb } = await import("../src/server/auth");
    closeAppDb = () => appDb.$client.end();
    assert.equal((await readVisitorMatch(ownerId, visitorTargetId))?.id, visitorTargetId);
    assert.equal(await readVisitorMatch("someone-else", visitorTargetId), null);
    assert.equal((await readVisitorHistory("someone-else")).active.length, 0);
    assert.equal((await sql`SELECT count(*)::int AS count FROM "match" WHERE id = ${visitorTargetId}`)[0].count, 0);
  } finally {
    await closeAppDb();
    await sql`DELETE FROM visitor_match WHERE id = ${visitorTargetId}`;
    await sql`DELETE FROM match_player WHERE match_id = ${matchId}`;
    await sql`DELETE FROM "match" WHERE id = ${matchId}`;
    await sql`DELETE FROM tournament_match_player WHERE match_id = ${slotId}`;
    await sql`DELETE FROM tournament_match WHERE id = ${slotId}`;
    await sql`DELETE FROM tournament_round WHERE tournament_id = ${eventId}`;
    await sql`DELETE FROM tournament_player WHERE tournament_id = ${eventId}`;
    await sql`DELETE FROM tournament WHERE id = ${eventId}`;
    await sql`DELETE FROM event_revision WHERE event_id = ${eventId}`;
    await sql`DELETE FROM event WHERE id = ${eventId}`;
    for (const playerId of playerIds) await sql`DELETE FROM player WHERE id = ${playerId}`;
    await sql`DELETE FROM "user" WHERE id = ${ownerId}`;
    await sql.end();
    await rm(directory, { recursive: true, force: true });
  }
  console.log("Legacy match database integration passed");
}
