// Ticket 01: inventory every object on every Sheet and report its engine-side health.
//
// The engine is only half the answer — an object can return data happily and still paint
// blank in the browser (that is exactly the missing-`visualization` bug). So this reports
// the half a browser cannot tell you (which objects lack `visualization`, which error on
// GetLayout) and leaves the paints/does-not-paint half to the browser check.
//
// usage: node inspect-sheets.mjs            markdown table to stdout
// Reads the Qlik API key from ../qlik-event-dashboard/qlik_token.txt (gitignored).
import { readFileSync } from "node:fs";

const HOST = "mtcmarketing.sg.qlikcloud.com";
const APP = "17ca2f54-46de-426c-9895-48f6c51513a3";

// The six Sheets embedded in PaddlePoint's Analytics view (app.js QLIK_SHEETS), plus the
// one chart on the Admin dashboard. Anything else in the app is Qlik-Cloud-only.
const EMBEDDED_SHEETS = new Set([
  "a74a9d96-0a3f-4f7d-b9f1-f91c7153dd46",
  "SAhNFmP",
  "fYjcmpj",
  "e1aac6a4-1c2f-49f9-a8c8-7ae4be857b3c",
  "eb45cb51-48e5-47c6-9226-90690f626f9b",
  "7cc85fc7-1896-4127-be10-b1731f626c6c",
]);
const DASHBOARD_CHART = "cahVPXg";

// Engine-side verdict for one object. The browser decides the rest.
export function classify({ visualization, layoutError }) {
  if (!visualization) return "no-visualization";
  if (layoutError) return "engine-error";
  return "engine-ok";
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
    if (m.error) throw new Error(`${method}: ${m.error.message} ${m.error.parameter ?? ""}`.trim());
    return m.result;
  };
  ws.onclose = () => { for (const [, reject] of failers) reject(new Error("engine socket closed mid-run")); failers.clear(); };
  const open = new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("WebSocket failed (check the API key)")); });
  return { ws, call, open };
}

async function main() {
  const token = readFileSync(new URL("../qlik-event-dashboard/qlik_token.txt", import.meta.url), "utf8").trim();
  const { ws, call, open } = connect(token);
  await open;

  const doc = (await call(-1, "OpenDoc", { qDocName: APP })).qReturn.qHandle;
  const sheets = (await call(doc, "GetObjects", { qOptions: { qTypes: ["sheet"] } })).qList;
  sheets.sort((a, b) => (a.qData?.rank ?? 99) - (b.qData?.rank ?? 99));

  const rows = [];
  for (const sheet of sheets) {
    const id = sheet.qInfo.qId;
    let layout, props;
    try {
      const handle = (await call(doc, "GetObject", { qId: id })).qReturn.qHandle;
      // An invisible object comes back as qHandle: null, not as an error.
      if (!handle) throw new Error("not visible to this identity");
      layout = (await call(handle, "GetLayout")).qLayout;
      props = (await call(handle, "GetProperties")).qProp;
    } catch (err) {
      console.log(`
### ${sheet.qMeta.title}  \`${id}\`
UNREADABLE: ${err.message}`);
      continue;
    }
    const opts = props.layoutOptions ?? {};
    console.log(`\n### ${sheet.qMeta.title}  \`${id}\`${EMBEDDED_SHEETS.has(id) ? "  **embedded**" : "  (Qlik Cloud only)"}`);
    console.log(`sheetMode=${opts.sheetMode ?? "(unset — responsive)"} extendable=${opts.extendable ?? false} ` +
                `mobileLayout=${opts.mobileLayout ?? "(unset)"} rows=${props.rows ?? layout.rows ?? "?"} columns=${props.columns ?? layout.columns ?? "?"} ` +
                `cells=${layout.cells.length} published=${sheet.qMeta.published === true}`);
    console.log("\n| object | qType | visualization | engine |");
    console.log("|---|---|---|---|");
    for (const cell of layout.cells) {
      const h = (await call(doc, "GetObject", { qId: cell.name })).qReturn.qHandle;
      if (!h) { console.log(`| \`${cell.name}\` | ? | ? | not visible to this identity |`); continue; }
      const p = (await call(h, "GetProperties")).qProp;
      let layoutError = null;
      try { await call(h, "GetLayout"); } catch (err) { layoutError = err.message; }
      const verdict = classify({ visualization: p.visualization, layoutError });
      rows.push({ sheet: sheet.qMeta.title, id, embedded: EMBEDDED_SHEETS.has(id), cell: cell.name, verdict });
      console.log(`| \`${cell.name}\`${cell.name === DASHBOARD_CHART ? " (dashboard)" : ""} | ${p.qInfo.qType} | ` +
                  `${p.visualization ?? "**MISSING**"} | ${verdict}${layoutError ? `: ${layoutError}` : ""} |`);
    }
  }

  const embedded = rows.filter((r) => r.embedded);
  const tally = (list) => ["no-visualization", "engine-error", "engine-ok"]
    .map((v) => `${list.filter((r) => r.verdict === v).length} ${v}`).join(", ");
  console.log(`\n## Summary\n\nEmbedded Sheets: ${embedded.length} objects — ${tally(embedded)}`);
  console.log(`Whole app: ${rows.length} objects — ${tally(rows)}`);
  console.log("\nEngine-ok does NOT mean it paints. Confirm in a visible browser.");
  ws.close();
}

if (import.meta.main) await main();
