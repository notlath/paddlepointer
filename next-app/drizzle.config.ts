import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DIRECT_DATABASE_URL ?? "" },
});
