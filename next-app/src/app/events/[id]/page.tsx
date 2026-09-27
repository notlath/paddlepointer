import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { currentPrincipal, isStaff } from "@/server/authorize";
import { readEventOperations } from "@/server/match-operations";
import { MatchOperations } from "./match-operations";

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const principal = await currentPrincipal();
  if (!principal) redirect("/sign-in");
  if (!isStaff(principal.role)) redirect("/account");
  const { id } = await params;
  const record = await readEventOperations(id);
  if (!record) notFound();
  return <main>
    <Link href="/events">All Events</Link>
    <h1>{record.name}</h1>
    <p>Status: {record.isCurrent ? "Current Event" : "Past Event"}</p>
    <p>Started: {record.createdAt}</p>
    <p>Event ID: {record.id}</p>
    <MatchOperations initial={record} canManage={principal.role === "super_admin"} />
  </main>;
}
