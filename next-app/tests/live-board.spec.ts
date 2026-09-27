import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const databaseURL = process.env.DATABASE_URL;
test.skip(!databaseURL || !databaseURL.includes("127.0.0.1"), "Requires a disposable local database");
const sql = databaseURL ? postgres(databaseURL, { prepare: false }) : null;

async function fixture() {
  const eventId = randomUUID();
  await sql!`insert into event (id, name) values (${eventId}, ${`Public Live ${eventId.slice(0, 6)}`})`;
  await sql!`insert into tournament (id, event_id, courts) values (${eventId}, ${eventId}, 2)`;
  await sql!`insert into current_event (singleton, event_id) values (1, ${eventId}) on conflict (singleton) do update set event_id = excluded.event_id`;
  const ids: string[] = [];
  for (let round = 1; round <= 2; round++) {
    const roundId = randomUUID();
    await sql!`insert into tournament_round (id, tournament_id, number) values (${roundId}, ${eventId}, ${round})`;
    for (let court = 1; court <= 2; court++) {
      const id = randomUUID();
      ids.push(id);
      const status = round === 1 ? court === 1 ? "in_progress" : "completed" : "scheduled";
      await sql!`insert into tournament_match (id, tournament_id, round_id, court, status) values (${id}, ${eventId}, ${roundId}, ${court}, ${status})`;
      for (let position = 0; position < 4; position++) {
        const playerId = randomUUID();
        await sql!`insert into player (id, name, skill_level) values (${playerId}, ${`Public Player ${round}${court}${position} ${eventId.slice(0, 6)}`}, 'advanced')`;
        await sql!`insert into tournament_match_player (match_id, round_id, player_id, team, position) values (${id}, ${roundId}, ${playerId}, ${position < 2 ? "A" : "B"}, ${position % 2 + 1})`;
      }
      if (status !== "scheduled") await sql!`insert into "match" (id, event_id, tournament_match_id, status, score_a, score_b, winner, ended_at) values (${randomUUID()}, ${eventId}, ${id}, ${status === "completed" ? "completed" : "active"}, 5, 3, ${status === "completed" ? "A" : null}, ${status === "completed" ? new Date() : null})`;
    }
  }
  return { eventId, currentId: ids[0], completedId: ids[1] };
}

test("public Live Board shows court phases without private fields or scorer controls and refreshes by polling", async ({ page, request }) => {
  const { currentId } = await fixture();
  const response = await request.get("/api/live-board");
  expect(response.ok()).toBe(true);
  const payload = await response.json();
  expect(payload.courts).toHaveLength(2);
  expect(payload.courts[0].current.scoreA).toBe(5);
  expect(payload.courts[0].next.round).toBe(2);
  expect(payload.courts[1].completed.winner).toBe("A");
  expect(JSON.stringify(payload)).not.toMatch(/skillLevel|email|username|visitor|rallyLog|serverIndex/i);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/live-board");
  await expect(page.getByRole("heading", { name: "Live Board" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Court 1" }).getByText(/Public Player 110/)).toBeVisible();
  await expect(page.getByRole("article", { name: "Court 2" }).getByText("Team A won")).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await sql!`update "match" set score_a = 6 where tournament_match_id = ${currentId}`;
  const currentScore = page.getByRole("article", { name: "Court 1" }).getByRole("heading", { name: "Current" }).locator("..").getByLabel("Team A score");
  await expect(currentScore).toHaveText("6", { timeout: 10000 });
  await page.route("**/api/live-board", (route) => route.abort());
  await expect(page.getByRole("status")).toContainText("last known", { timeout: 10000 });
  await page.unroute("**/api/live-board");
  await sql!`update "match" set score_a = 7 where tournament_match_id = ${currentId}`;
  await expect(currentScore).toHaveText("7", { timeout: 10000 });
  await expect(page.getByRole("status")).toContainText("Refreshing automatically");
});

test("Broadcast notice refetches public data immediately and reconnect refreshes missed changes", async ({ page }) => {
  const { eventId, currentId } = await fixture();
  await sql!.unsafe("CREATE SCHEMA IF NOT EXISTS realtime");
  await sql!.unsafe("CREATE TABLE IF NOT EXISTS realtime.test_messages (id bigserial PRIMARY KEY, payload jsonb NOT NULL, event text NOT NULL, topic text NOT NULL, is_private boolean NOT NULL)");
  await sql!.unsafe(`CREATE OR REPLACE FUNCTION realtime.send(payload jsonb, event text, topic text, is_private boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN INSERT INTO realtime.test_messages (payload, event, topic, is_private) VALUES (payload, event, topic, is_private); END; $$`);
  let socket: import("@playwright/test").WebSocketRoute | null = null;
  let joins = 0;
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (route) => {
    socket = route;
    route.onMessage((raw) => {
      const [joinRef, ref, topic, event] = JSON.parse(String(raw));
      if (event === "phx_join") {
        joins++;
        route.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response: { postgres_changes: [] } }]));
      } else if (event === "heartbeat") {
        route.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status: "ok", response: {} }]));
      }
    });
  });
  await page.goto("/live-board");
  const currentScore = page.getByRole("article", { name: "Court 1" }).getByRole("heading", { name: "Current" }).locator("..").getByLabel("Team A score");
  await expect(page.getByRole("status")).toContainText("Live updates connected", { timeout: 10000 });
  expect(joins).toBe(2);
  const before = (await sql!`select revision from event_revision where event_id = ${eventId}`)[0].revision;
  await sql!.begin(async (tx) => {
    await tx`update "match" set score_a = 8 where tournament_match_id = ${currentId}`;
    await tx`update tournament_match set status = 'in_progress' where id = ${currentId}`;
  });
  const revision = (await sql!`select revision from event_revision where event_id = ${eventId}`)[0].revision;
  expect(revision).toBe(before + 1);
  const notices = await sql!`select payload, event, topic, is_private from realtime.test_messages where topic = ${`event:${eventId}`} order by id`;
  expect(notices).toHaveLength(1);
  expect(notices[0]).toMatchObject({ payload: { eventId, revision }, event: "changed", topic: `event:${eventId}`, is_private: false });
  expect(Object.keys(notices[0].payload).sort()).toEqual(["eventId", "revision"]);
  socket!.send(JSON.stringify([null, null, `realtime:event:${eventId}`, "broadcast", { event: "changed", payload: { eventId, revision } }]));
  await expect(currentScore).toHaveText("8", { timeout: 3000 });
  socket!.close();
  await expect(page.getByRole("status")).toContainText("Refreshing automatically", { timeout: 10000 });
  await sql!`update "match" set score_a = 9 where tournament_match_id = ${currentId}`;
  await expect(currentScore).toHaveText("9", { timeout: 10000 });
  await expect(page.getByRole("status")).toContainText("Live updates connected", { timeout: 15000 });
  const nextEvent = randomUUID();
  await sql!`insert into event (id, name) values (${nextEvent}, 'Next public event')`;
  await sql!`insert into tournament (id, event_id) values (${nextEvent}, ${nextEvent})`;
  await sql!`update current_event set event_id = ${nextEvent} where singleton = 1`;
  const switches = await sql!`select payload, event, topic, is_private from realtime.test_messages where event = 'current-event-changed' order by id desc limit 1`;
  expect(switches[0]).toMatchObject({ payload: { eventId: nextEvent }, topic: "live-board", is_private: false });
  socket!.send(JSON.stringify([null, null, "realtime:live-board", "broadcast", { event: "current-event-changed", payload: { eventId: nextEvent } }]));
  await expect(page.getByText("Next public event")).toBeVisible({ timeout: 3000 });
});
