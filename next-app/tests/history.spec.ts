import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const databaseURL = process.env.DATABASE_URL;
test.skip(!databaseURL || !databaseURL.includes("127.0.0.1") || !process.env.AUTH_TEST_OUTBOX_DIR, "Requires a disposable local database and test outbox");
const sql = databaseURL ? postgres(databaseURL, { prepare: false }) : null;

async function signIn(page: import("@playwright/test").Page) {
  const id = randomUUID();
  const username = `history_${id.replaceAll("-", "").slice(0, 18)}`;
  const password = `Test-${randomUUID()}!`;
  await sql!`insert into "user" (id, name, email, email_verified, username, role) values (${id}, 'History Staff', ${`${id}@example.com`}, true, ${username}, 'admin')`;
  await sql!`insert into account (id, account_id, provider_id, user_id, password, updated_at) values (${randomUUID()}, ${id}, 'credential', ${id}, ${await hashPassword(password)}, now())`;
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
}

async function finishedMatch(eventId: string | null, names: string[], winner = "A") {
  const id = randomUUID();
  const playerIds: string[] = [];
  await sql!`insert into "match" (id, event_id, status, score_a, score_b, winner, ended_at) values (${id}, ${eventId}, 'completed', 11, 7, ${winner}, now())`;
  for (let index = 0; index < 4; index++) {
    const playerId = randomUUID();
    playerIds.push(playerId);
    await sql!`insert into player (id, name) values (${playerId}, ${names[index]})`;
    await sql!`insert into match_player (match_id, player_id, team, position) values (${id}, ${playerId}, ${index < 2 ? "A" : "B"}, ${index % 2 + 1})`;
  }
  return { id, playerIds };
}

test("staff reviews current, past, and all results while visitors cannot access history", async ({ page, browser, request }) => {
  const suffix = randomUUID().slice(0, 8);
  const past = randomUUID();
  const current = randomUUID();
  await sql!`insert into event (id, name) values (${past}, ${`Past ${suffix}`}), (${current}, ${`Current ${suffix}`})`;
  await sql!`insert into current_event (singleton, event_id) values (1, ${current}) on conflict (singleton) do update set event_id = excluded.event_id`;
  const pastName = `Past Winner ${suffix}`;
  const currentName = `Current Winner ${suffix}`;
  const outsideName = `Outside Winner ${suffix}`;
  const pastMatch = await finishedMatch(past, [pastName, `Past Teammate ${suffix}`, `Past Loser 1 ${suffix}`, `Past Loser 2 ${suffix}`]);
  await finishedMatch(current, [currentName, `Current Teammate ${suffix}`, `Current Loser 1 ${suffix}`, `Current Loser 2 ${suffix}`]);
  await finishedMatch(null, [outsideName, `Outside Teammate ${suffix}`, `Outside Loser 1 ${suffix}`, `Outside Loser 2 ${suffix}`]);
  const unfinished = randomUUID();
  await sql!`insert into "match" (id, event_id, status) values (${unfinished}, ${current}, 'active')`;

  await page.goto("/history");
  await expect(page).toHaveURL(/\/sign-in/);
  await signIn(page);
  const survivor = randomUUID();
  const survivorName = `Surviving Winner ${suffix}`;
  await sql!`insert into player (id, name) values (${survivor}, ${survivorName})`;
  expect((await page.evaluate(async ({ survivor, absorbedId }) => (await fetch(`/api/players/${survivor}/merge`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ absorbedId, confirm: "MERGE" }) })).status, { survivor, absorbedId: pastMatch.playerIds[0] }))).toBe(200);
  await page.goto("/history");
  await expect(page.getByRole("link", { name: "Current Event" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Match History" })).toBeVisible();
  await expect(page.getByRole("listitem").getByRole("link", { name: new RegExp(currentName) })).toBeVisible();
  await expect(page.getByRole("listitem").getByRole("link", { name: new RegExp(survivorName) })).toHaveCount(0);
  await expect(page.getByRole("table").first().getByRole("row", { name: new RegExp(currentName) })).toContainText("11");
  await page.getByRole("link", { name: `Past ${suffix}` }).click();
  await expect(page.getByRole("link", { name: `Past ${suffix}` })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("listitem").getByRole("link", { name: new RegExp(survivorName) })).toBeVisible();
  await expect(page.getByText(pastName)).toHaveCount(0);
  await page.getByRole("link", { name: "All Events" }).click();
  await expect(page.getByRole("link", { name: "All Events" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("listitem").getByRole("link", { name: new RegExp(outsideName) })).toBeVisible();
  await expect(page.getByText("Outside Tournament")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Team Leaderboard" })).toBeVisible();
  await expect(page.getByRole("listitem").getByRole("link", { name: new RegExp(survivorName) })).toBeVisible();

  const empty = randomUUID();
  await sql!`insert into event (id, name) values (${empty}, ${`Empty ${suffix}`})`;
  await page.goto(`/history?event=${empty}`);
  await expect(page.getByText("No completed Matches in this selection.")).toBeVisible();
  await expect(page.getByText("No standings in this selection.")).toBeVisible();

  const visitor = await browser.newPage();
  const email = `history-${randomUUID()}@example.com`;
  await visitor.goto("/sign-in");
  await visitor.getByRole("button", { name: "Visitor" }).click();
  await visitor.getByLabel("Email").fill(email);
  await visitor.getByRole("button", { name: "Send code" }).click();
  await expect(visitor.getByLabel("Code")).toBeVisible();
  let code: string | undefined;
  for (let attempt = 0; attempt < 30 && !code; attempt++) {
    const files = await readdir(process.env.AUTH_TEST_OUTBOX_DIR!);
    for (const file of files) {
      const message = JSON.parse(await readFile(path.join(process.env.AUTH_TEST_OUTBOX_DIR!, file), "utf8"));
      if (message.to === email && message.subject === "Your PaddlePointer sign-in code") code = message.text.match(/\b\d{6}\b/)?.[0];
    }
    if (!code) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  expect(code).toBeTruthy();
  await visitor.getByLabel("Code").fill(code!);
  await visitor.getByRole("button", { name: "Verify code" }).click();
  await expect(visitor.getByRole("heading", { name: "Your account" })).toBeVisible();
  await visitor.goto("/history?event=all");
  await expect(visitor).toHaveURL(/\/account/);
  await visitor.close();
  expect((await request.get("/history?event=all")).url()).toMatch(/\/sign-in/);
});
