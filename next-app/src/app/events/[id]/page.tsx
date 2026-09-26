import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { currentPrincipal } from "@/server/authorize";
import { db } from "@/server/auth";
import { currentEvent, event, tournament } from "@/server/schema";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const principal = await currentPrincipal();
  if (!principal) redirect("/sign-in");
  if (principal.role === "visitor") redirect("/account");
  const { id } = await params;
  const [record] = await db.select({ id: event.id, name: event.name, createdAt: event.createdAt }).from(event).innerJoin(tournament, eq(tournament.eventId, event.id)).where(eq(event.id, id));
  if (!record) notFound();
  const [current] = await db.select({ eventId: currentEvent.eventId }).from(currentEvent).where(eq(currentEvent.singleton, 1));
  return <main>
    <Link href="/events">All Events</Link>
    <h1>{record.name}</h1>
    <p>Status: {record.id === current?.eventId ? "Current Event" : "Past Event"}</p>
    <p>Started: {record.createdAt.toISOString()}</p>
    <p>Event ID: {record.id}</p>
  </main>;
}
