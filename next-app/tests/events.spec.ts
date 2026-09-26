import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import postgres from "postgres";

const databaseURL = process.env.DATABASE_URL;
test.skip(!databaseURL || !databaseURL.includes("127.0.0.1"), "Requires a disposable local database");
const sql = databaseURL ? postgres(databaseURL, { prepare: false }) : null;

async function staff(role: "admin" | "super_admin") {
  const id = randomUUID();
  const username = `event_${id.replaceAll("-", "").slice(0, 18)}`;
  const password = `Test-${randomUUID()}!`;
  await sql!`insert into "user" (id, name, email, email_verified, username, role) values (${id}, 'Event Staff', ${`${id}@example.com`}, true, ${username}, ${role})`;
  await sql!`insert into account (id, account_id, provider_id, user_id, password, updated_at) values (${randomUUID()}, ${id}, 'credential', ${id}, ${await hashPassword(password)}, now())`;
  return { username, password };
}

async function signIn(page: import("@playwright/test").Page, credentials: Awaited<ReturnType<typeof staff>>) {
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(credentials.username);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
}

test("Super Admin starts Events, history remains visible, and Admin cannot change Current Event", async ({ page, browser, request }) => {
  expect((await request.get("/api/events")).status()).toBe(401);
  expect((await request.post("/api/events", { data: { name: "No access" } })).status()).toBe(401);
  await signIn(page, await staff("super_admin"));
  await page.goto("/events");
  const first = `First ${randomUUID()}`;
  const second = `Second ${randomUUID()}`;
  await page.getByLabel("Event name").fill(first);
  await page.getByRole("button", { name: "Start Event" }).click();
  await expect(page.getByText(`Current Event: ${first}`)).toBeVisible();
  await page.getByLabel("Event name").fill(second);
  await page.getByRole("button", { name: "Start Event" }).click();
  await expect(page.getByText(`Current Event: ${second}`)).toBeVisible();
  await expect(page.getByText(new RegExp(`^${first}.*Past`))).toBeVisible();
  await page.getByRole("link", { name: first }).click();
  await expect(page.getByRole("heading", { name: first })).toBeVisible();
  await expect(page.getByText("Status: Past Event")).toBeVisible();
  await page.getByRole("link", { name: "All Events" }).click();
  const response = await page.evaluate(async () => (await fetch("/api/events")).json());
  expect(response.events.find((item: { name: string }) => item.name === first)).toBeTruthy();
  expect(response.events.find((item: { name: string }) => item.name === second).id).toBe(response.currentEventId);

  const adminPage = await browser.newPage();
  await signIn(adminPage, await staff("admin"));
  await adminPage.goto("/events");
  await expect(adminPage.getByText(`Current Event: ${second}`)).toBeVisible();
  await expect(adminPage.getByText(new RegExp(`^${first}.*Past`))).toBeVisible();
  await expect(adminPage.getByRole("button", { name: "Start Event" })).toHaveCount(0);
  expect(await adminPage.evaluate(async () => (await fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Intruder" }) })).status)).toBe(403);
  expect(await adminPage.evaluate(async () => (await fetch("/api/events", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventId: "old" }) })).status)).toBe(405);
  await adminPage.close();
});
