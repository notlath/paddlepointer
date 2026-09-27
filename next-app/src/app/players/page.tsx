import { redirect } from "next/navigation";
import { currentPrincipal, isStaff } from "@/server/authorize";
import { listPlayers } from "@/server/players";
import { PlayerDirectory } from "./player-directory";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const principal = await currentPrincipal();
  if (!principal) redirect("/sign-in");
  if (!isStaff(principal.role)) redirect("/account");
  return <main><h1>Players</h1><PlayerDirectory initialPlayers={await listPlayers()} /></main>;
}
