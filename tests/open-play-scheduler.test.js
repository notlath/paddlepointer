const test = require("node:test");
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");

const { buildOpenPlayMatches } = require("../open-play-scheduler.js");

const players = ["Ada", "Bea", "Cora", "Dina", "Elle", "Faye", "Gina", "Hope"];
const fixedRandom = () => 0.5;

function seededRandom(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function playerCounts(matches) {
  return matches.reduce((counts, match) => {
    [...match.teamA, ...match.teamB].forEach((player) => counts.set(player, (counts.get(player) || 0) + 1));
    return counts;
  }, new Map());
}

function mostGamesWithOnePartner(matches) {
  const pairings = new Map();
  matches.forEach((match) => {
    [match.teamA, match.teamB].forEach((team) => {
      const pair = team.slice().sort().join("::");
      pairings.set(pair, (pairings.get(pair) || 0) + 1);
    });
  });
  return Math.max(...pairings.values());
}

function mostGamesAgainstOneOpponent(matches) {
  const opponents = new Map();
  matches.forEach((match) => {
    match.teamA.forEach((first) => match.teamB.forEach((second) => {
      const pair = [first, second].sort().join("::");
      opponents.set(pair, (opponents.get(pair) || 0) + 1);
    }));
  });
  return Math.max(...opponents.values());
}

test("every player receives the requested number of games", () => {
  const matches = buildOpenPlayMatches(players, 2, 3, [], fixedRandom);
  const counts = playerCounts(matches);

  players.forEach((player) => assert.ok(counts.get(player) >= 3, `${player} only received ${counts.get(player) || 0} games`));
});

test("rounds do not reuse players or exceed the court count", () => {
  const matches = buildOpenPlayMatches(players, 2, 3, [], fixedRandom);
  const rounds = matches.reduce((grouped, match) => {
    if (!grouped.has(match.round)) grouped.set(match.round, []);
    grouped.get(match.round).push(match);
    return grouped;
  }, new Map());

  rounds.forEach((round) => {
    assert.ok(round.length <= 2);
    assert.equal(new Set(round.flatMap((match) => [...match.teamA, ...match.teamB])).size, round.length * 4);
  });
});

test("regeneration preserves completed and in-progress matches", () => {
  const locked = [
    { id: "done", round: 1, court: 1, teamA: ["Ada", "Bea"], teamB: ["Cora", "Dina"], scoreA: "11", scoreB: "4", status: "completed", winner: "A" },
    { id: "live", round: 2, court: 1, teamA: ["Elle", "Faye"], teamB: ["Gina", "Hope"], scoreA: "3", scoreB: "2", status: "in_progress", winner: null },
  ];

  const matches = buildOpenPlayMatches(players, 2, 3, locked, fixedRandom);

  assert.deepEqual(matches.filter((match) => ["done", "live"].includes(match.id)), locked);
  assert.deepEqual(locked[0].teamA, ["Ada", "Bea"], "the input is not mutated");
});

[
  { playerCount: 48, limit: 200, label: "200 ms" },
  { playerCount: 100, limit: 2000, label: "2 seconds" },
].forEach(({ playerCount, limit, label }) => {
  test(`generates a ${playerCount}-player schedule in under ${label}`, () => {
    const largePlayerList = Array.from({ length: playerCount }, (_, index) => `Player ${index + 1}`);
    const startedAt = performance.now();

    buildOpenPlayMatches(largePlayerList, 4, 4, [], fixedRandom);

    assert.ok(performance.now() - startedAt < limit);
  });
});

test("does not repeat partners for 16- and 32-player schedules", () => {
  [16, 32].forEach((playerCount) => {
    const playerList = Array.from({ length: playerCount }, (_, index) => `Player ${index + 1}`);
    const matches = buildOpenPlayMatches(playerList, 4, 4, [], fixedRandom);

    assert.equal(mostGamesWithOnePartner(matches), 1);
  });
});

test("non-multiple-of-four schedules pack rounds and share sit-outs", () => {
  for (const [count, courts] of [[10, 2], [13, 3], [17, 4], [22, 4], [30, 6]]) {
    const roster = Array.from({ length: count }, (_, index) => `Player ${index + 1}`);
    const matches = buildOpenPlayMatches(roster, courts, 6, [], seededRandom(9000 + count));
    const rounds = new Map();
    for (const match of matches) {
      if (!rounds.has(match.round)) rounds.set(match.round, []);
      rounds.get(match.round).push(match);
    }
    const capacity = Math.min(courts, Math.floor(count / 4));
    assert.equal(rounds.size, Math.ceil(Math.ceil(count * 6 / 4) / capacity), `${count} Players: extra Rounds`);
    const counts = playerCounts(matches);
    assert.ok(Math.max(...counts.values()) - Math.min(...counts.values()) <= 1, `${count} Players: uneven Matches`);
    let previousSitOuts = new Set();
    for (const round of rounds.values()) {
      assert.ok(round.length <= capacity);
      const active = round.flatMap((match) => [...match.teamA, ...match.teamB]);
      assert.equal(new Set(active).size, active.length, `${count} Players: repeated in a Round`);
      const sittingOut = new Set(roster.filter((player) => !active.includes(player)));
      assert.deepEqual([...sittingOut].filter((player) => previousSitOuts.has(player)), [], `${count} Players: consecutive sit-out`);
      previousSitOuts = sittingOut;
    }
  }
});

test("regeneration packs around a locked Match without moving it", () => {
  const roster = Array.from({ length: 13 }, (_, index) => `Player ${index + 1}`);
  const original = buildOpenPlayMatches(roster, 3, 6, [], seededRandom(13));
  const locked = { ...original[0], status: "completed", scoreA: "11", scoreB: "8", winner: "A" };
  const matches = buildOpenPlayMatches(roster, 3, 6, [locked], seededRandom(13));
  assert.deepEqual(matches.find((match) => match.id === locked.id), locked);
  assert.equal(Math.max(...matches.map((match) => match.round)), 7);
  const laterLocked = { ...original[15], status: "completed", scoreA: "11", scoreB: "8", winner: "A" };
  const regenerated = buildOpenPlayMatches(roster, 3, 6, [laterLocked], seededRandom(13));
  assert.deepEqual(regenerated.find((match) => match.id === laterLocked.id), laterLocked);
  const counts = playerCounts(regenerated);
  assert.ok(Math.max(...counts.values()) - Math.min(...counts.values()) <= 1);
});

test("unavoidable consecutive sit-outs do not add Rounds", () => {
  const roster = Array.from({ length: 17 }, (_, index) => `Player ${index + 1}`);
  const matches = buildOpenPlayMatches(roster, 2, 1, [], seededRandom(17));
  assert.equal(Math.max(...matches.map((match) => match.round)), 3);
});

test("a locked final Match does not force a consecutive sit-out", () => {
  for (const [count, courts] of [[10, 2], [22, 4]]) {
    const roster = Array.from({ length: count }, (_, index) => `Player ${index + 1}`);
    const original = buildOpenPlayMatches(roster, courts, 6, [], seededRandom(count));
    const locked = { ...original.at(-1), status: "completed" };
    const matches = buildOpenPlayMatches(roster, courts, 6, [locked], seededRandom(count));
    assert.deepEqual(matches.find((match) => match.id === locked.id), locked);
    const finalRound = Math.max(...matches.map((match) => match.round));
    const active = (round) => new Set(matches.filter((match) => match.round === round).flatMap((match) => [...match.teamA, ...match.teamB]));
    const previousSitOuts = roster.filter((player) => !active(finalRound - 1).has(player));
    previousSitOuts.forEach((player) => assert.ok(active(finalRound).has(player), `${count} Players: ${player} sits twice`));
  }
});

test("Open Play opponents vary across the Schedule", () => {
  for (const [count, courts, games, opponentLimit] of [[8, 2, 7, 3], [16, 4, 6, 2]]) {
    const roster = Array.from({ length: count }, (_, index) => `Player ${index + 1}`);
    const matches = buildOpenPlayMatches(roster, courts, games, [], seededRandom(8));
    assert.ok(mostGamesAgainstOneOpponent(matches) <= opponentLimit, `${count} Players meet one opponent too often`);
    assert.ok(mostGamesWithOnePartner(matches) <= 2, `${count} Players repeat partners too often`);
    assert.equal(Math.max(...matches.map((match) => match.round)), games);
  }
});

const LEVEL = { beginner: 1, intermediate: 2, advanced: 3 };
const mixedRoster = Array.from({ length: 16 }, (_, index) => `Player ${index + 1}`);
const mixedLevels = Object.fromEntries(mixedRoster.map((player, index) => [player, ["beginner", "intermediate", "advanced"][index % 3]]));

function averageTeamGap(matches, levels) {
  const teamLevel = (team) => team.reduce((sum, player) => sum + LEVEL[levels[player]], 0);
  return matches.reduce((sum, match) => sum + Math.abs(teamLevel(match.teamA) - teamLevel(match.teamB)), 0) / matches.length;
}

const withoutIds = (matches) => matches.map(({ id, ...match }) => match);

test("Teams come out closer in total Skill level than an unbalanced Schedule with the same seed", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const unbalanced = buildOpenPlayMatches(mixedRoster, 4, 6, [], seededRandom(seed));
    const balanced = buildOpenPlayMatches(mixedRoster, 4, 6, [], seededRandom(seed), mixedLevels);
    assert.ok(averageTeamGap(balanced, mixedLevels) < averageTeamGap(unbalanced, mixedLevels), `seed ${seed}`);
  }
});

