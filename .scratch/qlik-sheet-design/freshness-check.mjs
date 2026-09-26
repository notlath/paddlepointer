// Is Qlik showing every finished game? Compares the finished matches PaddlePoint serves to
// Qlik's REST connector right now with what the Qlik engine holds. Exit 1 = Qlik is stale.
// usage: node .scratch/qlik-sheet-design/freshness-check.mjs   (reads .env and the tenant API key)
import { readFileSync } from "node:fs";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // Herd's local CA
const root = new URL("../../", import.meta.url);
const env = (n) => readFileSync(new URL(".env", root), "utf8").split(/\r?\n/).find((l) => l.startsWith(n + "="))?.slice(n.length + 1).trim().replace(/^["']|["']$/g, "");
const HOST = "mtcmarketing.sg.qlikcloud.com", APP = "17ca2f54-46de-426c-9895-48f6c51513a3";

const local = await (await fetch("https://paddlepoint.test/api/qlik/get-leaderboard-results.php", { headers: { "X-Analytics-Key": env("ANALYTICS_KEY") } })).json();
const localIds = new Set(local.rows.map((r) => r.matchId));

const token = readFileSync(new URL(".scratch/qlik-event-dashboard/qlik_token.txt", root), "utf8").trim();
const ws = new WebSocket(`wss://${HOST}/app/${APP}`, { headers: { Authorization: `Bearer ${token}` } });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); pending.delete(m.id); };
const call = (handle, method, params = {}) => new Promise((res, rej) => { pending.set(++id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ jsonrpc: "2.0", id, handle, method, params })); });
await new Promise((r) => (ws.onopen = r));
const doc = (await call(-1, "OpenDoc", { qDocName: APP })).qReturn.qHandle;
const qlikIds = new Set(((await call(doc, "Evaluate", { qExpression: "Concat(DISTINCT If(Len([Target Score]) > 0, [Leaderboard Match Id]), '|')" })).qReturn || "").split("|").filter(Boolean));
const reloaded = (await call(doc, "Evaluate", { qExpression: "Timestamp(ReloadTime())" })).qReturn;
// LeaderboardResults must link on Leaderboard Match Id alone. A synthetic key there (shared
// Event Id / Match Round / Match Court) orphaned a standalone game's results on 2026-09-21.
const model = await call(doc, "GetTablesAndKeys", { qWindowSize: { qcx: 0, qcy: 0 }, qNullSize: { qcx: 0, qcy: 0 }, qCellHeight: 0, qSyntheticMode: true, qIncludeSysVars: false });
const resultKeys = model.qtr.find((t) => t.qName === "LeaderboardResults").qFields.filter((f) => f.qKeyType !== "NOT_KEY").map((f) => f.qName);
const badKeys = resultKeys.join() !== "Leaderboard Match Id";
ws.close();

const missing = [...localIds].filter((i) => !qlikIds.has(i));
const extra = [...qlikIds].filter((i) => !localIds.has(i));
console.log(`PaddlePoint finished matches: ${localIds.size} | Qlik: ${qlikIds.size} | Qlik reloaded ${reloaded} UTC`);
if (missing.length) console.log("missing:", missing.join(", "));
console.log(missing.length || extra.length ? `STALE: ${missing.length} finished match(es) missing from Qlik, ${extra.length} in Qlik but gone locally` : "FRESH: Qlik matches PaddlePoint");
if (badKeys) console.log(`BROKEN MODEL: LeaderboardResults keys are [${resultKeys.join(", ")}], expected [Leaderboard Match Id]`);
process.exitCode = missing.length || extra.length || badKeys ? 1 : 0;
