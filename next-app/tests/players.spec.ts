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
  const username = `players_${id.replaceAll("-", "").slice(0, 18)}`;
  const password = `Test-${randomUUID()}!`;
  await sql!`insert into "user" (id, name, email, email_verified, username, role) values (${id}, 'Player Staff', ${`${id}@example.com`}, true, ${username}, 'admin')`;
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

test("staff maintain Player identity across historical Matches; Visitor changes are denied", async ({ page, browser, request }) => {
  expect((await request.get("/api/players")).status()).toBe(401);
  expect((await request.post("/api/players", { data: { name: "Intruder" } })).status()).toBe(401);
  const { username, password } = await admin();
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await page.goto("/players");
  const source = `Jomar E ${randomUUID().slice(0, 6)}`;
  const target = `Jomar Ebonite ${randomUUID().slice(0, 6)}`;
  for (const name of [source, target]) {
    await page.getByLabel("New Player name").fill(`  ${name}  `);
    await page.getByRole("button", { name: "Add Player" }).click();
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await page.getByLabel("New Player name").fill(source.toUpperCase());
  await page.getByRole("button", { name: "Add Player" }).click();
  await expect(page.getByRole("status")).toContainText("already exists");
  await page.getByLabel("Find Players").fill(target);
  await expect(page.getByRole("link", { name: target, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: source, exact: true })).toHaveCount(0);
  await page.getByLabel("Find Players").fill("");
  await page.getByLabel(`Skill level for ${source}`).selectOption("intermediate");
  await expect(page.getByRole("status")).toContainText("Skill level updated");
  const players = await page.evaluate(async () => (await fetch("/api/players")).json());
  const sourceId = players.players.find((item: { name: string }) => item.name === source).id as string;
  const targetId = players.players.find((item: { name: string }) => item.name === target).id as string;
  expect(await page.evaluate(async (id) => (await fetch(`/api/players/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "   ", skillLevel: "expert" }) })).status, sourceId)).toBe(400);
  expect(await page.evaluate(async ({ id, name }) => (await fetch(`/api/players/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) })).status, { id: sourceId, name: target.toUpperCase() })).toBe(409);
  expect(await page.evaluate(async ({ survivor, absorbed }) => (await fetch(`/api/players/${survivor}/merge`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ absorbedId: absorbed }) })).status, { survivor: targetId, absorbed: sourceId })).toBe(400);
  const matchId = randomUUID();
  await sql!`insert into "match" (id) values (${matchId})`;
  await sql!`insert into match_player (match_id, player_id, team, position) values (${matchId}, ${sourceId}, 'A', 1)`;
  await sql!`insert into match_player (match_id, player_id, team, position) values (${matchId}, ${targetId}, 'B', 1)`;
  expect(await page.evaluate(async ({ survivor, absorbed }) => (await fetch(`/api/players/${survivor}/merge`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ absorbedId: absorbed, confirm: "MERGE" }) })).status, { survivor: targetId, absorbed: sourceId })).toBe(409);
  await sql!`delete from match_player where match_id = ${matchId} and player_id = ${targetId}`;

  const visitorPage = await browser.newPage();
  const email = `visitor-${randomUUID()}@example.com`;
  await visitorPage.goto("/sign-in");
  await visitorPage.getByRole("button", { name: "Visitor" }).click();
  await visitorPage.getByLabel("Email").fill(email);
  await visitorPage.getByRole("button", { name: "Send code" }).click();
  await visitorPage.getByLabel("Code").fill(await codeFor(email));
  await visitorPage.getByRole("button", { name: "Verify code" }).click();
  await expect(visitorPage.getByRole("heading", { name: "Your account" })).toBeVisible();
  const visitorId = await visitorPage.evaluate(async () => (await fetch("/api/auth/get-session")).json().then((result) => result.user.id));
  await sql!`update "user" set player_id = ${sourceId} where id = ${visitorId}`;
  const otherAccountId = randomUUID();
  await sql!`insert into "user" (id, name, email, email_verified, role, player_id) values (${otherAccountId}, 'Other Player', ${`${otherAccountId}@example.com`}, true, 'visitor', ${targetId})`;
  expect(await page.evaluate(async ({ survivor, absorbed }) => (await fetch(`/api/players/${survivor}/merge`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ absorbedId: absorbed, confirm: "MERGE" }) })).status, { survivor: targetId, absorbed: sourceId })).toBe(409);
  await sql!`update "user" set player_id = null where id = ${otherAccountId}`;
  expect(await visitorPage.evaluate(async () => (await fetch("/api/players")).status)).toBe(403);
  expect(await visitorPage.evaluate(async (id) => (await fetch(`/api/players/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Intruder" }) })).status, sourceId)).toBe(403);
  expect(await visitorPage.evaluate(async (id) => (await fetch(`/api/players/${id}/merge`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ absorbedId: "x", confirm: "MERGE" }) })).status, targetId)).toBe(403);
  await visitorPage.close();

  await page.getByLabel(`Merge ${source} into`).selectOption(targetId);
  const mergeButton = page.getByLabel(`Merge ${source} into`).locator("..").locator("..").getByRole("button", { name: "Merge Players" });
  page.once("dialog", (dialog) => dialog.dismiss());
  await mergeButton.click();
  await expect(page.getByRole("link", { name: source, exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await mergeButton.click();
  await expect(page.getByRole("status")).toContainText("Players merged");
  await expect(page.getByRole("link", { name: source, exact: true })).toHaveCount(0);
  await expect(page.getByLabel(`Skill level for ${target}`)).toHaveValue("intermediate");
  await page.getByRole("link", { name: target, exact: true }).click();
  await expect(page.getByText("Linked account: Yes")).toBeVisible();
  await page.getByRole("link", { name: `Match ${matchId}` }).click();
  await expect(page.getByRole("link", { name: target, exact: true })).toBeVisible();
  await page.goto("/players");
  const renamed = `${target} Jr`;
  await page.getByLabel(`Rename ${target}`).fill(renamed);
  await page.getByLabel(`Rename ${target}`).locator("..").locator("..").getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("link", { name: renamed, exact: true })).toBeVisible();
  await page.goto(`/matches/${matchId}`);
  await expect(page.getByRole("link", { name: renamed, exact: true })).toBeVisible();
});
