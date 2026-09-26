import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth, db, STAFF_SESSION_SECONDS } from "./auth";
import { session as sessions, user as users } from "./schema";

export type Role = "visitor" | "admin" | "super_admin";

export async function currentPrincipal() {
  if (!process.env.BETTER_AUTH_SECRET || !process.env.DATABASE_URL) return null;
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result) return null;
  const [account, session] = await Promise.all([
    db.query.user.findFirst({ where: eq(users.id, result.user.id) }),
    db.query.session.findFirst({ where: eq(sessions.id, result.session.id) }),
  ]);
  if (!account || !session || !account.isActive || !account.emailVerified || session.expiresAt <= new Date()) return null;
  if (!["visitor", "admin", "super_admin"].includes(account.role)) return null;
  const role = account.role as Role;
  if (role !== "visitor" && session.expiresAt.getTime() - Date.now() < 6 * 60 * 60 * 1000) {
    await db.update(sessions).set({ expiresAt: new Date(Date.now() + STAFF_SESSION_SECONDS * 1000) }).where(eq(sessions.id, session.id));
  }
  return { id: account.id, role, email: account.email, username: account.username, name: account.name };
}

export function canAccessAccount(principal: NonNullable<Awaited<ReturnType<typeof currentPrincipal>>>, accountId: string) {
  return principal.id === accountId;
}
