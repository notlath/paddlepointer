import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { hashPassword } from "better-auth/crypto";
import postgres from "postgres";

const databaseURL = process.env.DATABASE_URL;
const outbox = process.env.AUTH_TEST_OUTBOX_DIR;
test.skip(!databaseURL || !databaseURL.includes("127.0.0.1") || !outbox, "Requires a disposable local database and test outbox");
const sql = databaseURL ? postgres(databaseURL, { prepare: false }) : null;

async function codeFor(email: string) {
  for (let attempt = 0; attempt < 30; attempt++) {
    for (const file of await readdir(outbox!)) {
      const message = JSON.parse(await readFile(join(outbox!, file), "utf8"));
      if (message.to === email && message.subject === "Your PaddlePointer sign-in code") {
        await unlink(join(outbox!, file));
        return (message.text as string).match(/\b\d{6}\b/)?.[0] as string;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Visitor code was not delivered");
}

test("scorer starts a scheduled Match, records Rally outcomes, undoes, reloads, and saves", async ({ page, browser }) => {
  const id = randomUUID();
  const username = `scorer_${id.replaceAll("-", "").slice(0, 18)}`;
  const password = `Test-${randomUUID()}!`;
  await sql!`insert into "user" (id, name, email, email_verified, username, role) values (${id}, 'Scorer', ${`${id}@example.com`}, true, ${username}, 'admin')`;
  await sql!`insert into account (id, account_id, provider_id, user_id, password, updated_at) values (${randomUUID()}, ${id}, 'credential', ${id}, ${await hashPassword(password)}, now())`;
  const eventId = randomUUID();
  const roundId = randomUUID();
  const slotId = randomUUID();
  await sql!`insert into event (id, name) values (${eventId}, 'Scoreboard Test')`;
  await sql!`insert into tournament (id, event_id, target_score) values (${eventId}, ${eventId}, 11)`;
  await sql!`insert into current_event (singleton, event_id) values (1, ${eventId}) on conflict (singleton) do update set event_id = excluded.event_id`;
  await sql!`insert into tournament_round (id, tournament_id, number) values (${roundId}, ${eventId}, 1)`;
  await sql!`insert into tournament_match (id, tournament_id, round_id, court) values (${slotId}, ${eventId}, ${roundId}, 1)`;
  for (let index = 0; index < 4; index++) {
    const playerId = randomUUID();
    await sql!`insert into player (id, name) values (${playerId}, ${`Score Player ${index} ${playerId.slice(0, 6)}`})`;
    await sql!`insert into tournament_match_player (match_id, round_id, player_id, team, position) values (${slotId}, ${roundId}, ${playerId}, ${index < 2 ? "A" : "B"}, ${index % 2 + 1})`;
  }
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await page.goto(`/scoreboard/${slotId}`);
  await expect(page.getByRole("heading", { name: "Scoreboard" })).toBeVisible();
  await page.getByRole("button", { name: "Start Match" }).click();
  await expect(page.getByText("Match started")).toBeVisible();
  await page.getByRole("button", { name: "Team A wins Rally" }).click();
  await expect(page.getByLabel("Score call")).toHaveText("1 - 0 - 2");
  await page.getByRole("button", { name: "Team B wins Rally" }).click();
  await expect(page.getByLabel("Score call")).toHaveText("0 - 1 - 1");
  await page.getByRole("button", { name: "Undo last action" }).click();
  await expect(page.getByLabel("Score call")).toHaveText("1 - 0 - 2");
  await page.reload();
  await expect(page.getByLabel("Score call")).toHaveText("1 - 0 - 2");
  const otherEvent = randomUUID();
  await sql!`insert into event (id, name) values (${otherEvent}, 'Other Event')`;
  await sql!`update current_event set event_id = ${otherEvent} where singleton = 1`;
  await page.getByRole("button", { name: "Team A wins Rally" }).click();
  await expect(page.getByRole("status")).toContainText("Save failed");
  await expect(page.getByLabel("Score call")).toHaveText("1 - 0 - 2");
  await sql!`update current_event set event_id = ${eventId} where singleton = 1`;
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Team B wins Rally" })).toBeVisible();
  await page.getByRole("button", { name: "Team B wins Rally" }).click();
  await expect(page.getByLabel("Score call")).toHaveText("0 - 1 - 1");
  await page.getByRole("button", { name: "Team A wins Rally" }).click();
  await expect(page.getByLabel("Score call")).toHaveText("0 - 1 - 2");
  await page.getByRole("button", { name: "Undo last action" }).click();
  await page.getByRole("button", { name: "Undo last action" }).click();
  await expect(page.getByLabel("Score call")).toHaveText("1 - 0 - 2");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset active Match" }).click();
  await expect(page.getByRole("status")).toHaveText("Match reset");
  await expect(page.getByLabel("Score call")).toHaveText("0 - 0 - 2");
  await expect(page.getByText("No Rallies yet.")).toBeVisible();
  await page.getByRole("button", { name: "Team A wins Rally" }).click();
  await expect(page.getByLabel("Score call")).toHaveText("1 - 0 - 2");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "End Match" }).click();
  await expect(page.getByRole("status")).toHaveText("Match saved");
  await expect(page.getByRole("button", { name: "Undo last action" })).toBeDisabled();
  const rows = await sql!`select score_a, score_b, status, rally_log from "match" where tournament_match_id = ${slotId}`;
  expect(rows[0].score_a).toBe(1);
  expect(rows[0].score_b).toBe(0);
  expect(rows[0].status).toBe("completed");
  expect(rows[0].rally_log).toHaveLength(1);

  const guest = await browser.newPage();
  await guest.goto(`/scoreboard/${slotId}`);
  await expect(guest).toHaveURL(/\/sign-in/);
  await guest.close();

  const visitor = await browser.newPage();
  const email = `score-visitor-${randomUUID()}@example.com`;
  await visitor.goto("/sign-in");
  await visitor.getByRole("button", { name: "Visitor" }).click();
  await visitor.getByLabel("Email").fill(email);
  await visitor.getByRole("button", { name: "Send code" }).click();
  await visitor.getByLabel("Code").fill(await codeFor(email));
  await visitor.getByRole("button", { name: "Verify code" }).click();
  await expect(visitor.getByRole("heading", { name: "Your account" })).toBeVisible();
  await visitor.goto(`/scoreboard/${slotId}`);
  await expect(visitor).toHaveURL(/\/account/);
  await visitor.close();
});
