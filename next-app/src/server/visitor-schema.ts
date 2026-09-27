import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import type { Game } from "./rally";

export const visitorMatch = pgTable("visitor_match", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => user.id),
  game: jsonb("game").$type<Game>().notNull(),
  status: text("status").notNull().default("active"),
  playedAt: timestamp("played_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
}, (table) => [
  index("visitor_match_owner_played_idx").on(table.ownerId, table.playedAt),
  check("visitor_match_status_valid", sql`${table.status} IN ('active', 'completed')`),
]);
