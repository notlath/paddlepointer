// Ticket 01: does each embedded Sheet actually PAINT? Engine health is not the same thing.
//
// Drives Edge over CDP because the agent's own browser pane runs hidden, which pauses
// requestAnimationFrame and makes every chart look blank whether it is broken or not.
// Leaderboard is the control: ticket 11 confirmed it renders, so if Leaderboard paints here
// the harness is a valid oracle and a blank elsewhere is a real failure.
//
// The page (qlik-render-check.html at the site root) holds no credentials; the access
// token is injected here, after load, into the window.__ppToken the page polls for.
//
// usage: node browser-render-check.mjs <token-file> <out-dir>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";

const URL_UNDER_TEST = "https://paddlepoint.test/qlik-render-check.html";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9223;
const [tokenFile, outDir] = process.argv.slice(2);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Qlik draws its failure badge as an SVG glyph, so "has marks" alone would score a broken
// object as painted — an error badge outranks any marks.
const isPainted = (p) => !p.err && Boolean(p.rows || p.canvas || p.svg);

async function cdp() {
  for (let i = 0; i < 40; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = targets.find((t) => t.type === "page" && t.url.includes("qlik-render-check"));
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error("Edge never exposed the page over CDP");
}

function session(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = async (method, params = {}) => {
    const m = await new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
    if (m.error) throw new Error(`${method}: ${m.error.message}`);
    return m.result;
  };
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };
  return { ws, send, evaluate, open: new Promise((res) => { ws.onopen = res; }) };
}

// "Painted" = the element's shadow tree actually contains drawn marks or table rows.
//
// KNOWN BLIND SPOT (ticket 02): qlik-embed renders some embeds into frames this DOM walk
// cannot reach — Page.getFrameTree shows child frames while querySelectorAll("iframe") finds
// none inside the element. The Admin dashboard chart reports 0 marks here while the
// screenshot plainly shows it drawing. So a BLANK verdict on a chart slot means "no marks
// found in the DOM", not "no pixels". Read the screenshot before believing it; the
// authoritative gate for whether an object can draw at all is check-object-health.mjs.
const PROBE = `
  Array.from(document.querySelectorAll("qlik-embed")).map((el) => {
    const label = el.closest("div").previousElementSibling.textContent.trim();
    const root = el.shadowRoot || el;
    const all = [root, ...root.querySelectorAll("*")].flatMap((n) => n.shadowRoot ? [n.shadowRoot] : []);
    const count = (sel) => [root, ...all].reduce((n, r) => n + r.querySelectorAll(sel).length, 0);
    const text = (el.shadowRoot ? el.shadowRoot.textContent : el.textContent) || "";
    const errs = [root, ...all].flatMap((r) => Array.from(r.querySelectorAll("[class*=error i],[class*=Error]"))).map((e) => e.textContent.trim()).filter(Boolean);
    return { label, svg: count("svg"), canvas: count("canvas"), rows: count("tr,[role=row]"),
             err: errs[0] ?? null, chars: text.trim().length, snippet: text.trim().slice(0, 140) };
  })`;

mkdirSync(outDir, { recursive: true });
const edge = spawn(EDGE, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${outDir}/edge-profile`,
    "--headless=new", "--window-size=1440,1000", "--no-first-run", "--disable-features=Translate",
  "--ignore-certificate-errors", URL_UNDER_TEST,
], { detached: false, stdio: "ignore" });

async function main() {
  const token = readFileSync(tokenFile, "utf8").trim();
  const s = session(await cdp());
  await s.open;
  await s.send("Runtime.enable");
  await s.send("Page.enable");
  // Inject BEFORE the document exists, then load it. Evaluating after attach lands in the
  // about:blank context and is thrown away by the navigation — which is how an earlier run
  // reported all seven slots blank when the truth was that no token ever arrived.
  await s.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__ppToken = ${JSON.stringify(token)};` });
  await s.send("Page.navigate", { url: URL_UNDER_TEST });

  let tokenSeen = false;
  for (let i = 0; i < 20 && !tokenSeen; i++) {
    await sleep(500);
    tokenSeen = (await s.evaluate(`document.getElementById("status")?.textContent`)) === "token received";
  }
  if (!tokenSeen) throw new Error("the page never received a token — every slot would read blank for the wrong reason");
  console.log("token received by the page; waiting for charts…");

  let probe = [];
  for (let i = 0; i < 24; i++) {
    await sleep(2500);
    probe = await s.evaluate(PROBE);
    const painted = probe.filter(isPainted).length;
    console.log(`  +${(i + 1) * 2.5}s  ${painted}/${probe.length} slots showing marks`);
    if (painted === probe.length) break;
  }

  const errors = await s.evaluate("window.__errors");
  const height = await s.evaluate("document.documentElement.scrollHeight");
  await s.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: Math.min(height, 12000), deviceScaleFactor: 1, mobile: false });
  await sleep(2000);
  const shot = await s.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(`${outDir}/render-check.png`, Buffer.from(shot.data, "base64"));

  console.log("\n| slot | svg | canvas | rows | chars | verdict |\n|---|---|---|---|---|---|");
  for (const p of probe) {
    console.log(`| ${p.label} | ${p.svg} | ${p.canvas} | ${p.rows} | ${p.chars} | ${p.err ? `**ERROR: ${p.err}**` : isPainted(p) ? "PAINTED" : "**BLANK**"} |`);
  }
  console.log(`\n### console errors (${errors.length})`);
  for (const e of [...new Set(errors)]) console.log(`- ${e}`);
  for (const p of probe) if (!(p.svg || p.canvas || p.rows)) console.log(`\nblank slot text — ${p.label}: ${JSON.stringify(p.snippet)}`);
  console.log(`\nscreenshot: ${outDir}/render-check.png`);

  s.ws.close();
}

// Always kill Edge: a survivor keeps the debugging port, and the next run would attach to
// its stale page and report last time's results as if they were fresh.
try { await main(); } finally { edge.kill(); }
