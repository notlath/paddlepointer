const test = require("node:test");
const assert = require("node:assert/strict");

const { tournamentErrors } = require("../open-play-scheduler.js");

const validTournament = {
  courts: 2,
  matchesPerPlayer: 4,
  targetScore: 11,
  transitionMinutes: 3,
  playersText: "Alice\nBob\nCharlie\nDave",
};

test("valid tournament configuration reports no errors", () => {
  assert.deepEqual(tournamentErrors(validTournament), {});
});

test("courts must be an integer between 1 and 16", () => {
  assert.deepEqual(tournamentErrors({ ...validTournament, courts: 1 }), {});
  assert.deepEqual(tournamentErrors({ ...validTournament, courts: 16 }), {});
  assert.deepEqual(tournamentErrors({ ...validTournament, courts: "4" }), {});

  const expected = { courts: "Courts must be between 1 and 16" };
  assert.deepEqual(tournamentErrors({ ...validTournament, courts: 0 }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, courts: -1 }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, courts: 17 }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, courts: 25 }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, courts: 1.5 }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, courts: "" }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, courts: "   " }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, courts: "abc" }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, courts: NaN }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, courts: null }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, courts: undefined }), expected);
});

test("matches per player must be an integer between 1 and 30", () => {
  assert.deepEqual(tournamentErrors({ ...validTournament, matchesPerPlayer: 1 }), {});
  assert.deepEqual(tournamentErrors({ ...validTournament, matchesPerPlayer: 30 }), {});
  assert.deepEqual(tournamentErrors({ ...validTournament, matchesPerPlayer: "5" }), {});

  const expected = { matchesPerPlayer: "Matches per player must be between 1 and 30" };
  assert.deepEqual(tournamentErrors({ ...validTournament, matchesPerPlayer: 0 }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, matchesPerPlayer: -1 }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, matchesPerPlayer: 31 }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, matchesPerPlayer: 2.5 }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, matchesPerPlayer: "" }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, matchesPerPlayer: "many" }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, matchesPerPlayer: null }), expected);
});

test("target score must be an integer between 1 and 99", () => {
  assert.deepEqual(tournamentErrors({ ...validTournament, targetScore: 1 }), {});
  assert.deepEqual(tournamentErrors({ ...validTournament, targetScore: 99 }), {});
  assert.deepEqual(tournamentErrors({ ...validTournament, targetScore: "11" }), {});

  const expected = { targetScore: "Target score must be between 1 and 99" };
  assert.deepEqual(tournamentErrors({ ...validTournament, targetScore: 0 }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, targetScore: -5 }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, targetScore: 100 }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, targetScore: 11.5 }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, targetScore: "" }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, targetScore: "fifteen" }), expected);
});

test("transition minutes must be an integer between 0 and 20", () => {
  assert.deepEqual(tournamentErrors({ ...validTournament, transitionMinutes: 0 }), {});
  assert.deepEqual(tournamentErrors({ ...validTournament, transitionMinutes: 20 }), {});
  assert.deepEqual(tournamentErrors({ ...validTournament, transitionMinutes: "0" }), {});
  assert.deepEqual(tournamentErrors({ ...validTournament, transitionMinutes: "5" }), {});

  const expected = { transitionMinutes: "Transition minutes must be between 0 and 20" };
  assert.deepEqual(tournamentErrors({ ...validTournament, transitionMinutes: -1 }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, transitionMinutes: 21 }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, transitionMinutes: 2.5 }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, transitionMinutes: "" }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, transitionMinutes: "slow" }), expected);
});

test("players requires at least 4 unique registered players", () => {
  const expected = { playersText: "Add at least 4 registered players" };

  assert.deepEqual(tournamentErrors({ ...validTournament, playersText: "" }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, playersText: "   " }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, playersText: "Alice" }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, playersText: "Alice, Bob, Charlie" }), expected);
  // Case-insensitive duplicate detection
  assert.deepEqual(tournamentErrors({ ...validTournament, playersText: "Alice\nBob\nCharlie\nalice" }), expected);
  assert.deepEqual(tournamentErrors({ ...validTournament, playersText: "Alice, Bob, Charlie, Alice, Bob" }), expected);

  // Comma and newline separated valid players
  assert.deepEqual(tournamentErrors({ ...validTournament, playersText: "Alice, Bob, Charlie, Dave" }), {});
  assert.deepEqual(tournamentErrors({ ...validTournament, playersText: "Alice\nBob\nCharlie\nDave\nEve" }), {});
});

test("tournament errors report in DOM field order", () => {
  const allInvalid = tournamentErrors({
    courts: 0,
    matchesPerPlayer: 0,
    targetScore: 0,
    transitionMinutes: -1,
    playersText: "",
  });

  assert.deepEqual(Object.keys(allInvalid), [
    "courts",
    "matchesPerPlayer",
    "targetScore",
    "transitionMinutes",
    "playersText",
  ]);

  const partialInvalid = tournamentErrors({
    ...validTournament,
    matchesPerPlayer: 50,
    playersText: "Only One",
  });

  assert.deepEqual(Object.keys(partialInvalid), ["matchesPerPlayer", "playersText"]);
});
