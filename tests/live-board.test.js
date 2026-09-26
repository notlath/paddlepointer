const test = require("node:test");
const assert = require("node:assert/strict");

const { buildLiveBoard } = require("../live-board.js");

const now = "2026-09-13T10:02:03.000Z";

function match(overrides = {}) {
  return {
    id: "match-1",
    round: 1,
    court: 1,
    teamA: ["Ada", "Bea"],
    teamB: ["Cora", "Dina"],
    scoreA: "",
    scoreB: "",
    status: "scheduled",
    winner: null,
    startedAt: null,
    completedAt: null,
    startedBy: null,
    ...overrides,
  };
}

function tournament(matches = [], courts = 2) {
  return { courts, matches };
}

test("builds a live card from the active Game with a fixed duration", () => {
  const activeGame = {
    status: "active",
    type: "doubles",
    servingTeam: "A",
    serverNumber: 1,
    startedAt: "2026-09-13T10:00:00.000Z",
    createdBy: { displayName: "Sam", role: "admin" },
    tournamentMatch: { matchId: "match-1", round: 1, court: 1 },
    teamA: { name: "Alpha", players: ["Ada", "Bea"], score: 4 },
    teamB: { name: "Bravo", players: ["Cora", "Dina"], score: 2 },
  };

  const board = buildLiveBoard(tournament(), activeGame, now);

  assert.deepEqual(board.ongoingSlots[0], {
    id: "match-1",
    statusType: "live",
    source: "game",
    adminText: "Admin: Sam",
    teamAName: "Alpha",
    teamBName: "Bravo",
    teamAPlayers: ["Ada", "Bea"],
    teamBPlayers: ["Cora", "Dina"],
    scoreA: "4",
    scoreB: "2",
    scoreCallText: "Alpha serving - 4 - 2 - 1",
    statusText: "Live now",
    court: 1,
    round: 1,
    meta: "Round 1 - Court 1",
    startedAt: "2026-09-13T10:00:00.000Z",
    durationText: "2m 3s",
    switchEnds: false,
  });
});

test("fills incomplete doubles players without changing the active Game", () => {
  const activeGame = {
    status: "active",
    type: "doubles",
    servingTeam: "A",
    serverNumber: 1,
    startedAt: "2026-09-13T10:00:00.000Z",
    tournamentMatch: { matchId: "match-1", round: 1, court: 1 },
    teamA: { name: "Alpha", players: ["Ada"], score: 4 },
    teamB: { name: "Bravo", players: [], score: 2 },
  };
  const inputTournament = tournament();
  const before = JSON.stringify({ inputTournament, activeGame });

  const board = buildLiveBoard(inputTournament, activeGame, now);

  assert.deepEqual(board.ongoingSlots[0].teamAPlayers, ["Ada", "Alpha Player 2"]);
  assert.deepEqual(board.ongoingSlots[0].teamBPlayers, ["Bravo Player 1", "Bravo Player 2"]);
  assert.equal(JSON.stringify({ inputTournament, activeGame }), before);
});

test("builds an in-progress Match card with a fixed duration", () => {
  const board = buildLiveBoard(
    tournament([match({ status: "in_progress", scoreA: "7", scoreB: "5", startedAt: "2026-09-13T10:01:00.000Z", startedBy: { displayName: "Jo", role: "super_admin" } })]),
    null,
    now
  );

  assert.equal(board.ongoingSlots[0].statusType, "live");
  assert.equal(board.ongoingSlots[0].scoreCallText, "Started by Jo");
  assert.equal(board.ongoingSlots[0].adminText, "Super Admin: Jo");
  assert.equal(board.ongoingSlots[0].durationText, "1m 3s");
});

test("keeps the latest final on a Court until its next Match starts", () => {
  const final = match({ id: "final", status: "completed", scoreA: "11", scoreB: "8", winner: "A", startedAt: "2026-09-13T09:44:00.000Z", completedAt: "2026-09-13T10:00:00.000Z" });
  const next = match({ id: "next", round: 2, status: "scheduled" });

  const beforeNextStarts = buildLiveBoard(tournament([final, next]), null, now);
  assert.equal(beforeNextStarts.ongoingSlots[0].id, "completed_final");
  assert.equal(beforeNextStarts.ongoingSlots[0].statusType, "completed");
  assert.equal(beforeNextStarts.ongoingSlots[0].durationText, "16m 0s");

  const afterNextStarts = buildLiveBoard(tournament([final, { ...next, status: "in_progress", startedAt: "2026-09-13T10:01:00.000Z" }]), null, now);
  assert.equal(afterNextStarts.ongoingSlots[0].id, "next");
  assert.equal(afterNextStarts.ongoingSlots[0].statusType, "live");
});

