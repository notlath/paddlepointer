import { NextResponse } from "next/server";
import { currentPrincipal } from "@/server/authorize";
import { cleanPlayerName, createPlayer, findPlayerByName, listPlayers } from "@/server/players";

async function staffAccess() {
  const principal = await currentPrincipal();
  if (!principal) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (principal.role === "visitor") return NextResponse.json({ error: "Staff access required" }, { status: 403 });
  return null;
}

export async function GET(request: Request) {
  const denied = await staffAccess();
  if (denied) return denied;
  const query = new URL(request.url).searchParams.get("q")?.trim().toLocaleLowerCase() ?? "";
  const players = await listPlayers();
  return NextResponse.json({ players: query ? players.filter((item) => item.name.toLocaleLowerCase().includes(query)) : players });
}

export async function POST(request: Request) {
  const denied = await staffAccess();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const name = cleanPlayerName(body?.name);
  if (!name) return NextResponse.json({ error: "A Player name of 1 to 120 characters is required" }, { status: 400 });
  const created = await createPlayer(name);
  if (!created) return NextResponse.json({ error: "A Player with this name already exists", existing: await findPlayerByName(name) }, { status: 409 });
  return NextResponse.json(created, { status: 201 });
}
