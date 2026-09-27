import { NextResponse } from "next/server";
import { currentPrincipal } from "./authorize";

export async function staffDenied() {
  const principal = await currentPrincipal();
  if (!principal) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (principal.role === "visitor") return NextResponse.json({ error: "Staff access required" }, { status: 403 });
  return null;
}
