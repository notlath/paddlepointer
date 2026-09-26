import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { event } from "./event-schema";

export const player = pgTable("player", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").generatedAlwaysAs(sql`lower(name)`),
  skillLevel: text("skill_level"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("player_normalized_name_unique").on(table.normalizedName),
  check("player_name_valid", sql`length(${table.name}) BETWEEN 1 AND 120 AND ${table.name} = btrim(${table.name})`),
  check("player_skill_valid", sql`${table.skillLevel} IS NULL OR ${table.skillLevel} IN ('beginner', 'intermediate', 'advanced')`),
]);

export const match = pgTable("match", {
  id: text("id").primaryKey(),
  eventId: text("event_id").references(() => event.id),
  playedAt: timestamp("played_at", { withTimezone: true }).defaultNow().notNull(),
});

export const matchPlayer = pgTable("match_player", {
  matchId: text("match_id").notNull().references(() => match.id),
  playerId: text("player_id").notNull().references(() => player.id),
  team: text("team").notNull(),
  position: integer("position").notNull(),
}, (table) => [
  primaryKey({ columns: [table.matchId, table.playerId] }),
  uniqueIndex("match_player_slot_unique").on(table.matchId, table.team, table.position),
  index("match_player_player_idx").on(table.playerId),
  check("match_player_team_valid", sql`${table.team} IN ('A', 'B')`),
  check("match_player_position_valid", sql`${table.position} IN (1, 2)`),
]);
