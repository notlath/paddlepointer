import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { currentPrincipal } from "@/server/authorize";
import { db } from "@/server/auth";
import { currentEvent, event, tournament } from "@/server/schema";
import { StartEvent } from "./start-event";
import Link from "next/link";

export default async function EventsPage() {
  const principal = await currentPrincipal();
  if (!principal) redirect("/sign-in");
  if (principal.role === "visitor") redirect("/account");
  const [events, current] = await Promise.all([
    db.select({ id: event.id, name: event.name, createdAt: event.createdAt }).from(event).innerJoin(tournament, eq(tournament.eventId, event.id)).orderBy(desc(event.createdAt), desc(event.id)),
    db.select({ eventId: currentEvent.eventId }).from(currentEvent).where(eq(currentEvent.singleton, 1)),
  ]);
  const currentId = current[0]?.eventId;
  return <main>
    <h1>Events</h1>
    <p>Current Event: {events.find((item) => item.id === currentId)?.name ?? "None"}</p>
    {principal.role === "super_admin" && <StartEvent />}
    <h2>Event history</h2>
    <ul>{events.map((item) => <li key={item.id}><Link href={`/events/${item.id}`}>{item.name}</Link> — {item.createdAt.toISOString().slice(0, 10)} — {item.id} {item.id === currentId ? "(Current)" : "(Past)"}</li>)}</ul>
  </main>;
}
