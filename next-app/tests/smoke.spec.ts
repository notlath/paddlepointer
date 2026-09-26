import { expect, test } from "@playwright/test";

test("the shell and database health are available", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "PaddlePointer" })).toBeVisible();

  const response = await request.get("/api/health");
  if (process.env.SMOKE_BASE_URL) {
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", database: "connected" });
  } else {
    expect([200, 503]).toContain(response.status());
    const body = await response.json();
    expect([
      { status: "ok", database: "connected" },
      { status: "unconfigured", database: "unconfigured" },
      { status: "degraded", database: "unavailable" },
    ]).toContainEqual(body);
  }
});
