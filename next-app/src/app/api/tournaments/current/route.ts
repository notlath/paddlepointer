import { NextResponse } from "next/server";
import { staffDenied } from "@/server/open-play-access";
import { readOpenPlay } from "@/server/open-play";

export async function GET() {
  const denied = await staffDenied();
  if (denied) return denied;
  const record = await readOpenPlay();
  if (!record) return NextResponse.json({ error: "Start an Event first" }, { status: 404 });
  return NextResponse.json(record);
}
