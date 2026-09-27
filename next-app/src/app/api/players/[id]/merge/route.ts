import { NextResponse } from "next/server";
import { currentPrincipal, isStaff } from "@/server/authorize";
import { mergePlayers } from "@/server/players";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const principal = await currentPrincipal();
  if (!principal) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!isStaff(principal.role)) return NextResponse.json({ error: "Staff access required" }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (typeof body?.absorbedId !== "string" || body.confirm !== "MERGE") {
    return NextResponse.json({ error: "Confirm the irreversible Merge with MERGE" }, { status: 400 });
  }
  const result = await mergePlayers(id, body.absorbedId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ survivor: result });
}
