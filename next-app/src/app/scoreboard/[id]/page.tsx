import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentPrincipal } from "@/server/authorize";
import { readScoreboard } from "@/server/scoreboard";
import { Scoreboard } from "./scoreboard";

export const dynamic = "force-dynamic";

export default async function ScoreboardPage({ params }: { params: Promise<{ id: string }> }) {
  const principal = await currentPrincipal();
  if (!principal) redirect("/sign-in");
  if (principal.role === "visitor") redirect("/account");
  const { id } = await params;
  const state = await readScoreboard(id);
  if (!state) notFound();
  return <main><Link href="/open-play">Open Play Schedule</Link><Scoreboard initial={state} /></main>;
}
