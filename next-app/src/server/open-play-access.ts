import { NextResponse } from "next/server";
import { currentPrincipal, isStaff } from "./authorize";

export async function staffDenied() {
  const principal = await currentPrincipal();
  if (!principal) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!isStaff(principal.role)) return NextResponse.json({ error: "Staff access required" }, { status: 403 });
  return null;
}
