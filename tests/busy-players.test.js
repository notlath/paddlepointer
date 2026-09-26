const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8").replace(/\r\n/g, "\n");

function source(name) {
  const found = appCode.match(new RegExp(`\\n  (?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}`));
  assert.ok(found, `app.js must define ${name}`);
  return found[0];
}

const matches = [
  { id: "m_live", status: "in_progress", court: 2, teamA: ["Alice", "Amy"], teamB: ["Bob", "Bill"] },
  { id: "m_done", status: "completed", court: 3, teamA: ["Cid", "Dee"], teamB: ["Eli", "Fay"] },
  { id: "m_shares", status: "scheduled", court: 1, teamA: ["Amy", "Gia"], teamB: ["Ivy", "Jo"] },
  { id: "m_free", status: "scheduled", court: 4, teamA: ["Cid", "Dee"], teamB: ["Eli", "Fay"] },
];

const busyPlayerNote = new Function(`${source("busyPlayerNote")}\nreturn busyPlayerNote;`)();
const byId = (id) => matches.find((match) => match.id === id);

test("the browser names the busy Player and their court, matching the server's reason", () => {
  assert.equal(busyPlayerNote(matches, byId("m_shares")), "Amy is already playing on Court 2");
});

test("a Match whose Players are all free has no reason to wait", () => {
  assert.equal(busyPlayerNote(matches, byId("m_free")), "");
  assert.equal(busyPlayerNote(matches, byId("m_live")), "", "a Match is never blocked by its own Players");
});

test("Start Match is unavailable, with the reason, while a Player is on another court", () => {
  const renderer = new Function(
    "state",
    `const escapeHtml = (value) => String(value);
     const escapeAttr = escapeHtml;
     const canTakeOverMatch = () => false;
     const tournamentPrimaryMatchId = () => "m_shares";
     ${source("busyPlayerNote")}
     ${source("renderTournamentMatch")}
     return renderTournamentMatch;`,
  )({ currentGame: null, tournament: { matches } });

  const waiting = renderer(byId("m_shares"));
  assert.match(waiting, /data-action="start-tournament-match" data-value="m_shares" disabled/);
  assert.match(waiting, /Amy is already playing on Court 2/);

  const ready = renderer(byId("m_free"));
  assert.match(ready, /data-action="start-tournament-match" data-value="m_free">Start Match</);
  assert.doesNotMatch(ready, /already playing/);
});
