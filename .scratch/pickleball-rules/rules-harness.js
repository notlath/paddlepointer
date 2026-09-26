// Pickleball rules harness for the tickets in ./issues.
// Run from the repo root: node .scratch/pickleball-rules/rules-harness.js
// Prints PASS/FAIL per rule, plus a table of Open Play schedule fairness (tickets 09 and 10).
// The server-side checks from ticket 02 live in tests/match_lifecycle_test.php, not here.
const path = require("path");
const repo = process.argv[2] || path.join(__dirname, "..", "..");
const E = require(path.join(repo, "rally-engine.js"));
const S = require(path.join(repo, "open-play-scheduler.js"));
const TM = require(path.join(repo, "tournament-match.js"));

const results = [];
function check(name, ok, detail = "") { results.push({ name, ok, detail }); }
const g = (o = {}) => E.createGame({ teamA: { players: ["A1", "A2"] }, teamB: { players: ["B1", "B2"] }, now: "2026-01-01T00:00:00Z", ...o });
const play = (game, seq) => { for (const w of seq) E.recordRally(game, w, { now: "2026-01-01T00:00:00Z" }); return game; };

// R1 doubles start 0-0-2, first server is right-court player
{ const x = g(); check("R1 start 0-0-2, server on right", E.scoreCall(x) === "0 - 0 - 2" && E.servePosition(x).side === "right" && E.currentServerName(x) === "A1"); }
// R2 first-serving team fault at 0-0-2 -> immediate side-out, B right player serves as server 1
{ const x = play(g(), ["B"]); check("R2 fault at 0-0-2 is side-out", x.servingTeam === "B" && x.serverNumber === 1 && E.currentServerName(x) === "B1" && E.servePosition(x).side === "right", E.scoreCall(x)); }
// R3 point -> server switches sides, same server
{ const x = play(g(), ["A"]); check("R3 point swaps server to left", E.scoreCall(x) === "1 - 0 - 2" && E.currentServerName(x) === "A1" && E.servePosition(x).side === "left"); }
// R4 server 1 fault -> partner serves from own current side
{ const x = play(g(), ["B", "B", "A"]); // B: 1-0-1 B1 right->left, then A wins rally -> server 2 = B2 on right
  check("R4 server-1 fault passes to partner in place", x.servingTeam === "B" && x.serverNumber === 2 && E.currentServerName(x) === "B2" && E.servePosition(x).side === "right", `${E.scoreCall(x)} ${E.currentServerName(x)} ${E.servePosition(x).side}`); }
// R5 property: serving team's even score => its starting-right player is on right (doubles), random rallies
{ let bad = 0, sample = "";
  for (let t = 0; t < 2000; t++) {
    let seed = t + 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const x = g({ targetScore: 99, firstServer: rnd() < 0.5 ? "A" : "B" });
    for (let i = 0; i < 200 && x.status === "active"; i++) {
      E.recordRally(x, rnd() < 0.5 ? "A" : "B");
      for (const k of ["A", "B"]) {
        const team = E.teamByKey(x, k);
        const expectRight = team.score % 2 === 0 ? 0 : 1; // the team's first player started on the right
        if (team.positions.right !== expectRight) { bad++; sample ||= `${k} score ${team.score} right=${team.positions.right}`; }
      }
    }
  }
  check("R5 court positions follow score parity (2000 random games)", bad === 0, sample); }
// R6 win rules
{ const w = (a, b, wb2 = true, t = 11) => E.detectWinner({ teamA: { score: a }, teamB: { score: b }, targetScore: t, winByTwo: wb2 });
  check("R6 11-9 wins, 11-10 not, 12-10 wins", w(11, 9) === "A" && w(11, 10) === null && w(12, 10) === "A" && w(10, 12) === "B"); }
// R7 singles: serve from right on even own score, side-out on fault, no server number
{ const x = g({ type: "singles", teamA: { players: ["A1"] }, teamB: { players: ["B1"] } });
  play(x, ["A", "B"]); check("R7 singles parity & side-out", E.scoreCall(x) === "0 - 1" && x.servingTeam === "B" && E.servePosition(x).side === "right"); }
// R8 undo replay == state before
{ const x = g(); play(x, ["A", "A", "B", "A", "B", "B", "A"]); const before = JSON.stringify({ ...x, events: x.events.length });
  E.recordRally(x, "B"); E.undoRally(x); check("R8 undo restores state", JSON.stringify({ ...x, events: x.events.length }) === before); }
// R9 retirement/forfeit: the retiring team loses regardless of score (ticket 01)
{ const x = play(g(), ["A", "A", "A"]); E.endGameEarly(x, { retiredTeam: "A" });
  check("R9 retiring team loses even when ahead", x.winner === "B" && x.retiredTeam === "A" && x.endReason === "retirement_or_forfeit", `winner=${x.winner} at ${E.finalScore(x)}`);
  const y = g(); E.endGameEarly(y, { retiredTeam: "B" });
  check("R9b 0-0 forfeit still has a winner", y.winner === "A", `winner=${y.winner}`); }
