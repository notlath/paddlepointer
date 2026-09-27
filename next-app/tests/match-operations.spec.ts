import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import postgres from "postgres";

const databaseURL = process.env.DATABASE_URL;
test.skip(!databaseURL || !databaseURL.includes("127.0.0.1"), "Requires a disposable local database");
const sql = databaseURL ? postgres(databaseURL, { prepare: false }) : null;

async function account(role: "admin" | "super_admin") {
  const id = randomUUID();
  const username = `ops_${id.replaceAll("-", "").slice(0, 18)}`;
  const password = `Test-${randomUUID()}!`;
  await sql!`insert into "user" (id, name, email, email_verified, username, role) values (${id}, 'Match Operator', ${`${id}@example.com`}, true, ${username}, ${role})`;
  await sql!`insert into account (id, account_id, provider_id, user_id, password, updated_at) values (${randomUUID()}, ${id}, 'credential', ${id}, ${await hashPassword(password)}, now())`;
  return { username, password };
}

async function signIn(page: import("@playwright/test").Page, credentials: { username: string; password: string }) {
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(credentials.username);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
}

async function tournamentFixture(name: string) {
  const eventId = randomUUID();
  const roundId = randomUUID();
  const completedSlot = randomUUID();
  const scheduledSlot = randomUUID();
  const scoredMatch = randomUUID();
  await sql!`insert into event (id, name) values (${eventId}, ${name})`;
  await sql!`insert into tournament (id, event_id) values (${eventId}, ${eventId})`;
  await sql!`insert into tournament_round (id, tournament_id, number) values (${roundId}, ${eventId}, 1)`;
  await sql!`insert into tournament_match (id, tournament_id, round_id, court, status) values (${completedSlot}, ${eventId}, ${roundId}, 1, 'completed'), (${scheduledSlot}, ${eventId}, ${roundId}, 2, 'scheduled')`;
  await sql!`insert into "match" (id, event_id, tournament_match_id, status, score_a, score_b, ended_early, ended_at) values (${scoredMatch}, ${eventId}, ${completedSlot}, 'completed', 0, 0, true, now())`;
  for (let index = 0; index < 8; index++) {
    const playerId = randomUUID();
    await sql!`insert into player (id, name) values (${playerId}, ${`Ops ${name} ${index} ${playerId.slice(0, 6)}`})`;
    await sql!`insert into tournament_match_player (match_id, round_id, player_id, team, position) values (${index < 4 ? completedSlot : scheduledSlot}, ${roundId}, ${playerId}, ${index % 4 < 2 ? "A" : "B"}, ${index % 2 + 1})`;
    if (index < 4) await sql!`insert into match_player (match_id, player_id, team, position) values (${scoredMatch}, ${playerId}, ${index < 2 ? "A" : "B"}, ${index % 2 + 1})`;
  }
  return { eventId, completedSlot, scheduledSlot, scoredMatch };
}

