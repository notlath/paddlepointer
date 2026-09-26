import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { db } from "../src/server/auth";
import { account, user } from "../src/server/schema";

const email = "lathrell.pagsuguiron@mtc.com.ph";
const username = "lathrellpagsuguiron";

async function readPassword() {
  if (!process.stdin.isTTY) throw new Error("Run this script in an interactive terminal");
  process.stdout.write("New Super Admin password (minimum 12 characters): ");
  const silent = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const prompt = createInterface({ input: process.stdin, output: silent, terminal: true });
  try {
    return await new Promise<string>((resolve) => prompt.question("", resolve));
  } finally {
    prompt.close();
    process.stdout.write("\n");
  }
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const password = await readPassword();
if (password.length < 12) throw new Error("Password must have at least 12 characters");
const existing = await db.query.user.findFirst({ where: eq(user.email, email) });
if (existing) throw new Error("Bootstrap account already exists");
if (await db.query.user.findFirst({ where: eq(user.role, "super_admin") })) {
  throw new Error("A Super Admin already exists; bootstrap is only for the first account");
}
const hash = await hashPassword(password);
const id = randomUUID();
await db.transaction(async (tx) => {
  await tx.insert(user).values({ id, name: "Lathrell Pagsuguiron", email, username, displayUsername: username, role: "super_admin", emailVerified: false });
  await tx.insert(account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash, updatedAt: new Date() });
});
console.log(`Created @${username}. Verify ${email} through the configured sender before signing in.`);
process.exit(0);