// R10 tournament completion payload cannot claim a winner the score contradicts (ticket 02)
{ const x = g(); x.status = "completed"; x.winner = null; x.tournamentMatch = { matchId: "m1" };
  const u = TM.buildMatchUpdate(x, "completed"); check("R10 completed update with no winner is not coerced to A", u.winner === null, `winner=${u.winner}`);
  const y = play(g(), ["A", "A", "A"]); y.tournamentMatch = { matchId: "m1" }; E.endGameEarly(y, { retiredTeam: "A" });
  const v = TM.buildMatchUpdate(y, "completed");
  check("R10b update carries the rule context the server checks", v.targetScore === 11 && v.winByTwo === true && v.endedEarly === true && v.retiredTeam === "A", JSON.stringify({ t: v.targetScore, w: v.winByTwo, e: v.endedEarly, r: v.retiredTeam })); }
// R11-R14 features the tickets add
const app = require("fs").readFileSync(path.join(repo, "app.js"), "utf8");
check("R11 switch ends at midpoint (6 in game to 11) cued — ticket 05", /switch ends|change ends|switchEnds/i.test(app));
check("R12 timeouts tracked (2 per team per game to 11) — ticket 06", /timeouts?Remaining|data-action="timeout/i.test(app));
check("R13 tournament match lets toss winner pick first server — ticket 03", !/firstServer: "A",\s*\n\s*targetScore: clampNumber\(tournament/.test(app));
check("R14 scorer can correct server/positions without undo — ticket 04", /data-action="correct-serve"/.test(app) && /rallyEngine\.correctServe\(game,/.test(app));

// Scheduler fairness (tickets 09 and 10)
function metrics(n, courts, mpp, seed) {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const players = Array.from({ length: n }, (_, i) => `P${i + 1}`);
  const ms = S.buildOpenPlayMatches(players, courts, mpp, [], rnd);
  const rounds = Math.max(...ms.map((m) => m.round));
  const count = new Map(players.map((p) => [p, 0])); const opp = new Map(); const part = new Map();
  const inRound = players.map(() => new Array(rounds + 1).fill(false));
  for (const m of ms) {
    for (const p of [...m.teamA, ...m.teamB]) { count.set(p, count.get(p) + 1); inRound[+p.slice(1) - 1][m.round] = true; }
    const k = (a, b) => [a, b].sort().join("|");
    part.set(k(...m.teamA), (part.get(k(...m.teamA)) || 0) + 1); part.set(k(...m.teamB), (part.get(k(...m.teamB)) || 0) + 1);
    for (const a of m.teamA) for (const b of m.teamB) opp.set(k(a, b), (opp.get(k(a, b)) || 0) + 1);
  }
  let maxSit = 0, maxPlay = 0;
  for (const r of inRound) { let sit = 0, pl = 0; for (let i = 1; i <= rounds; i++) { if (r[i]) { pl++; sit = 0; } else { sit++; pl = 0; } maxSit = Math.max(maxSit, sit); maxPlay = Math.max(maxPlay, pl); } }
  const c = [...count.values()];
  // ponytail: naive lower bound (matches / usable courts); good enough to show padded schedules
  const lowerBound = Math.ceil(ms.length / Math.min(courts, Math.floor(n / 4)));
  return { n, courts, mpp, matches: ms.length, rounds, lowerBound, minGames: Math.min(...c), maxGames: Math.max(...c), maxPartnerRepeat: Math.max(...part.values()), maxOpponentRepeat: Math.max(...opp.values()), maxConsecutiveSitOut: maxSit, maxConsecutivePlay: maxPlay };
}
const table = [[8, 2, 7], [10, 2, 6], [13, 3, 6], [16, 4, 6], [17, 4, 6], [22, 4, 8], [30, 6, 8]].map(([n, c, m]) => metrics(n, c, m, 7));
console.table(table);
for (const r of table) {
  check(`Q games-per-player spread <=1 (${r.n}p)`, r.maxGames - r.minGames <= 1, `${r.minGames}..${r.maxGames}`);
  check(`Q rounds at lower bound (${r.n}p/${r.courts}c) — ticket 09`, r.rounds === r.lowerBound, `${r.rounds} vs ${r.lowerBound}`);
  check(`Q nobody sits out 2+ rounds in a row (${r.n}p) — ticket 09`, r.maxConsecutiveSitOut <= 1, `max ${r.maxConsecutiveSitOut}`);
}
check("Q opponent repeat <=3 with 8 players — ticket 10", table[0].maxOpponentRepeat <= 3, `max ${table[0].maxOpponentRepeat}`);
check("Q opponent repeat <=2 with 16 players — ticket 10", table[3].maxOpponentRepeat <= 2, `max ${table[3].maxOpponentRepeat}`);
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : "  -> " + r.detail}`);
process.exit(results.some((r) => !r.ok) ? 1 : 0);