test("Super Admin corrects a past result and safely resets or removes Current Event Matches", async ({ page, browser }) => {
  const past = await tournamentFixture(`Past Ops ${randomUUID().slice(0, 6)}`);
  const current = await tournamentFixture(`Current Ops ${randomUUID().slice(0, 6)}`);
  await sql!`insert into current_event (singleton, event_id) values (1, ${current.eventId}) on conflict (singleton) do update set event_id = excluded.event_id`;
  await signIn(page, await account("super_admin"));
  await page.goto(`/events/${past.eventId}`);
  await expect(page.getByRole("heading", { name: /Past Ops/ })).toBeVisible();
  const correction = page.getByTestId(`match-${past.completedSlot}`);
  await correction.getByLabel("Team A Score").fill("2");
  await correction.getByLabel("Team B Score").fill("0");
  await correction.getByLabel("Winner").selectOption("B");
  page.once("dialog", (dialog) => dialog.accept());
  await correction.getByRole("button", { name: "Correct result" }).click();
  await expect(page.getByRole("status")).toContainText("Winner must agree");
  expect((await sql!`select score_a from "match" where id = ${past.scoredMatch}`)[0].score_a).toBe(0);
  await correction.getByLabel("Winner").selectOption("A");
  page.once("dialog", (dialog) => dialog.accept());
  await correction.getByRole("button", { name: "Correct result" }).click();
  await expect(page.getByRole("status")).toContainText("Result corrected");
  const corrected = await sql!`select score_a, score_b, winner, rally_log from "match" where id = ${past.scoredMatch}`;
  expect([corrected[0].score_a, corrected[0].score_b, corrected[0].winner]).toEqual([2, 0, "A"]);
  expect(corrected[0].rally_log.at(-1).action).toBe("score-correction");
  await page.reload();
  await expect(correction).toContainText("Match saved · 2-0 · Team A won");
  await expect(correction.getByLabel("Team A Score")).toHaveValue("2");
  await correction.getByLabel("Team A Score").fill("0");
  await correction.getByLabel("Team B Score").fill("0");
  page.once("dialog", (dialog) => dialog.accept());
  await correction.getByRole("button", { name: "Correct result" }).click();
  await expect(page.getByRole("status")).toContainText("Tied Scores require");
  await correction.getByLabel("Retired Team").selectOption("B");
  page.once("dialog", (dialog) => dialog.accept());
  await correction.getByRole("button", { name: "Correct result" }).click();
  await expect(page.getByRole("status")).toContainText("Result corrected");
  const retirement = await sql!`select score_a, score_b, winner, retired_team, rally_log from "match" where id = ${past.scoredMatch}`;
  expect([retirement[0].score_a, retirement[0].score_b, retirement[0].winner, retirement[0].retired_team]).toEqual([0, 0, "A", "B"]);
  expect(retirement[0].rally_log).toHaveLength(2);
  await expect(correction.getByRole("button", { name: "Reset result" })).toHaveCount(0);

  await page.goto(`/events/${current.eventId}`);
  const currentCard = page.getByTestId(`match-${current.completedSlot}`);
  page.once("dialog", (dialog) => dialog.dismiss());
  await currentCard.getByRole("button", { name: "Reset result" }).click();
  expect((await sql!`select status from tournament_match where id = ${current.completedSlot}`)[0].status).toBe("completed");
  page.once("dialog", (dialog) => dialog.accept());
  await currentCard.getByRole("button", { name: "Reset result" }).click();
  await expect(page.getByRole("status")).toContainText("Result reset");
  expect((await sql!`select status from tournament_match where id = ${current.completedSlot}`)[0].status).toBe("scheduled");
  expect(await sql!`select id from "match" where id = ${current.scoredMatch}`).toHaveLength(0);
  expect(await sql!`select player_id from match_player where match_id = ${current.scoredMatch}`).toHaveLength(0);

  const scheduled = page.getByTestId(`match-${current.scheduledSlot}`);
  page.once("dialog", (dialog) => dialog.accept());
  await scheduled.getByRole("button", { name: "Remove Tournament Match" }).click();
  await expect(page.getByRole("status")).toContainText("Tournament Match removed");
  expect(await sql!`select id from tournament_match where id = ${current.scheduledSlot}`).toHaveLength(0);

  const adminPage = await browser.newPage();
  await signIn(adminPage, await account("admin"));
  await adminPage.goto(`/events/${past.eventId}`);
  await expect(adminPage.getByRole("button", { name: "Correct result" })).toHaveCount(0);
  await adminPage.close();
});

test("Super Admin clears results while keeping the Schedule, then resets the Current Event Tournament", async ({ page }) => {
  const current = await tournamentFixture(`Reset Ops ${randomUUID().slice(0, 6)}`);
  await sql!`insert into current_event (singleton, event_id) values (1, ${current.eventId}) on conflict (singleton) do update set event_id = excluded.event_id`;
  await signIn(page, await account("super_admin"));
  await page.goto(`/events/${current.eventId}`);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Clear Results" }).click();
  await expect(page.getByRole("status")).toContainText("Results cleared");
  expect(await sql!`select id from "match" where id = ${current.scoredMatch}`).toHaveLength(0);
  expect((await sql!`select status from tournament_match where tournament_id = ${current.eventId} order by court`).map((row) => row.status)).toEqual(["scheduled", "scheduled"]);
  expect(await sql!`select player_id from tournament_match_player where match_id = ${current.completedSlot}`).toHaveLength(4);

  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Reset Tournament" }).click();
  expect(await sql!`select id from tournament_match where tournament_id = ${current.eventId}`).toHaveLength(2);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset Tournament" }).click();
  await expect(page.getByRole("status")).toContainText("Tournament reset");
  expect(await sql!`select id from tournament_match where tournament_id = ${current.eventId}`).toHaveLength(0);
  expect(await sql!`select id from tournament_round where tournament_id = ${current.eventId}`).toHaveLength(0);
  expect(await sql!`select id from event where id = ${current.eventId}`).toHaveLength(1);
});
