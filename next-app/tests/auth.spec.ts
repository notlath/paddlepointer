import { expect, test } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import { readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { hashPassword } from "better-auth/crypto";
import postgres from "postgres";

const outbox = process.env.AUTH_TEST_OUTBOX_DIR;
const databaseURL = process.env.DATABASE_URL;
test.skip(!outbox || !databaseURL || !databaseURL.includes("127.0.0.1"), "Requires a disposable local database and test outbox");

const sql = databaseURL ? postgres(databaseURL, { prepare: false }) : null;
const uniqueEmail = () => `visitor-${randomUUID()}@example.com`;

async function mailFor(email: string, subject: string) {
  for (let attempt = 0; attempt < 30; attempt++) {
    for (const file of await readdir(outbox!)) {
      const message = JSON.parse(await readFile(join(outbox!, file), "utf8"));
      if (message.to === email && message.subject === subject) {
        await unlink(join(outbox!, file));
        return message.text as string;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Email was not delivered to the test outbox");
}

async function codeFor(email: string) {
  return (await mailFor(email, "Your PaddlePointer sign-in code")).match(/\b\d{6}\b/)?.[0] as string;
}

test("Visitor code must be valid and unexpired, then the account is private and sign-out revokes access", async ({ page, request }) => {
  const email = uniqueEmail();
  expect((await request.get(`/api/accounts/${randomUUID()}`)).status()).toBe(401);
  expect((await request.post("/api/auth/sign-up/email", { data: { email, name: "No", password: "notallowed" } })).status()).toBe(403);
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Visitor" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("Code")).toBeVisible();
  const firstCode = await codeFor(email);
  await page.getByLabel("Code").fill("000000");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page.getByRole("status")).toContainText(/invalid/i);

  await sql!`update verification set expires_at = now() - interval '1 second' where identifier = ${`sign-in-otp-${email}`}`;
  await page.getByLabel("Code").fill(firstCode);
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page.getByRole("status")).toContainText(/expired|invalid/i);

  await page.getByRole("button", { name: "Request a new code" }).click();
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("Code")).toBeVisible();
  const secondCode = await codeFor(email);
  await page.getByLabel("Code").fill(secondCode);
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  const session = await page.evaluate(async () => (await fetch("/api/auth/get-session")).json());
  const id = session.user.id as string;
  const own = await page.evaluate(async (id) => (await fetch(`/api/accounts/${id}`)).json(), id);
  expect(own.email).toBe(email);
  expect(own.role).toBe("visitor");
  expect(await page.evaluate(async () => (await fetch("/api/staff")).status)).toBe(403);
  expect(await page.evaluate(async () => (await fetch("/api/accounts/someone-else")).status)).toBe(403);
  expect(await page.evaluate(async () => (await fetch("/api/accounts/someone-else", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Intruder" }) })).status)).toBe(403);
  expect(await page.evaluate(async (id) => (await fetch(`/api/accounts/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Visitor Name" }) })).status, id)).toBe(200);
  const [visitorSession] = await sql!`select expires_at from session where user_id = ${id}`;
  expect(new Date(visitorSession.expires_at).getTime() - Date.now()).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
  await sql!`update session set expires_at = now() + interval '10 days' where user_id = ${id}`;
  expect(await page.evaluate(async (id) => (await fetch(`/api/accounts/${id}`)).status, id)).toBe(200);
  const [nonSliding] = await sql!`select expires_at from session where user_id = ${id}`;
  expect(new Date(nonSliding.expires_at).getTime() - Date.now()).toBeLessThan(11 * 24 * 60 * 60 * 1000);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect(await page.evaluate(async (id) => (await fetch(`/api/accounts/${id}`)).status, id)).toBe(401);
  expect((await request.post("/api/auth/request-password-reset", { data: { email } })).status()).toBe(403);
  const visitorUsername = `visitor_${id.slice(0, 10).toLowerCase()}`;
  const visitorPassword = `Test-${randomUUID()}!`;
  await sql!`update "user" set username = ${visitorUsername} where id = ${id}`;
  await sql!`insert into account (id, account_id, provider_id, user_id, password, updated_at) values (${randomUUID()}, ${id}, 'credential', ${id}, ${await hashPassword(visitorPassword)}, now())`;
  expect((await request.post("/api/auth/sign-in/username", { data: { username: visitorUsername, password: visitorPassword } })).status()).toBe(403);
});

test("staff username flow rejects Visitor OTP, refreshes near expiry, and enforces active status", async ({ page, request }) => {
  const id = randomUUID();
  const email = `staff-${id}@example.com`;
  const username = `staff_${id.slice(0, 16).replaceAll("-", "")}`;
  const password = `Test-${randomUUID()}!`;
  const hash = await hashPassword(password);
  await sql!`insert into "user" (id, name, email, email_verified, username, role) values (${id}, 'Test Staff', ${email}, false, ${username}, 'admin')`;
  await sql!`insert into account (id, account_id, provider_id, user_id, password, updated_at) values (${randomUUID()}, ${id}, 'credential', ${id}, ${hash}, now())`;
  expect((await request.post("/api/auth/email-otp/send-verification-otp", { data: { email, type: "sign-in" } })).status()).toBe(403);
  expect((await request.post("/api/auth/sign-in/email-otp", { data: { email, otp: "123456" } })).status()).toBe(403);
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(`@${username}`);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(/verif/i);
  await page.goto("/recover");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send verification email" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  const verificationEmail = await mailFor(email, "Verify your PaddlePointer email");
  const verificationURL = verificationEmail.match(/https?:\/\/\S+/)?.[0];
  expect(verificationURL).toBeTruthy();
  const invalidURL = new URL(verificationURL!);
  invalidURL.searchParams.set("token", "invalid-token");
  expect((await request.get(invalidURL.toString())).url()).toContain("error=INVALID_TOKEN");
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const jwtBody = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ email, iat: now - 7200, exp: now - 3600 })}`;
  const expiredToken = `${jwtBody}.${createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(jwtBody).digest("base64url")}`;
  const expiredURL = new URL(verificationURL!);
  expiredURL.searchParams.set("token", expiredToken);
  expect((await request.get(expiredURL.toString())).url()).toContain("error=TOKEN_EXPIRED");
  const [stillUnverified] = await sql!`select email_verified from "user" where id = ${id}`;
  expect(stillUnverified.email_verified).toBe(false);
  await page.goto(verificationURL!);
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(`@${username}`);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  expect(await page.evaluate(async () => (await fetch("/api/staff")).status)).toBe(200);
  await page.goto("/staff");
  await expect(page.getByRole("heading", { name: "Staff workspace" })).toBeVisible();
  const [before] = await sql!`select expires_at from session where user_id = ${id}`;
  expect(new Date(before.expires_at).getTime() - Date.now()).toBeLessThan(12 * 60 * 60 * 1000 + 60_000);
  await sql!`update session set expires_at = now() + interval '5 hours' where user_id = ${id}`;
  expect(await page.evaluate(async (id) => (await fetch(`/api/accounts/${id}`)).status, id)).toBe(200);
  const [after] = await sql!`select expires_at from session where user_id = ${id}`;
  expect(new Date(after.expires_at).getTime() - Date.now()).toBeGreaterThan(11 * 60 * 60 * 1000);
  await sql!`update session set expires_at = now() - interval '1 second' where user_id = ${id}`;
  expect(await page.evaluate(async (id) => (await fetch(`/api/accounts/${id}`)).status, id)).toBe(401);
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(`@${username}`);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await page.goto("/recover");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  const resetEmail = await mailFor(email, "Reset your PaddlePointer password");
  const resetURL = resetEmail.match(/https?:\/\/\S+/)?.[0];
  expect(resetURL).toBeTruthy();
  await page.goto(resetURL!);
  await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();
  const newPassword = `Reset-${randomUUID()}!`;
  await page.getByLabel("New password").fill(newPassword);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("status")).toContainText("Password changed");
  expect(await page.evaluate(async (id) => (await fetch(`/api/accounts/${id}`)).status, id)).toBe(401);
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(`@${username}`);
  await page.getByLabel("Password").fill(newPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await sql!`update "user" set is_active = false where id = ${id}`;
  expect(await page.evaluate(async (id) => (await fetch(`/api/accounts/${id}`)).status, id)).toBe(401);
});

test("role change, deactivation, and deletion revoke stored sessions", async () => {
  const id = randomUUID();
  await sql!`insert into "user" (id, name, email, email_verified, role) values (${id}, 'Access Test', ${`access-${id}@example.com`}, true, 'admin')`;
  const addSession = async () => sql!`insert into session (id, token, user_id, expires_at, updated_at) values (${randomUUID()}, ${randomUUID()}, ${id}, now() + interval '1 hour', now())`;
  const sessionCount = async () => Number((await sql!`select count(*)::int as count from session where user_id = ${id}`)[0].count);
  await addSession();
  await sql!`update "user" set role = 'visitor' where id = ${id}`;
  expect(await sessionCount()).toBe(0);
  await addSession();
  await sql!`update "user" set is_active = false where id = ${id}`;
  expect(await sessionCount()).toBe(0);
  await addSession();
  await sql!`delete from "user" where id = ${id}`;
  expect(await sessionCount()).toBe(0);
});
