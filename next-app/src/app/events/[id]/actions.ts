"use server";

import { currentPrincipal } from "@/server/authorize";
import { clearTournamentResults, readEventOperations, removeTournamentMatch, resetMatchResult, resetTournament } from "@/server/match-operations";
import { correctMatchResult } from "@/server/scoreboard";

export async function eventMatchAction(eventId: string, operation: string, slotId?: string, result?: { scoreA: number; scoreB: number; winner: string; retiredTeam: string | null }) {
  const principal = await currentPrincipal();
  if (!principal) return { error: "Sign in required", status: 401 };
  if (principal.role !== "super_admin") return { error: "Super Admin access required", status: 403 };
  let changed: { ok: true } | { error: string; status: number };
  if (operation === "correct" && slotId && result) changed = await correctMatchResult(eventId, slotId, result.scoreA, result.scoreB, result.winner, result.retiredTeam);
  else if (operation === "reset-result" && slotId) changed = await resetMatchResult(eventId, slotId);
  else if (operation === "remove" && slotId) changed = await removeTournamentMatch(eventId, slotId);
  else if (operation === "clear-results") changed = await clearTournamentResults(eventId);
  else if (operation === "reset-tournament") changed = await resetTournament(eventId);
  else return { error: "Unknown Match operation", status: 400 };
  if ("error" in changed) return changed;
  return (await readEventOperations(eventId)) ?? { error: "Event not found", status: 404 };
}
