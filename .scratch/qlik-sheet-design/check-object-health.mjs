// The acceptance gate for tickets 03-08: did the rebuild actually write a full property set?
//
// Ticket 09 proved that objects created through the API carry the renderer's defaults only
// sometimes: a healthy barchart holds 88 property paths, a starved one 18, and the starved
// one draws nothing while throwing "Cannot read properties of undefined (reading 'auto')".
// Rebuilding a Sheet by hand in the Qlik editor writes those defaults — this checks that it
// did, per object, so a half-finished rebuild cannot pass unnoticed.
//
// usage: node check-object-health.mjs            (exit 1 if anything is starved)
import { readFileSync } from "node:fs";

const HOST = "mtcmarketing.sg.qlikcloud.com";
const APP = "17ca2f54-46de-426c-9895-48f6c51513a3";

// What a complete property set looks like, pinned from objects the Qlik editor itself wrote
// (ticket 09's evidence). Pinned rather than derived from the app: a derived baseline is the
// richest object of that type *in this app*, so if every object of a type were starved the
// baseline would be starved too and everything would score healthy.
export const HEALTHY_PATHS = { barchart: 88, linechart: 96, table: 48, "sn-table": 57 };

// Gated types are the ones proven to fail this way, plus scatterplot, which has no healthy
// example in the app yet and so is reported unverifiable rather than guessed at. `kpi`
// (24-51 paths) and `filterpane` (11) are deliberately not gated: they vary legitimately and
// render fine at their smallest, so gating them would only cry wolf.
export const GATED = new Set([...Object.keys(HEALTHY_PATHS), "scatterplot"]);

// A rebuilt object is compared against the richest object of its own type in the app, which
// is by definition one the Qlik editor wrote. Missing most of that set is the failure ticket
// 09 describes; missing a few paths is ordinary configuration difference, not starvation.
export function assess({ paths, reference }) {
  if (reference === null) return "unknown-no-reference";
  if (paths < reference / 2) return "starved";
  return "healthy";
}

// A gate that goes green on "we could not tell" is not a gate, so unverifiable fails too.
export const exitCodeFor = ({ starved, unknown }) => (starved > 0 || unknown > 0 ? 1 : 0);

export const propertyPaths = (o, prefix = "") =>
  Object.entries(o ?? {}).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v) ? propertyPaths(v, `${prefix}${k}.`) : [`${prefix}${k}`]);

function connect(token) {
  const ws = new WebSocket(`wss://${HOST}/app/${APP}`, { headers: { Authorization: `Bearer ${token}` } });
  let id = 0;
  const pending = new Map();
  const failers = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); failers.delete(m.id); }
  };
  ws.onclose = () => { for (const [, reject] of failers) reject(new Error("engine socket closed mid-run")); failers.clear(); };
  const call = async (handle, method, params = {}) => {
    const m = await new Promise((res, rej) => {
      pending.set(++id, res); failers.set(id, rej);
      ws.send(JSON.stringify({ jsonrpc: "2.0", id, handle, method, params }));
    });
    if (m.error) throw new Error(`${method}: ${m.error.message}`);
    return m.result;
  };
  const open = new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("WebSocket failed (check the API key)")); });
  return { ws, call, open };
}

async function main() {
  const token = readFileSync(new URL("../qlik-event-dashboard/qlik_token.txt", import.meta.url), "utf8").trim();
  const { ws, call, open } = connect(token);
  await open;
  const doc = (await call(-1, "OpenDoc", { qDocName: APP })).qReturn.qHandle;

  const objects = [];
  for (const sheet of (await call(doc, "GetObjects", { qOptions: { qTypes: ["sheet"] } })).qList) {
    const h = (await call(doc, "GetObject", { qId: sheet.qInfo.qId })).qReturn.qHandle;
    if (!h) { console.log(`(skipped ${sheet.qMeta.title} — not visible to this identity)`); continue; }
    for (const cell of (await call(h, "GetLayout")).qLayout.cells) {
      const oh = (await call(doc, "GetObject", { qId: cell.name })).qReturn.qHandle;
      if (!oh) continue;
      const props = (await call(oh, "GetProperties")).qProp;
      objects.push({ sheet: sheet.qMeta.title, id: cell.name, type: props.qInfo.qType, paths: propertyPaths(props).length });
    }
  }

  const reference = (type) => HEALTHY_PATHS[type] ?? null;

  let starved = 0, unknown = 0;
  console.log("| sheet | object | type | paths | reference | verdict |");
  console.log("|---|---|---|---|---|---|");
  for (const o of objects.filter((o) => GATED.has(o.type)).sort((a, b) => a.sheet.localeCompare(b.sheet))) {
    const ref = reference(o.type);
    const verdict = assess({ paths: o.paths, reference: ref });
    if (verdict === "starved") starved++;
    if (verdict === "unknown-no-reference") unknown++;
    console.log(`| ${o.sheet} | \`${o.id}\` | ${o.type} | ${o.paths} | ${ref ?? "none in app"} | ` +
      `${verdict === "starved" ? "**STARVED**" : verdict === "healthy" ? "healthy" : "**UNKNOWN** — no healthy example of this type exists yet; check by eye"} |`);
  }
  console.log(`\n${starved} starved, ${unknown} unverifiable, of ${objects.filter((o) => GATED.has(o.type)).length} gated objects.`);
  if (starved) console.log("A starved object mounts, shows its title and draws nothing. See ticket 09.");
  if (unknown) {
    console.log("Unverifiable counts as failure: nothing in the app says that object draws.");
    console.log("Rebuild it, then pin its path count in HEALTHY_PATHS so the next one can be judged.");
  }
  ws.close();
  process.exitCode = exitCodeFor({ starved, unknown });
}

if (import.meta.main) await main();
