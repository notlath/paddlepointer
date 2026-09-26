import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth";

const handlers = toNextJsHandler(auth);
const unavailable = () => new Response(JSON.stringify({ error: "Authentication is not configured" }), { status: 503, headers: { "content-type": "application/json" } });

export const GET: typeof handlers.GET = async (request) => process.env.BETTER_AUTH_SECRET ? handlers.GET(request) : unavailable();
export const POST: typeof handlers.POST = async (request) => process.env.BETTER_AUTH_SECRET ? handlers.POST(request) : unavailable();