test("builds the scheduled queue and labels unscheduled Courts", () => {
  const board = buildLiveBoard(tournament([
    match({ id: "later", round: 2, court: 2, teamA: ["Eva", "Fay"], teamB: ["Gia", "Hal"] }),
    match({ id: "soon", round: 1, court: 2 }),
  ]), null, now);

  assert.equal(board.nextSlots[0].id, "scheduled_soon");
  assert.equal(board.nextSlots[1].id, "scheduled_later");
  assert.equal(board.nextSlots[1].statusType, "scheduled");
  assert.equal(board.ongoingSlots[0].statusType, "available");
  assert.equal(board.ongoingSlots[1].statusType, "available");
  assert.equal(board.ongoingSlots.length, 4);
  assert.equal(board.nextSlots[2].statusType, "unscheduled");
  assert.equal(board.nextSlots.length, 4);
});

test("an early-finishing court gets the earliest Match with free Players", () => {
  const board = buildLiveBoard(tournament([
    match({ id: "finished", court: 1, status: "completed", scoreA: "11", scoreB: "4", winner: "A" }),
    match({ id: "playing", court: 2, status: "in_progress", teamA: ["Iris", "Jade"], teamB: ["Kai", "Lena"] }),
    match({ id: "waiting", round: 2, court: 2, teamA: ["Mira", "Nia"], teamB: ["Oli", "Pia"] }),
  ]), null, now);

  assert.equal(board.nextSlots[0].matchId, "waiting");
  assert.equal(board.nextSlots[0].court, 1);
  assert.equal(board.nextSlots[1].statusType, "unscheduled");
  assert.deepEqual(board.nextMatches.map(({ id, court }) => [id, court]), [["waiting", 1]]);
  assert.equal(board.openCourts, 1);
});

test("the queue skips a Match waiting on a Player who is still playing", () => {
  const board = buildLiveBoard(tournament([
    match({ id: "playing", court: 2, status: "in_progress", teamA: ["Ada", "Bea"], teamB: ["Cora", "Dina"] }),
    match({ id: "blocked", round: 2, court: 2, teamA: [" ada ", "Eva"], teamB: ["Fay", "Gia"] }),
    match({ id: "ready", round: 3, court: 2, teamA: ["Hal", "Ivy"], teamB: ["Jay", "Kay"] }),
  ]), null, now);

  assert.equal(board.nextSlots[0].matchId, "ready");
  assert.deepEqual(board.nextMatches.map(({ id }) => id), ["ready"]);
});

test("labels available and unscheduled Court slots", () => {
  const board = buildLiveBoard(tournament(), null, now);

  assert.deepEqual(board.ongoingSlots[0], {
    id: "available_court_1",
    statusType: "available",
    statusText: "Available",
    court: 1,
    meta: "Court 1",
    detailText: "Ready for a Match",
  });
  assert.deepEqual(board.nextSlots[0], {
    id: "unscheduled_court_1",
    statusType: "unscheduled",
    statusText: "No Match scheduled",
    court: 1,
    meta: "Court 1",
    detailText: "No upcoming Match",
  });
});

test("builds every Court slot when a Tournament has more than four Courts", () => {
  const board = buildLiveBoard(
    tournament([match({ id: "court-six", court: 6, status: "in_progress", scoreA: "7", scoreB: "5", startedAt: "2026-09-13T10:01:00.000Z" }), match({ id: "next-six", court: 6, teamA: ["Eva", "Fay"], teamB: ["Gia", "Hal"] })], 6),
    null,
    now
  );

  assert.equal(board.ongoingSlots.length, 6);
  assert.equal(board.ongoingSlots[5].id, "court-six");
  assert.equal(board.nextSlots.length, 6);
  assert.equal(board.nextSlots[0].id, "scheduled_next-six");
  assert.equal(board.nextSlots[5].statusType, "unscheduled", "a live Court is never queued for another Match");

  const sixteenCourts = buildLiveBoard(tournament([match({ id: "court-sixteen", court: 16, status: "in_progress", scoreA: "7", scoreB: "5", startedAt: "2026-09-13T10:01:00.000Z" })], 16), null, now);
  assert.equal(sixteenCourts.ongoingSlots.length, 16);
  assert.equal(sixteenCourts.ongoingSlots[15].id, "court-sixteen");
});

test("counts a court as open whenever it is not live, including courts whose last Match finished", () => {
  const board = buildLiveBoard(
    tournament(
      [
        match({ id: "live-1", court: 1, status: "in_progress", startedAt: now }),
        match({ id: "live-2", court: 2, status: "in_progress", startedAt: now }),
        match({ id: "done-3", court: 3, status: "completed", scoreA: 11, scoreB: 7, winner: "A", completedAt: now }),
        match({ id: "next-4", court: 4, status: "scheduled" }),
      ],
      6
    ),
    null,
    now
  );

  assert.equal(board.liveCourts, 2);
  assert.equal(board.openCourts, 4);
});
