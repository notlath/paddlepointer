import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const event = pgTable("event", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tournament = pgTable("tournament", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().unique().references(() => event.id),
});

export const currentEvent = pgTable("current_event", {
  singleton: integer("singleton").primaryKey(),
  eventId: text("event_id").notNull().references(() => event.id),
});

export * from "./auth-schema";
