// Load test against local Herd: 8 courts send score-sync every 3 s, 50 Live Board viewers poll
// every 2 s, 5 Analytics users each fetch one Qlik token. Pass: p95 < 300 ms, no 5xx, no lock timeouts.
// Usage: node run.mjs <file holding setup.php's JSON output>   (DURATION_S=600 default, BASE=https://paddlepoint.test/api)
import { readFileSync } from 'node:fs';
import https from 'node:https';

const { token, eventId, courts } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const BASE = process.env.BASE || 'https://paddlepoint.test/api';
const DURATION_MS = Number(process.env.DURATION_S || 600) * 1000;
const VIEWERS = 50, ANALYTICS_USERS = 5, SCORE_EVERY_MS = 3000, POLL_EVERY_MS = 2000;
const P95_LIMIT_MS = 300;

const stats = {}; // kind -> { ms: [], s5xx, lock, other }
const errors = []; // what each failure was, so a failed run explains itself
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = Date.now() + DURATION_MS;

// Each simulated device gets its own keep-alive connections, as separate phones and laptops do.
// One shared pool pushes each socket past nginx's 1000-requests-per-connection limit and
// reports the resulting resets as app errors.
const device = () => new https.Agent({ keepAlive: true, maxSockets: 6, rejectUnauthorized: false }); // Herd's local certificate

function send(agent, url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { agent, method, headers }, (res) => {
      let text = '';
      res.setEncoding('utf8').on('data', (c) => (text += c)).on('end', () =>
        resolve({ status: res.statusCode, ok: res.statusCode < 400, text: async () => text }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

async function timed(kind, agent, url, init) {
  const s = (stats[kind] ||= { ms: [], s5xx: 0, lock: 0, other: 0 });
  const t0 = performance.now();
  try {
    const res = await send(agent, url, init);
    const body = await res.text();
    s.ms.push(performance.now() - t0);
    if (res.status >= 500) s.s5xx++;
    else if (!res.ok) s.other++;
    if (/lock wait timeout|deadlock/i.test(body)) s.lock++;
    if (!res.ok) errors.push(`${new Date().toISOString()} ${kind} HTTP ${res.status} ${body.slice(0, 160)}`);
    return body;
  } catch (error) {
    s.ms.push(performance.now() - t0);
    s.other++;
    errors.push(`${new Date().toISOString()} ${kind} after ${(performance.now() - t0).toFixed(0)}ms: ${error.code || ''} ${error.message}`);
    return '';
  }
}

async function court(n) {
  const agent = device();
  await sleep(Math.random() * SCORE_EVERY_MS);
  for (let rally = 1; Date.now() < until; rally++) {
    const score = String(rally % 11); // stays below any target, so no Match finishes
    await timed('score-sync', agent, `${BASE}/save-tournament-match.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': token },
      body: JSON.stringify({ intent: 'score-sync', match: {
        tournamentId: eventId, matchId: `lt_m${n}`, activeGameId: `lt_game_${n}`,
        scoreA: rally % 2 ? score : '0', scoreB: rally % 2 ? '0' : score } }),
    });
    await sleep(SCORE_EVERY_MS);
  }
}

async function viewer() {
  const agent = device();
  await sleep(Math.random() * POLL_EVERY_MS);
  let since = null;
  while (Date.now() < until) {
    let url = `${BASE}/get-tournament.php?id=${encodeURIComponent(eventId)}&_=${Date.now()}`;
    if (since) url += `&since=${encodeURIComponent(since)}`;
    const body = await timed('live-board-poll', agent, url);
    try { since = JSON.parse(body).tournament?._updatedAt || since; } catch {}
    await sleep(POLL_EVERY_MS);
  }
}

const analyticsUser = () => timed('qlik-token', device(), `${BASE}/qlik/get-embed-token.php?_=${Date.now()}`,
  { headers: { 'X-Session-Token': token } });

const pct = (ms, q) => [...ms].sort((a, b) => a - b)[Math.max(0, Math.ceil(ms.length * q) - 1)] || 0;

await Promise.all([
  ...Array.from({ length: courts }, (_, i) => court(i + 1)),
  ...Array.from({ length: VIEWERS }, viewer),
  ...Array.from({ length: ANALYTICS_USERS }, analyticsUser),
]);

let pass = true;
for (const [kind, s] of Object.entries(stats)) {
  const kindP95 = pct(s.ms, 0.95);
  // The Qlik token round-trips to Qlik Cloud, so it is reported but not held to the local limit.
  const ok = s.s5xx === 0 && s.lock === 0 && s.other === 0 && (kind === 'qlik-token' || kindP95 < P95_LIMIT_MS);
  pass &&= ok;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${kind}: n=${s.ms.length} p50=${pct(s.ms, 0.5).toFixed(0)}ms p95=${kindP95.toFixed(0)}ms max=${Math.max(...s.ms).toFixed(0)}ms 5xx=${s.s5xx} lock=${s.lock} other=${s.other}`);
}
errors.slice(0, 10).forEach((e) => console.log('  error:', e));
console.log(pass ? 'LOAD TEST PASSED' : 'LOAD TEST FAILED');
process.exit(pass ? 0 : 1);
