"use server";

import { currentPrincipal, isStaff } from "@/server/authorize";
import { changeMatch, readScoreboard, startMatch } from "@/server/scoreboard";

async function allowed() {
  const principal = await currentPrincipal();
  if (!principal) return { error: "Sign in required", status: 401 };
  if (!isStaff(principal.role)) return { error: "Staff access required", status: 403 };
  return null;
}

export async function startMatchAction(id: string, firstServer: unknown, rightA: unknown, rightB: unknown) {
  const refusal = await allowed();
  if (refusal) return refusal;
  const result = await startMatch(id, firstServer, rightA, rightB);
  if ("error" in result) return result;
  return (await readScoreboard(id)) ?? { error: "Tournament Match not found", status: 404 };
}

export async function changeMatchAction(id: string, action: "rally" | "undo" | "end" | "reset-active", winner?: unknown) {
  const refusal = await allowed();
  if (refusal) return refusal;
  const result = await changeMatch(id, action, winner);
  if ("error" in result) return result;
  return (await readScoreboard(id)) ?? { error: "Tournament Match not found", status: 404 };
}
