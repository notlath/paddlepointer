import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { currentPrincipal, isStaff } from "@/server/authorize";
import { db } from "@/server/auth";
import { match, matchPlayer, player, user } from "@/server/schema";
import { cleanPlayerName, cleanSkillLevel, findPlayerByName } from "@/server/players";

type Params = { params: Promise<{ id: string }> };

async function staffAccess() {
  const principal = await currentPrincipal();
  if (!principal) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!isStaff(principal.role)) return NextResponse.json({ error: "Staff access required" }, { status: 403 });
  return null;
}

export async function GET(_request: Request, { params }: Params) {
  const denied = await staffAccess();
  if (denied) return denied;
  const { id } = await params;
  const [record] = await db.select({ id: player.id, name: player.name, skillLevel: player.skillLevel, accountId: user.id })
    .from(player).leftJoin(user, eq(user.playerId, player.id)).where(eq(player.id, id));
  if (!record) return NextResponse.json({ error: "Player not found" }, { status: 404 });
  const matches = await db.select({ id: match.id, playedAt: match.playedAt, team: matchPlayer.team })
    .from(matchPlayer).innerJoin(match, eq(match.id, matchPlayer.matchId)).where(eq(matchPlayer.playerId, id));
  return NextResponse.json({ id, name: record.name, skillLevel: record.skillLevel, hasAccount: record.accountId !== null, matches });
}

export async function PATCH(request: Request, { params }: Params) {
  const denied = await staffAccess();
  if (denied) return denied;
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || (!("name" in body) && !("skillLevel" in body))) {
    return NextResponse.json({ error: "A name or skill level is required" }, { status: 400 });
  }
  const [existing] = await db.select({ id: player.id }).from(player).where(eq(player.id, id));
  if (!existing) return NextResponse.json({ error: "Player not found" }, { status: 404 });
  const name = "name" in body ? cleanPlayerName(body.name) : null;
  const skillLevel = "skillLevel" in body ? cleanSkillLevel(body.skillLevel) : undefined;
  if ("name" in body && !name) return NextResponse.json({ error: "A Player name of 1 to 120 characters is required" }, { status: 400 });
  if ("skillLevel" in body && skillLevel === undefined) return NextResponse.json({ error: "Skill level must be Beginner, Intermediate, Advanced, or Unrated" }, { status: 400 });
  if (name) {
    const collision = await findPlayerByName(name);
    if (collision && collision.id !== id) return NextResponse.json({ error: "A Player with this name already exists. Merge the Players instead." }, { status: 409 });
  }
  try {
    await db.update(player).set({ ...(name ? { name } : {}), ...(skillLevel !== undefined ? { skillLevel } : {}) }).where(eq(player.id, id));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "A Player with this name already exists. Merge the Players instead." }, { status: 409 });
    }
    throw error;
  }
  const [updated] = await db.select({ id: player.id, name: player.name, skillLevel: player.skillLevel }).from(player).where(eq(player.id, id));
  return NextResponse.json(updated);
}
