import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { db } from "../src/server/auth";
import { account, player, user } from "../src/server/schema";

const [playerId, rawEmail, rawUsername] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();
const username = rawUsername?.trim().toLowerCase();
if (!process.env.DATABASE_URL || !playerId || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !username || !/^[a-z0-9_]{3,30}$/.test(username)) {
  throw new Error("Usage: bun run provision:player -- <reviewed-player-id> <reachable-email> <username>");
}
if (!process.stdin.isTTY) throw new Error("Run in an interactive terminal");
const [record] = await db.select({ id: player.id, name: player.name }).from(player).where(eq(player.id, playerId));
if (!record) throw new Error("Player ID not found; review the Player record before provisioning");
if (await db.query.user.findFirst({ where: eq(user.playerId, playerId) })) throw new Error("Player already has an account");
if (await db.query.user.findFirst({ where: eq(user.email, email) })) throw new Error("Email already belongs to an account");
if (await db.query.user.findFirst({ where: eq(user.username, username) })) throw new Error("Username already belongs to an account");
process.stdout.write(`Creating an account for Player ${record.name} (${record.id}) at ${email}. Confirm the identity outside this script before continuing.\nNew password (minimum 12 characters): `);
const silent = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
const prompt = createInterface({ input: process.stdin, output: silent, terminal: true });
const password = await new Promise<string>((resolve) => prompt.question("", resolve));
prompt.close();
process.stdout.write("\n");
if (password.length < 12) throw new Error("Password must have at least 12 characters");
const hash = await hashPassword(password);
const id = randomUUID();
await db.transaction(async (tx) => {
  await tx.insert(user).values({ id, name: record.name, email, username, displayUsername: username, role: "player", playerId, emailVerified: false });
  await tx.insert(account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash, updatedAt: new Date() });
});
console.log(`Created unverified Player account @${username}. Have the Player open /recover to verify ${email} before sign-in.`);
process.exit(0);
