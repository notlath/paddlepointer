import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "./auth";
import { matchPlayer, player, user } from "./schema";

export function cleanPlayerName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/gu, " ");
  return name.length > 0 && name.length <= 120 ? name : null;
}

export function cleanSkillLevel(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const level = value.trim().toLowerCase();
  if (level === "" || level === "unrated") return null;
  return ["beginner", "intermediate", "advanced"].includes(level) ? level : undefined;
}

export async function listPlayers() {
  const rows = await db.select({ id: player.id, name: player.name, skillLevel: player.skillLevel, accountId: user.id })
    .from(player).leftJoin(user, eq(user.playerId, player.id)).orderBy(asc(player.name));
  return rows.map(({ accountId, ...record }) => ({ ...record, hasAccount: accountId !== null }));
}

export async function mergePlayers(survivorId: string, absorbedId: string) {
  if (survivorId === absorbedId) return { error: "A Player cannot be merged into themselves", status: 400 };
  return db.transaction(async (tx) => {
    const players = await tx.select().from(player).where(inArray(player.id, [survivorId, absorbedId])).orderBy(asc(player.id)).for("update");
    const survivor = players.find((item) => item.id === survivorId);
    const absorbed = players.find((item) => item.id === absorbedId);
    if (!survivor || !absorbed) return { error: "Player not found", status: 404 };
    const linked = await tx.select({ playerId: user.playerId }).from(user).where(inArray(user.playerId, [survivorId, absorbedId]));
    if (linked.length > 1) return { error: "Both Players have linked accounts. Unlink one first.", status: 409 };
    const sameMatch = await tx.select({ matchId: matchPlayer.matchId }).from(matchPlayer)
      .where(and(eq(matchPlayer.playerId, survivorId), inArray(matchPlayer.matchId,
        tx.select({ matchId: matchPlayer.matchId }).from(matchPlayer).where(eq(matchPlayer.playerId, absorbedId)))))
      .limit(1);
    if (sameMatch.length) return { error: "Both Players appear in the same Match", status: 409 };
    if (!survivor.skillLevel && absorbed.skillLevel) await tx.update(player).set({ skillLevel: absorbed.skillLevel }).where(eq(player.id, survivorId));
    await tx.update(user).set({ playerId: survivorId }).where(eq(user.playerId, absorbedId));
    await tx.update(matchPlayer).set({ playerId: survivorId }).where(eq(matchPlayer.playerId, absorbedId));
    await tx.delete(player).where(eq(player.id, absorbedId));
    return { id: survivorId, name: survivor.name, skillLevel: survivor.skillLevel ?? absorbed.skillLevel, status: 200 };
  });
}

export async function createPlayer(name: string) {
  const [created] = await db.insert(player).values({ id: randomUUID(), name }).onConflictDoNothing().returning({ id: player.id, name: player.name });
  return created ?? null;
}

export async function findPlayerByName(name: string) {
  const [record] = await db.select({ id: player.id }).from(player).where(eq(player.normalizedName, sql`lower(${name})`));
  return record ?? null;
}
