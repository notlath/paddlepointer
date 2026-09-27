import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";

const outbox = process.env.AUTH_TEST_OUTBOX_DIR;
const databaseURL = process.env.DATABASE_URL;
test.skip(!outbox || !databaseURL || !databaseURL.includes("127.0.0.1"), "Requires a disposable local database and test outbox");
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
  throw new Error("Visitor code not delivered");
}

async function signInVisitor(page: import("@playwright/test").Page, expireFirst = false) {
  const email = `visitor-match-${randomUUID()}@example.com`;
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Visitor" }).click();
  await page.getByLabel("Email").fill(email);
  if (expireFirst) {
    await page.route("**/api/auth/email-otp/send-verification-otp", (route) => route.abort(), { times: 1 });
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(page.getByRole("status")).toContainText(/failed|error/i);
  }
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("Code")).toBeVisible();
  let code = await codeFor(email);
  if (expireFirst) {
    await sql!`update verification set expires_at = now() - interval '1 second' where identifier = ${`sign-in-otp-${email}`}`;
    await page.getByLabel("Code").fill(code);
    await page.getByRole("button", { name: "Verify code" }).click();
    await expect(page.getByRole("status")).toContainText(/expired|invalid/i);
    await page.getByRole("button", { name: "Request a new code" }).click();
    await page.getByRole("button", { name: "Send code" }).click();
    code = await codeFor(email);
  }
  await page.getByLabel("Code").fill(code);
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
}

test("verified Visitors score private Matches without creating Players", async ({ page, browser }) => {
  const suffix = randomUUID().slice(0, 8);
  const names = [`Visitor One ${suffix}`, `Visitor Two ${suffix}`, `Visitor Three ${suffix}`, `Visitor Four ${suffix}`];
  await page.goto("/visitor");
  await expect(page).toHaveURL(/\/sign-in/);
  await signInVisitor(page, true);
  await page.getByRole("link", { name: "Visitor Matches" }).click();
  await expect(page.getByText("No completed Visitor Matches yet.")).toBeVisible();
  for (let index = 0; index < 4; index++) await page.getByLabel(`Team ${index < 2 ? "A" : "B"} Player ${index % 2 + 1}`).fill(names[index]);
  await page.getByRole("button", { name: "Start Match" }).click();
  await expect(page.getByRole("heading", { name: "Visitor Scoreboard" })).toBeVisible();
  const matchUrl = page.url();
  await page.getByRole("button", { name: "Team A wins Rally" }).click();
  await expect(page.getByRole("status")).toContainText("Rally saved");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "End Match" }).click();
  await expect(page.getByRole("status")).toContainText("Match saved");
  await page.getByRole("link", { name: "Visitor Match History" }).click();
  await expect(page.getByRole("heading", { name: "Visitor Leaderboard" })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(names[0]) })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(names[0]) })).toContainText("1");
  const playerRows = await sql!`select id from player where name in (${names[0]}, ${names[1]}, ${names[2]}, ${names[3]})`;
  expect(playerRows).toHaveLength(0);

  const other = await browser.newPage();
  await signInVisitor(other);
  await other.goto("/visitor");
  await expect(other.getByText("No completed Visitor Matches yet.")).toBeVisible();
  await other.goto(matchUrl);
  await expect(other.getByText("This page could not be found")).toBeVisible();
  await other.close();
});
