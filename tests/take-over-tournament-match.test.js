const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rallyEngine = require("../rally-engine.js");
const tournamentMatchModule = require("../tournament-match.js");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8").replace(/\r\n/g, "\n");

function source(name) {
  const found = appCode.match(new RegExp(`\\n  (?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}`));
  assert.ok(found, `app.js must define ${name}`);
  return found[0];
}

const starter = { id: 1, username: "admin", displayName: "Admin", role: "admin" };
const otherAdmin = { id: 2, username: "admin2", displayName: "Admin2", role: "admin" };
const superAdmin = { id: 3, username: "boss", displayName: "Boss", role: "super_admin" };

// A Match left ongoing on the server with no scoreboard behind it on this device.
const stuckMatch = () => ({
  id: "r3c2",
  round: 3,
  court: 2,
  status: "in_progress",
  teamA: ["Lathrell", "Test User 4"],
  teamB: ["Notlath", "Test User"],
  scoreA: "4",
  scoreB: "2",
  startedAt: "2026-09-15T07:38:00.000Z",
  startedBy: { id: 1, displayName: "Admin", role: "admin" },
  activeGameId: "stuck-game",
});

// Boots the real Match card and take-over flow against a fake server that locks an ongoing Match to its activeGameId.
function loadApp(user) {
  const names = [
    "requestReplaceActive",
    "requestDestructiveConfirmation",
    "tournamentGameFor",
    "canTakeOverMatch",
    "takeOverTournamentMatch",
    "tournamentMatchUpdateFromGame",
    "isSwitchEndsRally",
    "busyPlayerNote",
    "tournamentPrimaryMatchId",
    "renderTournamentMatch",
  ];
  return new Function(
    "rallyEngine",
    "tournamentMatchModule",
    "user",
    "match",
    "assert",
    `const state = { currentGame: null, view: "tournament", tournament: { id: "open_play", name: "Open Play", targetScore: 11, winByTwo: true, matches: [match] } };
     let pendingConfirm = null;
     const confirmationController = { open: (details, onConfirm) => { pendingConfirm = onConfirm; return true; } };
     const session = { user: () => user };
     const isStaff = () => true;
     const isSuperAdmin = () => user.role === "super_admin";
     const showToast = () => {};
     const update = () => {};
     const scrollToPageTopSoon = () => {};
     const saveActiveGame = () => {};
     const refreshSharedTournament = async () => {};
     const normalizeTournament = (tournament) => tournament;
     const cleanName = (value, fallback) => String(value || "").trim() || fallback;
     const clampNumber = (value, min, max) => Math.min(max, Math.max(min, Number(value) || min));
     const currentUserSummary = () => user;
     const gameTitle = () => "Match";
     const finalScore = () => "0-0";
     const escapeHtml = (value) => String(value);
     const escapeAttr = escapeHtml;
     async function postSharedTournamentMatch(change) {
       const existing = state.tournament.matches.find((item) => item.id === change.matchId);
       if (existing.status === "in_progress" && existing.activeGameId && change.activeGameId !== existing.activeGameId) {
         return { ok: false, error: "Match is already ongoing on another scoreboard" };
       }
       Object.assign(existing, { status: change.status, scoreA: change.scoreA, scoreB: change.scoreB });
       return { ok: true };
     }
     ${names.map(source).join("\n")}
     return {
       state,
       takeOverTournamentMatch,
       async confirm() {
         const onConfirm = pendingConfirm;
         pendingConfirm = null;
         assert.ok(onConfirm, "a take-over confirmation was requested");
         await onConfirm();
       },
       card: () => renderTournamentMatch(state.tournament.matches[0]),
     };`,
  )(rallyEngine, tournamentMatchModule, user, stuckMatch(), assert);
}

test("the Admin who started a stuck Match and Super Admins are offered Take Over Scoring; other Admins are not", () => {
  assert.match(loadApp(starter).card(), /data-action="take-over-tournament-match" data-value="r3c2"/);
  assert.match(loadApp(superAdmin).card(), /data-action="take-over-tournament-match" data-value="r3c2"/);

  const otherCard = loadApp(otherAdmin).card();
  assert.doesNotMatch(otherCard, /take-over-tournament-match/);
  assert.match(otherCard, /Other admins cannot start this match/);
});

test("taking over a stuck Match opens its Scoreboard on this device at the server's Score", async () => {
  const app = loadApp(starter);
  await app.takeOverTournamentMatch("r3c2");
  await app.confirm();

  const game = app.state.currentGame;
  assert.ok(game, "this device now scores the Match");
  assert.equal(game.id, "stuck-game", "the Game holds the Match's lock");
  assert.equal(game.tournamentMatch.matchId, "r3c2");
  assert.deepEqual([game.teamA.score, game.teamB.score], [4, 2], "scoring continues from the server's Score");
  assert.equal(app.state.view, "scoreboard");
  assert.equal(app.state.tournament.matches[0].status, "in_progress", "the server accepted this device as the Match's scoreboard");
  assert.match(app.card(), /data-action="resume-game"/, "the card now offers Resume Match");
});
