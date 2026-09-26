import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { canAccessAccount, currentPrincipal } from "@/server/authorize";
import { db } from "@/server/auth";
import { user } from "@/server/schema";

type Params = { params: Promise<{ id: string }> };

async function ownedAccount(id: string) {
  const principal = await currentPrincipal();
  if (!principal) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
  if (!canAccessAccount(principal, id)) return { error: NextResponse.json({ error: "Access denied" }, { status: 403 }) };
  return { principal };
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const access = await ownedAccount(id);
  if (access.error) return access.error;
  const account = await db.query.user.findFirst({ where: eq(user.id, id) });
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ id, name: account.name, email: account.email, username: account.username, role: account.role });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const access = await ownedAccount(id);
  if (access.error) return access.error;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== "string" || body.name.trim().length < 1 || body.name.length > 100) {
    return NextResponse.json({ error: "A name of 1 to 100 characters is required" }, { status: 400 });
  }
  await db.update(user).set({ name: body.name.trim() }).where(eq(user.id, id));
  return NextResponse.json({ id, name: body.name.trim() });
}
