import { integer, pgTable, text } from "drizzle-orm/pg-core";

export const qlikReloadPending = pgTable("qlik_reload_pending", {
  singleton: integer("singleton").primaryKey(),
  marker: text("marker").notNull(),
});
