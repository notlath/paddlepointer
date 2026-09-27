import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import postgres from "postgres";

const databaseURL = process.env.DATABASE_URL;
test.skip(!databaseURL || !databaseURL.includes("127.0.0.1"), "Requires a disposable local database");
const sql = databaseURL ? postgres(databaseURL, { prepare: false }) : null;

async function account(role: "player" | "admin", name: string, playerId: string | null, verified = true) {
  const id = randomUUID();
  const username = `player_${id.replaceAll("-", "").slice(0, 18)}`;
  const password = `Test-${randomUUID()}!`;
  await sql!`insert into "user" (id, name, email, email_verified, username, role, player_id) values (${id}, ${name}, ${`${id}@example.com`}, ${verified}, ${username}, ${role}, ${playerId})`;
  await sql!`insert into account (id, account_id, provider_id, user_id, password, updated_at) values (${randomUUID()}, ${id}, 'credential', ${id}, ${await hashPassword(password)}, now())`;
  return { id, username, password };
}

async function signIn(page: import("@playwright/test").Page, credentials: Awaited<ReturnType<typeof account>>) {
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(credentials.username);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
}

test("verified provisioned Players see only their linked summaries after a Merge", async ({ page, browser }) => {
  const suffix = randomUUID().slice(0, 8);
  const absorbed = randomUUID();
  const survivor = randomUUID();
  const other = randomUUID();
  const partner = randomUUID();
  const opponent = randomUUID();
  const opponentTwo = randomUUID();
  await sql!`insert into player (id, name) values (${absorbed}, ${`Old Name ${suffix}`}), (${survivor}, ${`Current Name ${suffix}`}), (${other}, ${`Other Player ${suffix}`}), (${partner}, ${`Partner ${suffix}`}), (${opponent}, ${`Opponent ${suffix}`}), (${opponentTwo}, ${`Second Opponent ${suffix}`})`;
  const matchId = randomUUID();
  await sql!`insert into "match" (id, status, score_a, score_b, winner, ended_at) values (${matchId}, 'completed', 11, 7, 'A', now())`;
  await sql!`insert into match_player (match_id, player_id, team, position) values (${matchId}, ${absorbed}, 'A', 1), (${matchId}, ${partner}, 'A', 2), (${matchId}, ${opponent}, 'B', 1), (${matchId}, ${opponentTwo}, 'B', 2)`;
  const otherMatchId = randomUUID();
  await sql!`insert into "match" (id, status, score_a, score_b, winner, ended_at) values (${otherMatchId}, 'completed', 3, 11, 'B', now())`;
  await sql!`insert into match_player (match_id, player_id, team, position) values (${otherMatchId}, ${other}, 'A', 1), (${otherMatchId}, ${partner}, 'A', 2), (${otherMatchId}, ${opponent}, 'B', 1), (${otherMatchId}, ${opponentTwo}, 'B', 2)`;
  const linked = await account("player", `Old Name ${suffix}`, absorbed, false);
  const otherLinked = await account("player", `Other Player ${suffix}`, other);
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(linked.username);
  await page.getByLabel("Password").fill(linked.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(/failed|verify|credentials/i);
  await sql!`update "user" set email_verified = true where id = ${linked.id}`;

  const admin = await browser.newPage();
  await signIn(admin, await account("admin", `Staff ${suffix}`, null));
  const mergeStatus = await admin.evaluate(async ({ survivor, absorbed }) => (await fetch(`/api/players/${survivor}/merge`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ absorbedId: absorbed, confirm: "MERGE" }) })).status, { survivor, absorbed });
  expect(mergeStatus).toBe(200);
  await admin.close();

  await signIn(page, linked);
  await page.getByRole("link", { name: "My Player Matches" }).click();
  await expect(page.getByRole("heading", { name: `Current Name ${suffix}` })).toBeVisible();
  await expect(page.getByRole("listitem").getByText(new RegExp(`Current Name ${suffix}.*11–7`))).toBeVisible();
  await expect(page.getByText("1 completed Matches · 1 wins · 0 losses")).toBeVisible();
  await expect(page.getByText(/3–11/)).toHaveCount(0);
  await expect(page.getByText(`Old Name ${suffix}`)).toHaveCount(0);
  await page.goto("/staff");
  await expect(page).toHaveURL(/\/account/);
  expect(await page.evaluate(async () => (await fetch("/api/staff")).status)).toBe(403);
  expect(await page.evaluate(async () => (await fetch("/api/players")).status)).toBe(403);

  const otherPage = await browser.newPage();
  await signIn(otherPage, otherLinked);
  await otherPage.goto("/player");
  await expect(otherPage.getByRole("heading", { name: `Other Player ${suffix}` })).toBeVisible();
  await expect(otherPage.getByText(/3–11/)).toBeVisible();
  await expect(otherPage.getByText(/11–7/)).toHaveCount(0);
  await otherPage.close();

  const unlinkedPage = await browser.newPage();
  await signIn(unlinkedPage, await account("player", `Current Name ${suffix}`, null));
  await unlinkedPage.goto("/player");
  await expect(unlinkedPage.getByText(/not linked to a verified Player record/)).toBeVisible();
  await expect(unlinkedPage.getByRole("link", { name: "account recovery" })).toBeVisible();
  await expect(unlinkedPage.getByText("1 completed Matches")).toHaveCount(0);
  await unlinkedPage.close();
});
