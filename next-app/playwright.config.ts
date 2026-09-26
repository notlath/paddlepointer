import { defineConfig } from "@playwright/test";

const baseURL = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  use: { baseURL },
  webServer: process.env.SMOKE_BASE_URL
    ? undefined
    : {
        command: "bun run dev --hostname 127.0.0.1",
        url: baseURL,
        timeout: 60_000,
        reuseExistingServer: !process.env.CI,
      },
});
