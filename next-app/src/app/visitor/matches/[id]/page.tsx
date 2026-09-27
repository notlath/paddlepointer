import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentPrincipal } from "@/server/authorize";
import { readVisitorMatch } from "@/server/visitor-matches";
import { VisitorScoreboard } from "./visitor-scoreboard";

export const dynamic = "force-dynamic";

export default async function VisitorMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const principal = await currentPrincipal();
  if (!principal) redirect("/sign-in");
  if (principal.role !== "visitor") redirect("/staff");
  const { id } = await params;
  const game = await readVisitorMatch(principal.id, id);
  if (!game) notFound();
  return <main><p><Link href="/visitor">Visitor Match History</Link></p><VisitorScoreboard initial={game} /></main>;
}
