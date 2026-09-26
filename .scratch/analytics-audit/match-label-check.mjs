// Engine check for the descriptive Match label: evaluates the mashup's own Recent Matches cube
// as the embed user (M2M token minted by the app's PHP) and prints the rows.
// usage: node .scratch/analytics-audit/match-label-check.mjs
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SUBJECTS, hypercubeProps } from "../../qlik-mashup.js";
import { writeFileSync } from "node:fs";
globalThis.d3 ??= (await import("node:module")).createRequire(import.meta.url)("../../vendor/d3-7.9.0.min.js");
const HOST = "mtcmarketing.sg.qlikcloud.com", APP = "17ca2f54-46de-426c-9895-48f6c51513a3";
const php = "C:\\Users\\lathrell.pagsuguiron\\.config\\herd\\bin\\php.bat";
const root = fileURLToPath(new URL("../../", import.meta.url));
// php.bat needs a shell, so the script goes through a file rather than a quoted -r string.
const helper = `${process.env.TEMP}\\pp-token.php`;
writeFileSync(helper, `<?php require ${JSON.stringify(root + "api/qlik/embed_token.php")}; echo json_encode(qlik_fetch_impersonation_token());`);
const out = execFileSync(`"${php}"`, [`"${helper}"`], { encoding: "utf8", shell: true });
const token = JSON.parse(out)?.access_token;
if (!token) throw new Error("no token: " + out);

const ws = new WebSocket(`wss://${HOST}/app/${APP}`, { headers: { Authorization: `Bearer ${token}` } });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); pending.delete(m.id); };
const call = (handle, method, params = {}) => new Promise((res, rej) => { pending.set(++id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ jsonrpc: "2.0", id, handle, method, params })); });
await new Promise((r) => (ws.onopen = r));
const doc = (await call(-1, "OpenDoc", { qDocName: APP })).qReturn.qHandle;

for (const [subject, title] of [["overview", "Recent Matches"], ["match-analysis", "Match Details"], ["player-performance", "Match History"]]) {
  const chart = SUBJECTS[subject].charts.find((c) => c.title === title);
  const obj = (await call(doc, "CreateSessionObject", { qProp: hypercubeProps(chart) })).qReturn.qHandle;
  const layout = (await call(obj, "GetLayout")).qLayout;
  const hc = layout.qHyperCube;
  console.log(`\n== ${subject} / ${title}  (${hc.qSize.qcy} rows)`);
  console.log([...hc.qDimensionInfo, ...hc.qMeasureInfo].map((c) => c.qFallbackTitle + (c.qError ? ` [ERROR ${c.qError.qErrorCode}]` : "")).join(" | "));
  for (const r of (hc.qDataPages[0]?.qMatrix || []).slice(0, 6)) console.log(r.map((c) => c.qText).join(" | "));
}
ws.close();
