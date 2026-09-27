import { defineConfig } from "@playwright/test";

const baseURL = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";

if (!process.env.SMOKE_BASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:37999";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "live-board-test-key";
}

export default defineConfig({
  workers: 1,
  use: {
    baseURL,
    extraHTTPHeaders: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
      : undefined,
  },
  webServer: process.env.SMOKE_BASE_URL
    ? undefined
    : {
        command: "bun run dev --hostname 127.0.0.1",
        url: baseURL,
        timeout: 60_000,
        reuseExistingServer: !process.env.CI,
      },
});
