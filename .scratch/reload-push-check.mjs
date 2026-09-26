// Does an already-open engine session see reloaded data? Opens session A, triggers a reload
// (marks pending + runs the cron command), waits for it, then compares A against a fresh session B.
// usage: node .scratch/reload-push-check.mjs   (needs the ngrok tunnel up)
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const HOST = "mtcmarketing.sg.qlikcloud.com", APP = "17ca2f54-46de-426c-9895-48f6c51513a3";
const token = readFileSync(new URL("./qlik-event-dashboard/qlik_token.txt", import.meta.url), "utf8").trim();
async function open(label) {
  const ws = new WebSocket(`wss://${HOST}/app/${APP}`, { headers: { Authorization: `Bearer ${token}` } });
  let id = 0; const pending = new Map(); const notes = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else notes.push(m.method || JSON.stringify(m).slice(0, 80)); };
  const call = (handle, method, params = {}) => new Promise((res, rej) => { pending.set(++id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ jsonrpc: "2.0", id, handle, method, params })); });
  await new Promise((r) => (ws.onopen = r));
  const doc = (await call(-1, "OpenDoc", { qDocName: APP })).qReturn.qHandle;
  const obj = (await call(doc, "CreateSessionObject", { qProp: { qInfo: { qType: "probe" }, qMeta: {}, t: { qValueExpression: "=Timestamp(ReloadTime())" } } })).qReturn.qHandle;
  const changed = [];
  return { label, notes, call, doc, obj, ws, reloadTime: async () => (await call(doc, "Evaluate", { qExpression: "Timestamp(ReloadTime())" })).qReturn, layoutTime: async () => (await call(obj, "GetLayout")).qLayout.t };
}
const A = await open("A");
console.log("A before:", await A.reloadTime());
const field = (await A.call(A.doc, "GetField", { qFieldName: "Match Court" })).qReturn.qHandle;
await A.call(field, "Select", { qMatch: "1" });
const sel = async () => (await A.call(A.doc, "Evaluate", { qExpression: "GetCurrentSelections()" })).qReturn;
console.log("A selection before reload:", JSON.stringify(await sel()));
const sh = (c, a) => execFileSync(c, a, { cwd: new URL("../", import.meta.url), encoding: "utf8", shell: false }).trim();
console.log(sh("cmd", ["/c", "php", ".scratch/mark-pending.php"]));
for (let i = 0; i < 3; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const B = await open("B");
  const b = await B.reloadTime(); B.ws.close();
  console.log(`t+${(i + 1) * 5}s  fresh session B: ${b} | open session A: ${await A.reloadTime()} (object layout: ${await A.layoutTime()}) | A selection: ${JSON.stringify(await sel())} | A notifications: ${JSON.stringify(A.notes)}`);
}
A.ws.close();
