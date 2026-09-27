import { check, pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const event = pgTable("event", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tournament = pgTable("tournament", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().unique().references(() => event.id),
  courts: integer("courts").notNull().default(1),
  matchesPerPlayer: integer("matches_per_player").notNull().default(3),
  targetScore: integer("target_score").notNull().default(11),
  transitionMinutes: integer("transition_minutes").notNull().default(2),
}, (table) => [
  check("tournament_courts_valid", sql`${table.courts} BETWEEN 1 AND 16`),
  check("tournament_matches_per_player_valid", sql`${table.matchesPerPlayer} BETWEEN 1 AND 30`),
  check("tournament_target_score_valid", sql`${table.targetScore} BETWEEN 1 AND 99`),
  check("tournament_transition_minutes_valid", sql`${table.transitionMinutes} BETWEEN 0 AND 20`),
]);

export const currentEvent = pgTable("current_event", {
  singleton: integer("singleton").primaryKey(),
  eventId: text("event_id").notNull().references(() => event.id),
});

export const eventRevision = pgTable("event_revision", {
  eventId: text("event_id").primaryKey().references(() => event.id),
  revision: integer("revision").notNull().default(0),
  lastTxid: text("last_txid").notNull(),
});
