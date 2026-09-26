// Ticket 09: compare a chart that paints with one of the SAME TYPE that does not.
// cahVPXg (Matches by day) and GSVRc live on the same Sheet and are both barcharts;
// one draws, one is an empty titled box. Whatever differs is the cause.
//
// usage: node diff-object-props.mjs <goodId> <badId>
import { readFileSync } from "node:fs";
const HOST = "mtcmarketing.sg.qlikcloud.com";
const APP = "17ca2f54-46de-426c-9895-48f6c51513a3";
const [GOOD, BAD] = process.argv.slice(2);

const token = readFileSync(new URL("../qlik-event-dashboard/qlik_token.txt", import.meta.url), "utf8").trim();
const ws = new WebSocket(`wss://${HOST}/app/${APP}`, { headers: { Authorization: `Bearer ${token}` } });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const call = async (handle, method, params = {}) => {
  const m = await new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ jsonrpc: "2.0", id, handle, method, params })); });
  if (m.error) throw new Error(`${method}: ${m.error.message}`);
  return m.result;
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("ws failed")); });
const doc = (await call(-1, "OpenDoc", { qDocName: APP })).qReturn.qHandle;

const props = async (qId) => {
  const h = (await call(doc, "GetObject", { qId })).qReturn.qHandle;
  return (await call(h, "GetProperties")).qProp;
};
const keys = (o, prefix = "") => Object.entries(o ?? {}).flatMap(([k, v]) =>
  v && typeof v === "object" && !Array.isArray(v) ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]);

const g = await props(GOOD), b = await props(BAD);
const gk = new Set(keys(g)), bk = new Set(keys(b));
console.log(`good ${GOOD} (${g.qInfo.qType}) — ${gk.size} property paths`);
console.log(`bad  ${BAD} (${b.qInfo.qType}) — ${bk.size} property paths\n`);
console.log("## present on the WORKING chart, missing on the broken one");
for (const k of [...gk].filter((k) => !bk.has(k))) console.log(`  + ${k}`);
console.log("\n## present on the BROKEN chart, missing on the working one");
for (const k of [...bk].filter((k) => !gk.has(k))) console.log(`  - ${k}`);
ws.close();
