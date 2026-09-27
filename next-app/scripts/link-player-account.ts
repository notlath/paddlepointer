import { eq } from "drizzle-orm";
import { db } from "../src/server/auth";
import { player, user } from "../src/server/schema";

const [accountId, playerId] = process.argv.slice(2);
if (!process.env.DATABASE_URL || !accountId || !playerId) throw new Error("Usage: bun run link:player -- <reviewed-account-id> <reviewed-player-id>");
await db.transaction(async (tx) => {
  const [account] = await tx.select({ id: user.id, role: user.role, playerId: user.playerId, emailVerified: user.emailVerified })
    .from(user).where(eq(user.id, accountId)).for("update");
  const [record] = await tx.select({ id: player.id }).from(player).where(eq(player.id, playerId));
  if (!account || account.role !== "player" || account.playerId || !account.emailVerified || !record) {
    throw new Error("A verified, unlinked Player account and an existing Player ID are required");
  }
  const [linked] = await tx.select({ id: user.id }).from(user).where(eq(user.playerId, playerId));
  if (linked) throw new Error("Player ID is already linked to another account");
  await tx.update(user).set({ playerId }).where(eq(user.id, accountId));
});
console.log(`Linked reviewed Player account ${accountId} to Player ${playerId}.`);
process.exit(0);
