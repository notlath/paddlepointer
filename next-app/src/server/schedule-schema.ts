import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, pgTable, primaryKey, text, uniqueIndex } from "drizzle-orm/pg-core";
import { tournament } from "./event-schema";
import { player } from "./player-schema";

export const tournamentPlayer = pgTable("tournament_player", {
  tournamentId: text("tournament_id").notNull().references(() => tournament.id),
  playerId: text("player_id").notNull().references(() => player.id),
  available: boolean("available").notNull().default(true),
}, (table) => [primaryKey({ columns: [table.tournamentId, table.playerId] }), index("tournament_player_player_idx").on(table.playerId)]);

export const tournamentRound = pgTable("tournament_round", {
  id: text("id").primaryKey(),
  tournamentId: text("tournament_id").notNull().references(() => tournament.id),
  number: integer("number").notNull(),
}, (table) => [
  uniqueIndex("tournament_round_number_unique").on(table.tournamentId, table.number),
  uniqueIndex("tournament_round_id_tournament_unique").on(table.id, table.tournamentId),
  check("tournament_round_number_valid", sql`${table.number} > 0`),
]);

export const tournamentMatch = pgTable("tournament_match", {
  id: text("id").primaryKey(),
  tournamentId: text("tournament_id").notNull().references(() => tournament.id),
  roundId: text("round_id").notNull().references(() => tournamentRound.id),
  court: integer("court").notNull(),
  status: text("status").notNull().default("scheduled"),
}, (table) => [
  uniqueIndex("tournament_match_round_court_unique").on(table.roundId, table.court),
  uniqueIndex("tournament_match_id_round_unique").on(table.id, table.roundId),
  foreignKey({ columns: [table.roundId, table.tournamentId], foreignColumns: [tournamentRound.id, tournamentRound.tournamentId], name: "tournament_match_round_tournament_fk" }),
  index("tournament_match_tournament_idx").on(table.tournamentId),
  check("tournament_match_court_valid", sql`${table.court} > 0`),
  check("tournament_match_status_valid", sql`${table.status} IN ('scheduled', 'in_progress', 'completed')`),
]);

export const tournamentMatchPlayer = pgTable("tournament_match_player", {
  matchId: text("match_id").notNull().references(() => tournamentMatch.id),
  roundId: text("round_id").notNull().references(() => tournamentRound.id),
  playerId: text("player_id").notNull().references(() => player.id),
  team: text("team").notNull(),
  position: integer("position").notNull(),
}, (table) => [
  primaryKey({ columns: [table.matchId, table.playerId] }),
  uniqueIndex("tournament_match_player_slot_unique").on(table.matchId, table.team, table.position),
  uniqueIndex("tournament_match_player_round_unique").on(table.roundId, table.playerId),
  foreignKey({ columns: [table.matchId, table.roundId], foreignColumns: [tournamentMatch.id, tournamentMatch.roundId], name: "tournament_match_player_match_round_fk" }),
  index("tournament_match_player_player_idx").on(table.playerId),
  check("tournament_match_player_team_valid", sql`${table.team} IN ('A', 'B')`),
  check("tournament_match_player_position_valid", sql`${table.position} IN (1, 2)`),
]);
