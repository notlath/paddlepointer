import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export function database() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const client = postgres(url, { max: 1, prepare: false, connect_timeout: 5 });
  return { client, db: drizzle(client) };
}
