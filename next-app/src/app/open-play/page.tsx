import { currentPrincipal } from "@/server/authorize";
import { readOpenPlay } from "@/server/open-play";
import { listPlayers } from "@/server/players";
import Link from "next/link";
import { redirect } from "next/navigation";
import { OpenPlayWorkspace } from "./workspace";

export const dynamic = "force-dynamic";

export default async function OpenPlayPage() {
  const principal = await currentPrincipal();
  if (!principal) redirect("/sign-in");
  if (principal.role === "visitor") redirect("/account");
  const [record, players] = await Promise.all([readOpenPlay(), listPlayers()]);
  return (
    <main>
      <Link href="/staff">Staff workspace</Link>
      <h1>Open Play Schedule</h1>
      {record ? (
        <OpenPlayWorkspace initial={record} players={players} />
      ) : (
        <p>Start an Event before configuring Open Play.</p>
      )}
    </main>
  );
}
