import { NextResponse } from "next/server";
import { readLiveBoard } from "@/server/live-board";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readLiveBoard(), { headers: { "Cache-Control": "no-store" } });
}
