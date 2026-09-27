import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import postgres from "postgres";

const databaseURL = process.env.DATABASE_URL;
const analyticsKey = process.env.ANALYTICS_KEY;
test.skip(!databaseURL || !databaseURL.includes("127.0.0.1") || !analyticsKey, "Requires a disposable local database and analytics key");
const sql = databaseURL ? postgres(databaseURL, { prepare: false }) : null;

async function account(role: "admin" | "player") {
  const id = randomUUID();
  const username = `qlik_${id.replaceAll("-", "").slice(0, 18)}`;
  const password = `Test-${randomUUID()}!`;
  await sql!`insert into "user" (id, name, email, email_verified, username, role) values (${id}, 'Qlik Test', ${`${id}@example.com`}, true, ${username}, ${role})`;
  await sql!`insert into account (id, account_id, provider_id, user_id, password, updated_at) values (${randomUUID()}, ${id}, 'credential', ${id}, ${await hashPassword(password)}, now())`;
  return { username, password };
}

async function signIn(page: import("@playwright/test").Page, credentials: Awaited<ReturnType<typeof account>>) {
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(credentials.username);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
}

test("Qlik feeds keep their read-only shapes and staff-only token boundary", async ({ page, browser, request }) => {
  const eventId = randomUUID();
  const roundId = randomUUID();
  const nextRoundId = randomUUID();
  const activeRoundId = randomUUID();
  const finishedSlot = randomUUID();
  const scheduledSlot = randomUUID();
  const activeSlot = randomUUID();
  const gameId = randomUUID();
  const activeGameId = randomUUID();
  const standaloneId = randomUUID();
  const names = ["Ana", "Ben", "Cid", "Dee"].map((name) => `${name} ${eventId.slice(0, 5)}`);
  await sql!`insert into event (id, name) values (${eventId}, 'Qlik Contract Event')`;
  await sql!`insert into tournament (id, event_id, courts) values (${eventId}, ${eventId}, 2)`;
  await sql!`insert into current_event (singleton, event_id) values (1, ${eventId}) on conflict (singleton) do update set event_id = excluded.event_id`;
  await sql!`insert into tournament_round (id, tournament_id, number) values (${roundId}, ${eventId}, 1), (${nextRoundId}, ${eventId}, 2), (${activeRoundId}, ${eventId}, 3)`;
  await sql!`insert into tournament_match (id, tournament_id, round_id, court, status) values (${finishedSlot}, ${eventId}, ${roundId}, 1, 'completed'), (${scheduledSlot}, ${eventId}, ${nextRoundId}, 2, 'scheduled'), (${activeSlot}, ${eventId}, ${activeRoundId}, 1, 'in_progress')`;
  await sql!`insert into "match" (id, event_id, tournament_match_id, played_at, ended_at, status, score_a, score_b, winner, rally_log) values (${gameId}, ${eventId}, ${finishedSlot}, '2026-09-13T09:00:00Z', '2026-09-13T09:20:00Z', 'completed', 11, 7, 'A', ${sql!.json([{ action: "point", rallyWinner: "A" }, { action: "side-out", rallyWinner: "B" }, { action: "point", rallyWinner: "A" }])})`;
  await sql!`insert into "match" (id, event_id, tournament_match_id, played_at, status, score_a, score_b) values (${activeGameId}, ${eventId}, ${activeSlot}, '2026-09-13T10:00:00Z', 'active', 5, 3)`;
  await sql!`insert into "match" (id, played_at, ended_at, status, score_a, score_b, winner) values (${standaloneId}, '2026-09-14T10:00:00Z', '2026-09-14T10:20:00Z', 'completed', 7, 11, 'B')`;
  for (let index = 0; index < names.length; index++) {
    const id = randomUUID();
    const team = index < 2 ? "A" : "B";
    const position = index % 2 + 1;
    await sql!`insert into player (id, name) values (${id}, ${names[index]})`;
    await sql!`insert into tournament_match_player (match_id, round_id, player_id, team, position) values (${finishedSlot}, ${roundId}, ${id}, ${team}, ${position}), (${scheduledSlot}, ${nextRoundId}, ${id}, ${team}, ${position}), (${activeSlot}, ${activeRoundId}, ${id}, ${team}, ${position})`;
    await sql!`insert into match_player (match_id, player_id, team, position) values (${gameId}, ${id}, ${team}, ${position})`;
    await sql!`insert into match_player (match_id, player_id, team, position) values (${activeGameId}, ${id}, ${team}, ${position})`;
    await sql!`insert into match_player (match_id, player_id, team, position) values (${standaloneId}, ${id}, ${team}, ${position})`;
  }

  const base = "/api/qlik/";
  expect((await request.get(`${base}get-events.php?key=${analyticsKey}`)).status()).toBe(401);
  expect((await request.get(`${base}get-events.php`, { headers: { "x-analytics-key": "wrong" } })).status()).toBe(401);
  const headers = { "x-analytics-key": analyticsKey! };
  expect((await request.get(`${base}get-matches.php?event=missing`, { headers })).status()).toBe(404);
  const eventRows = (await (await request.get(`${base}get-events.php?event=${eventId}`, { headers })).json()).rows;
  expect(eventRows).toEqual([{ id: eventId, name: "Qlik Contract Event", courts: 2, matchCount: 3, completedCount: 1, eventWindow: { start: "2026-09-13T09:00:00.000Z", end: "2026-09-13T09:20:00.000Z" }, isCurrent: true }]);
  const matchRows = (await (await request.get(`${base}get-matches.php?event=${eventId}`, { headers })).json()).rows;
  expect(matchRows[0]).toMatchObject({ eventId, matchId: finishedSlot, round: 1, court: 1, status: "completed", teamA: names.slice(0, 2), teamB: names.slice(2), scoreA: 11, scoreB: 7, winner: "A", gameId });
  expect(matchRows[1]).toMatchObject({ matchId: scheduledSlot, status: "scheduled", scoreA: null, scoreB: null, winner: null, gameId: null });
  expect(matchRows[2]).toMatchObject({ matchId: activeSlot, status: "in_progress", scoreA: 5, scoreB: 3, winner: null, startedAt: "2026-09-13T10:00:00.000Z", completedAt: null, gameId: activeGameId });
  const resultRows = (await (await request.get(`${base}get-leaderboard-results.php?event=${eventId}`, { headers })).json()).rows;
  expect(resultRows).toEqual([{ matchId: gameId, eventId, winner: "A", teamAScore: 11, teamBScore: 7, targetScore: 11, durationSeconds: 1200, completedAt: "2026-09-13T09:20:00.000Z", round: 1, court: 1, sideOuts: 1, rallyCount: 3, teamALongestRun: 1, teamBLongestRun: 0 }]);
  const allResults = (await (await request.get(`${base}get-leaderboard-results.php`, { headers })).json()).rows;
  expect(allResults).toContainEqual(expect.objectContaining({ matchId: standaloneId, eventId: null, round: null, court: null, winner: "B" }));
  const playerRows = (await (await request.get(`${base}get-leaderboard-players.php?event=${eventId}`, { headers })).json()).rows;
  expect(playerRows).toHaveLength(12);
  expect(playerRows).toContainEqual({ matchId: gameId, eventId, team: "A", playerName: names[0] });
  expect(playerRows).toContainEqual({ matchId: scheduledSlot, eventId, team: "B", playerName: names[3] });
  expect((await request.post(`${base}get-events.php`, { headers })).status()).toBe(405);
  expect((await request.get(`${base}get-embed-token.php`)).status()).toBe(401);

  await signIn(page, await account("admin"));
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Analytics subjects" }).getByRole("button")).toHaveCount(6);
  await page.getByRole("button", { name: "Match Analysis" }).click();
  await expect(page.getByRole("button", { name: "Match Analysis" })).toHaveAttribute("aria-current", "page");
  const token = await page.evaluate(async () => (await fetch("/api/qlik/get-embed-token.php")).json());
  expect(token.ok === true || token.error === "Could not get a Qlik token").toBe(true);

  const playerPage = await browser.newPage();
  await signIn(playerPage, await account("player"));
  expect(await playerPage.evaluate(async () => (await fetch("/api/qlik/get-embed-token.php")).status)).toBe(403);
  await playerPage.goto("/analytics");
  await expect(playerPage).toHaveURL(/\/account/);
  await playerPage.close();
});
