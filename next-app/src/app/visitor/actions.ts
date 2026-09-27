"use server";

import { currentPrincipal } from "@/server/authorize";
import { changeVisitorMatch, createVisitorMatch } from "@/server/visitor-matches";

async function visitorId() {
  const principal = await currentPrincipal();
  return principal?.role === "visitor" ? principal.id : null;
}

export async function createVisitorMatchAction(names: string[]) {
  const ownerId = await visitorId();
  if (!ownerId) return { error: "Visitor sign-in required", status: 403 };
  return createVisitorMatch(ownerId, names);
}

export async function changeVisitorMatchAction(id: string, action: "rally" | "undo" | "end" | "reset", winner?: "A" | "B") {
  const ownerId = await visitorId();
  if (!ownerId) return { error: "Visitor sign-in required", status: 403 };
  return changeVisitorMatch(ownerId, id, action, winner);
}
