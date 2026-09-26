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

const admin1 = { id: 1, username: "admin1", displayName: "Admin1", role: "admin" };

const scheduled = (id, court) => ({
  id,
  round: 1,
  court,
  status: "scheduled",
  teamA: [`${id} A1`, `${id} A2`],
  teamB: [`${id} B1`, `${id} B2`],
  scoreA: "",
  scoreB: "",
  startedBy: null,
  activeGameId: null,
});

// Boots the real Match start, replace confirmation and Match card against a fake server that applies each Match update.
function loadApp() {
  const names = [
    "requestReplaceActive",
    "requestDestructiveConfirmation",
    "requestChoiceConfirmation",
    "startMatchChoiceFields",
    "startTournamentMatch",
    "tournamentGameFor",
    "tournamentMatchUpdateFromGame",
    "isSwitchEndsRally",
    "busyPlayerNote",
    "tournamentPrimaryMatchId",
    "renderTournamentMatch",
  ];
  return new Function(
    "rallyEngine",
    "tournamentMatchModule",
    "admin1",
    "matches",
    "assert",
    `const state = { currentGame: null, tournament: { id: "open_play", name: "Open Play", targetScore: 11, winByTwo: true, matches } };
     let pendingConfirm = null;
     const confirmationController = { open: (details, onConfirm) => { pendingConfirm = onConfirm; return true; } };
     const session = { user: () => admin1 };
     const isStaff = () => true;
     const showToast = () => {};
     const update = () => {};
     const scrollToPageTopSoon = () => {};
     const saveActiveGame = () => {};
     const resumeGame = () => {};
     const refreshSharedTournament = async () => {};
     const normalizeTournament = (tournament) => tournament;
     const cleanName = (value, fallback) => String(value || "").trim() || fallback;
     const clampNumber = (value, min, max) => Math.min(max, Math.max(min, Number(value) || min));
     const currentUserSummary = () => admin1;
     const gameTitle = () => "Match";
     const finalScore = () => "0-0";
     const escapeHtml = (value) => String(value);
     const escapeAttr = escapeHtml;
     async function postSharedTournamentMatch(change) {
       const match = state.tournament.matches.find((item) => item.id === change.matchId);
       Object.assign(match, { status: change.status, startedBy: change.status === "scheduled" ? null : change.startedBy, activeGameId: change.status === "in_progress" ? change.activeGameId : null });
       return { ok: true };
     }
     ${names.map(source).join("\n")}
     return {
       state,
       startTournamentMatch,
       async confirm(reason) {
         const onConfirm = pendingConfirm;
         pendingConfirm = null;
         assert.ok(onConfirm, reason || "a confirmation was requested");
         await onConfirm();
       },
       renderTournamentMatch,
     };`,
  )(rallyEngine, tournamentMatchModule, admin1, [scheduled("r1c1", 1), scheduled("r1c2", 2)], assert);
}

test("replacing the active Match leaves only the new Match ongoing and frees the replaced one", async () => {
  const app = loadApp();
  await app.startTournamentMatch("r1c1");
  await app.confirm("the first Match asks who serves first");
  await app.startTournamentMatch("r1c2");
  await app.confirm("replacing the active Match is confirmed");
  await app.confirm("the replacing Match asks who serves first");

  const ongoing = app.state.tournament.matches.filter((match) => match.status === "in_progress").map((match) => match.id);
  assert.deepEqual(ongoing, ["r1c2"], "only the Match being scored is ongoing");

  const replacedCard = app.renderTournamentMatch(app.state.tournament.matches[0]);
  assert.match(replacedCard, /data-action="start-tournament-match" data-value="r1c1"/, "the replaced Match can be started again");
});
