// Ticket 01: check every embedded object AS THE EMBED USER, not as tenant admin.
//
// The inventory script runs on a tenant-admin API key, which sees everything — including
// objects on unpublished Sheets that are invisible to any other identity. Ticket 11 found
// exactly that failure ("Object not found" for a private Sheet, regardless of space role).
// So this mints the same OAuth M2M impersonation token the browser gets and repeats the
// check as that user. What fails here is what fails in PaddlePoint.
//
// usage: node render-as-embed-user.mjs        (reads credentials from ../../.env)
import { readFileSync } from "node:fs";

const HOST = "mtcmarketing.sg.qlikcloud.com";
const APP = "17ca2f54-46de-426c-9895-48f6c51513a3";

const SHEETS = [
  ["Overview", "a74a9d96-0a3f-4f7d-b9f1-f91c7153dd46"],
  ["Match Analysis", "SAhNFmP"],
  ["Leaderboard", "fYjcmpj"],
  ["Player Performance", "e1aac6a4-1c2f-49f9-a8c8-7ae4be857b3c"],
  ["Partnership Analysis", "eb45cb51-48e5-47c6-9226-90690f626f9b"],
  ["Event / Court Analytics", "7cc85fc7-1896-4127-be10-b1731f626c6c"],
];
const DASHBOARD_CHART = "cahVPXg";

function env(name) {
  const text = readFileSync(new URL("../../.env", import.meta.url), "utf8");
  const line = text.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} missing from .env`);
  return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
}

async function impersonationToken() {
  const res = await fetch(`https://${HOST}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env("QLIK_M2M_CLIENT_ID"),
      client_secret: env("QLIK_M2M_CLIENT_SECRET"),
      grant_type: "urn:qlik:oauth:user-impersonation",
      user_lookup: { field: "subject", value: env("QLIK_EVENT_VIEWER_SUBJECT") },
      scope: "user_default",
    }),
  });
  if (!res.ok) throw new Error(`token request failed: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

function connect(token) {
  const ws = new WebSocket(`wss://${HOST}/app/${APP}`, { headers: { Authorization: `Bearer ${token}` } });
  let id = 0;
  const pending = new Map();
  const failers = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); failers.delete(m.id); }
  };
  const call = async (handle, method, params = {}) => {
    const m = await new Promise((res, rej) => {
      pending.set(++id, res); failers.set(id, rej);
      ws.send(JSON.stringify({ jsonrpc: "2.0", id, handle, method, params }));
    });
    if (m.error) throw new Error(`${m.error.message}${m.error.parameter ? ` (${m.error.parameter})` : ""}`);
    return m.result;
  };
  ws.onclose = () => { for (const [, reject] of failers) reject(new Error("engine socket closed mid-run")); failers.clear(); };
  const open = new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("WebSocket failed")); });
  return { ws, call, open };
}

async function main() {
  const { ws, call, open } = connect(await impersonationToken());
  await open;
  const doc = (await call(-1, "OpenDoc", { qDocName: APP })).qReturn.qHandle;

  let broken = 0;
  for (const [title, sheetId] of SHEETS) {
    let cells;
    try {
      const h = (await call(doc, "GetObject", { qId: sheetId })).qReturn.qHandle;
      // The engine answers an invisible object with qHandle: null (not 0, and not an error).
      if (!h) throw new Error("Object not found — not visible to this identity");
      cells = (await call(h, "GetLayout")).qLayout.cells;
    } catch (err) {
      broken++;
      console.log(`\n### ${title}  \`${sheetId}\`\nSHEET INVISIBLE to the embed user: ${err.message}`);
      continue;
    }
    const results = [];
    for (const cell of cells) {
      try {
        const h = (await call(doc, "GetObject", { qId: cell.name })).qReturn.qHandle;
        if (!h) throw new Error("Object not found — not visible to this identity");
        await call(h, "GetLayout");
        results.push([cell.name, "ok"]);
      } catch (err) {
        broken++;
        results.push([cell.name, `FAIL: ${err.message}`]);
      }
    }
    const bad = results.filter(([, v]) => v !== "ok");
    console.log(`\n### ${title}  \`${sheetId}\`\n${results.length} objects, ${bad.length} failing` +
      (bad.length ? `\n${bad.map(([n, v]) => `  ${n}: ${v}`).join("\n")}` : ""));
  }

  process.stdout.write(`\n### Dashboard chart \`${DASHBOARD_CHART}\`\n`);
  try {
    const h = (await call(doc, "GetObject", { qId: DASHBOARD_CHART })).qReturn.qHandle;
    if (!h) throw new Error("Object not found — not visible to this identity");
    await call(h, "GetLayout");
    console.log("ok");
  } catch (err) {
    broken++;
    console.log(`FAIL: ${err.message}`);
  }

  console.log(`\n## ${broken} failure(s) as the embed user`);
  ws.close();
  process.exitCode = broken ? 1 : 0;
}

await main();
