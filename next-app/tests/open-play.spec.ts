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

async function admin() {
  const id = randomUUID();
  const username = `schedule_${id.replaceAll("-", "").slice(0, 18)}`;
  const password = `Test-${randomUUID()}!`;
  await sql!`insert into "user" (id, name, email, email_verified, username, role) values (${id}, 'Schedule Admin', ${`${id}@example.com`}, true, ${username}, 'admin')`;
  await sql!`insert into account (id, account_id, provider_id, user_id, password, updated_at) values (${randomUUID()}, ${id}, 'credential', ${id}, ${await hashPassword(password)}, now())`;
  return { username, password };
}

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

test("Admin configures, generates and adjusts Open Play while unavailable and conflicting Players are rejected", async ({ page, browser, request }) => {
  expect((await request.get("/api/tournaments/current")).status()).toBe(401);
  expect((await request.post("/api/tournaments/current/schedule")).status()).toBe(404);
  const eventId = randomUUID();
  await sql!`insert into event (id, name) values (${eventId}, 'Open Play Test')`;
  await sql!`insert into tournament (id, event_id) values (${eventId}, ${eventId})`;
  await sql!`insert into current_event (singleton, event_id) values (1, ${eventId}) on conflict (singleton) do update set event_id = excluded.event_id`;
  const credentials = await admin();
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(credentials.username);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  const names = Array.from({ length: 8 }, (_, index) => `Schedule Player ${index + 1} ${randomUUID().slice(0, 6)}`);
  for (const name of names) {
    expect(await page.evaluate(async (name) => (await fetch("/api/players", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) })).status, name)).toBe(201);
  }
  await page.goto("/open-play");
  await expect(page.getByRole("heading", { name: "Open Play Schedule" })).toBeVisible();
  await page.getByLabel("Courts", { exact: true }).fill("2");
  await page.getByLabel("Matches per Player").fill("2");
  for (const name of names) await page.getByLabel(new RegExp(`^${name} \\(`)).check();
  await page.getByLabel(`Unavailable: ${names[0]}`).check();
  await page.getByRole("button", { name: "Save setup" }).click();
  await expect(page.getByRole("status")).toContainText("Schedule saved");
  await page.getByRole("button", { name: "Generate Schedule" }).click();
  await expect(page.getByRole("status")).toContainText("Unavailable Players");
  await page.getByLabel(`Unavailable: ${names[0]}`).uncheck();
  await page.getByRole("button", { name: "Save setup" }).click();
  await expect(page.getByRole("status")).toContainText("Schedule saved");
  await page.getByRole("button", { name: "Generate Schedule" }).click();
  await expect(page.getByRole("heading", { name: "Round 1" })).toBeVisible();
  const state = await page.evaluate(async () => (await fetch("/api/tournaments/current")).json());
  expect(state.rounds.length).toBeGreaterThan(0);
  expect(state.rounds[0].matches.length).toBe(2);
  for (const round of state.rounds) {
    const members = round.matches.flatMap((item: { teamA: { playerId: string }[]; teamB: { playerId: string }[] }) => [...item.teamA, ...item.teamB].map((entry) => entry.playerId));
    expect(new Set(members).size).toBe(members.length);
    expect(new Set(round.matches.map((item: { court: number }) => item.court)).size).toBe(round.matches.length);
  }
  const first = state.rounds[0].matches[0];
  const second = state.rounds[0].matches[1];
  const firstForm = page.getByRole("heading", { name: "Round 1" }).locator("..").locator("form").first();
  await firstForm.getByLabel("Court").fill(String(second.court));
  await firstForm.getByRole("button", { name: "Save Tournament Match" }).click();
  await expect(page.getByRole("status")).toContainText("already used");
  await firstForm.getByLabel("Court").fill(String(first.court));
  await firstForm.getByLabel("Team A Player 1").selectOption(second.teamA[0].playerId);
  await firstForm.getByRole("button", { name: "Save Tournament Match" }).click();
  await expect(page.getByRole("status")).toContainText("already scheduled");
  await firstForm.getByLabel("Team A Player 1").selectOption(first.teamA[0].playerId);
  await firstForm.getByLabel("Round").fill("99");
  await firstForm.getByLabel("Court").fill("1");
  await firstForm.getByRole("button", { name: "Save Tournament Match" }).click();
  await expect(page.getByRole("status")).toContainText("Schedule saved");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Round 99" })).toBeVisible();
  for (const name of names.slice(0, 5)) await page.getByLabel(new RegExp(`^${name} \\(`)).uncheck();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Save setup" }).click();
  await expect(page.getByRole("status")).toContainText("Add at least 4 registered Players");
  expect(await page.evaluate(async () => (await fetch("/api/tournaments/current", { method: "PUT", headers: { "content-type": "application/json" }, body: "{}" })).status)).toBe(405);

  const visitorPage = await browser.newPage();
  const email = `visitor-${randomUUID()}@example.com`;
  await visitorPage.goto("/sign-in");
  await visitorPage.getByRole("button", { name: "Visitor" }).click();
  await visitorPage.getByLabel("Email").fill(email);
  await visitorPage.getByRole("button", { name: "Send code" }).click();
  await visitorPage.getByLabel("Code").fill(await codeFor(email));
  await visitorPage.getByRole("button", { name: "Verify code" }).click();
  await expect(visitorPage.getByRole("heading", { name: "Your account" })).toBeVisible();
  expect(await visitorPage.evaluate(async () => (await fetch("/api/tournaments/current")).status)).toBe(403);
  expect(await visitorPage.evaluate(async () => (await fetch("/api/tournaments/current", { method: "PUT", headers: { "content-type": "application/json" }, body: "{}" })).status)).toBe(405);
  expect(await visitorPage.evaluate(async () => (await fetch("/api/tournaments/current/schedule", { method: "POST" })).status)).toBe(404);
  expect(await visitorPage.evaluate(async (id) => (await fetch(`/api/tournaments/current/matches/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: "{}" })).status, first.id)).toBe(404);
  await visitorPage.close();
});
