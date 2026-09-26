import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { currentPrincipal } from "@/server/authorize";
import { db } from "@/server/auth";
import { currentEvent, event, tournament } from "@/server/schema";

export async function GET() {
  const principal = await currentPrincipal();
  if (!principal) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (principal.role === "visitor") return NextResponse.json({ error: "Staff access required" }, { status: 403 });
  const [events, current] = await Promise.all([
    db.select({ id: event.id, name: event.name, createdAt: event.createdAt }).from(event).innerJoin(tournament, eq(tournament.eventId, event.id)).orderBy(desc(event.createdAt), desc(event.id)),
    db.select({ eventId: currentEvent.eventId }).from(currentEvent).where(eq(currentEvent.singleton, 1)),
  ]);
  return NextResponse.json({ currentEventId: current[0]?.eventId ?? null, events });
}

export async function POST(request: Request) {
  const principal = await currentPrincipal();
  if (!principal) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (principal.role !== "super_admin") return NextResponse.json({ error: "Super Admin access required" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 100) return NextResponse.json({ error: "An Event name of 1 to 100 characters is required" }, { status: 400 });
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(event).values({ id, name });
    await tx.insert(tournament).values({ id, eventId: id });
    await tx.insert(currentEvent).values({ singleton: 1, eventId: id }).onConflictDoUpdate({ target: currentEvent.singleton, set: { eventId: id } });
  });
  return NextResponse.json({ id, name, currentEventId: id }, { status: 201 });
}
