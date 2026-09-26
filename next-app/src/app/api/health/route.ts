import { sql } from "drizzle-orm";
import { database } from "@/server/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  let connection: ReturnType<typeof database> = null;
  try {
    connection = database();
    if (!connection) {
      return Response.json({ status: "unconfigured", database: "unconfigured" }, { status: 503 });
    }
    await connection.db.execute(sql`select 1`);
    return Response.json({ status: "ok", database: "connected" });
  } catch {
    return Response.json({ status: "degraded", database: "unavailable" }, { status: 503 });
  } finally {
    await connection?.client.end();
  }
}
