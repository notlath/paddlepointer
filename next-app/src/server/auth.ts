import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP, username } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { sendMail } from "./mail";

export const PASSWORD_SESSION_SECONDS = 12 * 60 * 60;
export const VISITOR_SESSION_SECONDS = 30 * 24 * 60 * 60;
const client = postgres(process.env.DATABASE_URL ?? "postgres://localhost:5432/unconfigured", {
  max: 1,
  prepare: false,
});
export const db = drizzle(client, { schema });

function bodyEmail(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("email" in body)) return null;
  const email = (body as { email: unknown }).email;
  return typeof email === "string" ? email.trim().toLowerCase() : null;
}

function bodyUsername(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("username" in body)) return null;
  const username = (body as { username: unknown }).username;
  return typeof username === "string" ? username.trim().toLowerCase() : null;
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  secret: process.env.BETTER_AUTH_SECRET ?? "build-only-secret-not-valid-for-requests",
  baseURL: process.env.BETTER_AUTH_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"),
  trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",").map((origin) => origin.trim()),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => sendMail(user.email, "Reset your PaddlePointer password", `Open this link to reset your password: ${url}`),
    onPasswordReset: async ({ user }) => {
      await db.delete(schema.session).where(eq(schema.session.userId, user.id));
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => sendMail(user.email, "Verify your PaddlePointer email", `Open this link to verify your email: ${url}`),
  },
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "visitor", input: false },
      isActive: { type: "boolean", defaultValue: true, input: false },
    },
  },
  session: { expiresIn: VISITOR_SESSION_SECONDS, updateAge: VISITOR_SESSION_SECONDS },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const user = await db.query.user.findFirst({ where: eq(schema.user.id, session.userId) });
          if (!user || !user.isActive || !user.emailVerified || !["visitor", "player", "admin", "super_admin"].includes(user.role)) {
            throw new APIError("FORBIDDEN");
          }
          return {
            data: {
              ...session,
              expiresAt: new Date(Date.now() + (user.role === "visitor" ? VISITOR_SESSION_SECONDS : PASSWORD_SESSION_SECONDS) * 1000),
            },
          };
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email" || ctx.path === "/sign-in/email") throw new APIError("FORBIDDEN");
      if (ctx.path === "/sign-in/username") {
        const username = bodyUsername(ctx.body);
        const existing = username ? await db.query.user.findFirst({ where: eq(schema.user.username, username) }) : null;
        if (!existing || !["player", "admin", "super_admin"].includes(existing.role) || !existing.isActive || !existing.emailVerified) {
          throw new APIError("FORBIDDEN");
        }
      }
      if (ctx.path === "/request-password-reset") {
        const email = bodyEmail(ctx.body);
        const existing = email ? await db.query.user.findFirst({ where: eq(schema.user.email, email) }) : null;
        if (!existing || !["player", "admin", "super_admin"].includes(existing.role) || !existing.isActive) {
          throw new APIError("FORBIDDEN");
        }
      }
      if (ctx.path === "/set-password") throw new APIError("FORBIDDEN");
      if (ctx.path === "/email-otp/send-verification-otp" || ctx.path === "/sign-in/email-otp") {
        const email = bodyEmail(ctx.body);
        if (!email) throw new APIError("BAD_REQUEST");
        if (ctx.path === "/email-otp/send-verification-otp" && (ctx.body as { type?: string }).type !== "sign-in") {
          throw new APIError("FORBIDDEN");
        }
        const existing = await db.query.user.findFirst({ where: eq(schema.user.email, email) });
        if (existing && (existing.role !== "visitor" || !existing.isActive)) throw new APIError("FORBIDDEN");
      }
    }),
  },
  plugins: [
    username(),
    emailOTP({
      expiresIn: 5 * 60,
      allowedAttempts: 3,
      storeOTP: "hashed",
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (type !== "sign-in") throw new APIError("FORBIDDEN");
        await sendMail(email, "Your PaddlePointer sign-in code", `Your sign-in code is ${otp}. It expires in 5 minutes.`);
      },
    }),
  ],
});