test("with every Player Unrated the Schedule is identical to an unbalanced one", () => {
  const unbalanced = buildOpenPlayMatches(mixedRoster, 4, 6, [], seededRandom(7));
  assert.deepEqual(withoutIds(buildOpenPlayMatches(mixedRoster, 4, 6, [], seededRandom(7), {})), withoutIds(unbalanced));
  assert.deepEqual(withoutIds(buildOpenPlayMatches(mixedRoster, 4, 6, [], seededRandom(7), undefined)), withoutIds(unbalanced));
});

test("balancing keeps repeat partners and opponents within one of an unbalanced Schedule", () => {
  for (const seed of [11, 12, 13]) {
    const unbalanced = buildOpenPlayMatches(mixedRoster, 4, 6, [], seededRandom(seed));
    const balanced = buildOpenPlayMatches(mixedRoster, 4, 6, [], seededRandom(seed), mixedLevels);
    assert.ok(mostGamesWithOnePartner(balanced) <= mostGamesWithOnePartner(unbalanced) + 1, `seed ${seed}: partners`);
    assert.ok(mostGamesAgainstOneOpponent(balanced) <= mostGamesAgainstOneOpponent(unbalanced) + 1, `seed ${seed}: opponents`);
  }
});

test("an Unrated Player counts as the average level of the rated Players", () => {
  // Rated average is (3 + 1 + 1) / 3 = 1.67, so the Unrated Player partners a Beginner and the Advanced
  // Player partners the other (4 vs 2.67). Counting Unrated as 0 would pair Unrated with Advanced instead.
  // (With four Players, counting Unrated as Intermediate happens to pick the same split, so this can't tell those apart.)
  const roster = ["Ace", "Bo", "Cy", "Uno"];
  const levels = { ace: "advanced", Bo: "beginner", CY: "Beginner" };
  for (const seed of [1, 2, 3]) {
    const [match] = buildOpenPlayMatches(roster, 1, 1, [], seededRandom(seed), levels);
    const aceTeam = match.teamA.includes("Ace") ? match.teamA : match.teamB;
    assert.ok(!aceTeam.includes("Uno"), `seed ${seed}: ${JSON.stringify(match)}`);
  }
});

