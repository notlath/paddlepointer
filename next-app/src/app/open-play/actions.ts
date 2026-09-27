"use server";

import { currentPrincipal } from "@/server/authorize";
import { adjustMatch, generateSchedule, readOpenPlay, saveSetup, validateAdjustment, validateSetup } from "@/server/open-play";

async function denied() {
  const principal = await currentPrincipal();
  if (!principal) return { error: "Sign in required", status: 401 };
  if (principal.role === "visitor") return { error: "Staff access required", status: 403 };
  return null;
}

async function updatedSchedule() {
  return (await readOpenPlay()) ?? { error: "Start an Event first", status: 404 };
}

export async function saveSetupAction(body: unknown) {
  const refusal = await denied();
  if (refusal) return refusal;
  const input = validateSetup(body);
  if ("error" in input) return input;
  const result = await saveSetup(input);
  if ("error" in result) return result;
  return updatedSchedule();
}

export async function generateScheduleAction() {
  const refusal = await denied();
  if (refusal) return refusal;
  const result = await generateSchedule();
  if ("error" in result) return result;
  return updatedSchedule();
}

export async function adjustMatchAction(id: string, body: unknown) {
  const refusal = await denied();
  if (refusal) return refusal;
  const input = validateAdjustment(body);
  if ("error" in input) return input;
  const result = await adjustMatch(id, input);
  if ("error" in result) return result;
  return updatedSchedule();
}
