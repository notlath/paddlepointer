import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { event } from "./event-schema";
import { tournamentMatch } from "./schedule-schema";

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
  tournamentMatchId: text("tournament_match_id").unique().references(() => tournamentMatch.id),
  playedAt: timestamp("played_at", { withTimezone: true }).defaultNow().notNull(),
  status: text("status").notNull().default("active"),
  targetScore: integer("target_score").notNull().default(11),
  winByTwo: boolean("win_by_two").notNull().default(true),
  firstServer: text("first_server").notNull().default("A"),
  startingRightA: integer("starting_right_a").notNull().default(0),
  startingRightB: integer("starting_right_b").notNull().default(0),
  scoreA: integer("score_a").notNull().default(0),
  scoreB: integer("score_b").notNull().default(0),
  servingTeam: text("serving_team").notNull().default("A"),
  serverNumber: integer("server_number").notNull().default(2),
  serverIndex: integer("server_index").notNull().default(0),
  rightA: integer("right_a").notNull().default(0),
  rightB: integer("right_b").notNull().default(0),
  sideOuts: integer("side_outs").notNull().default(0),
  winner: text("winner"),
  endedEarly: boolean("ended_early").notNull().default(false),
  retiredTeam: text("retired_team"),
  rallyLog: jsonb("rally_log").$type<Record<string, unknown>[]>().notNull().default(sql`'[]'::jsonb`),
  endedAt: timestamp("ended_at", { withTimezone: true }),
}, (table) => [
  check("match_status_valid", sql`${table.status} IN ('active', 'completed')`),
  check("match_target_score_valid", sql`${table.targetScore} BETWEEN 1 AND 99`),
  check("match_teams_valid", sql`${table.firstServer} IN ('A','B') AND ${table.servingTeam} IN ('A','B') AND (${table.winner} IS NULL OR ${table.winner} IN ('A','B'))`),
  check("match_positions_valid", sql`${table.startingRightA} IN (0,1) AND ${table.startingRightB} IN (0,1) AND ${table.rightA} IN (0,1) AND ${table.rightB} IN (0,1) AND ${table.serverIndex} IN (0,1) AND ${table.serverNumber} IN (1,2)`),
  check("match_scores_valid", sql`${table.scoreA} >= 0 AND ${table.scoreB} >= 0 AND ${table.sideOuts} >= 0`),
  check("match_retirement_valid", sql`${table.retiredTeam} IS NULL OR (${table.retiredTeam} IN ('A','B') AND ${table.retiredTeam} <> ${table.winner} AND ${table.endedEarly})`),
]);

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