test("Update Schedule leaves locked Matches untouched and balances only new ones", () => {
  const original = buildOpenPlayMatches(mixedRoster, 4, 6, [], seededRandom(21));
  const locked = original.slice(0, 4).map((match) => ({ ...match, status: "completed", scoreA: "11", scoreB: "5", winner: "A" }));
  const matches = buildOpenPlayMatches(mixedRoster, 4, 6, locked, seededRandom(21), mixedLevels);
  locked.forEach((match) => assert.deepEqual(matches.find((item) => item.id === match.id), match));
  const fresh = matches.filter((match) => !locked.some((item) => item.id === match.id));
  const unbalancedFresh = buildOpenPlayMatches(mixedRoster, 4, 6, locked, seededRandom(21))
    .filter((match) => !locked.some((item) => item.id === match.id));
  assert.ok(averageTeamGap(fresh, mixedLevels) < averageTeamGap(unbalancedFresh, mixedLevels));
});

test("Generate and Update Schedule pass the Players' Skill levels to the scheduler", () => {
  const appCode = require("node:fs").readFileSync(require("node:path").join(__dirname, "../app.js"), "utf8");
  assert.match(appCode, /await fetchPlayers\(false\);\s*const skillLevels = /, "levels are reloaded at Generate time");
  assert.match(appCode, /skillLevels = Object\.fromEntries\(\(state\.players \|\| \[\]\)[^;]*player\.skillLevel\]\)\);/);
  assert.match(appCode, /buildOpenPlayMatches\(players, courts, matchesPerPlayer, lockedMatches, undefined, skillLevels\)/);
});

test("a roster name matches its Player regardless of case and repeated spaces", () => {
  const roster = mixedRoster.map((player) => player.replace(" ", "  ").toUpperCase());
  const levels = Object.fromEntries(Object.entries(mixedLevels).map(([name, level]) => [name.toLowerCase(), level]));
  const spaced = buildOpenPlayMatches(roster, 4, 6, [], seededRandom(3), levels);
  const unbalanced = buildOpenPlayMatches(roster, 4, 6, [], seededRandom(3));
  assert.notDeepEqual(withoutIds(spaced), withoutIds(unbalanced), "levels were ignored");
});
