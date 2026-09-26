(function (root) {
  "use strict";

  const SKILL_VALUES = { beginner: 1, intermediate: 2, advanced: 3 };

  function buildOpenPlayMatches(players, courts, matchesPerPlayer, lockedMatches, random = Math.random, skillLevels) {
    const levels = skillValues(players, skillLevels);
    const playerUsage = new Map(players.map((player) => [player, 0]));
    const futureLockedUsage = new Map(players.map((player) => [player, 0]));
    const partnerCounts = new Map();
    const opponentCounts = new Map();
    const locked = Array.isArray(lockedMatches) ? lockedMatches.map(clone) : [];
    const selected = [];
    const usedIds = new Set(locked.map((match) => match.id));
    const idPrefix = `open_${Date.now()}_`;
    let nextId = 1;
    const targetMatchCount = Math.ceil((players.length * matchesPerPlayer) / 4);
    const groupsPerCycle = Math.max(1, Math.floor(players.length / 4));
    const shuffledPlayers = shuffleArray(players, random);

    locked.forEach((match) => {
      const group = matchPlayers(match);
      group.forEach((player) => {
        if (futureLockedUsage.has(player)) futureLockedUsage.set(player, (futureLockedUsage.get(player) || 0) + 1);
      });
      [match.teamA, match.teamB].forEach((team) => {
        const key = pairKey(team[0], team[1]);
        partnerCounts.set(key, (partnerCounts.get(key) || 0) + 1);
      });
      match.teamA.forEach((first) => match.teamB.forEach((second) => {
        const key = pairKey(first, second);
        opponentCounts.set(key, (opponentCounts.get(key) || 0) + 1);
      }));
    });

    const rounds = [];
    locked.forEach((match) => {
      const roundIndex = Math.max(0, (Number(match.round) || 1) - 1);
      while (rounds.length <= roundIndex) rounds.push({ players: new Set(), matches: [] });
      rounds[roundIndex].matches.push(match);
      matchPlayers(match).forEach((player) => rounds[roundIndex].players.add(player));
    });
    const lockedRoundCount = rounds.length;
    const capacity = Math.min(courts, groupsPerCycle);
    const finalSlots = targetMatchCount % capacity;
    const minimumFinalSlots = Math.ceil((players.length - capacity * 4) / 4);
    const matchCount = minimumFinalSlots <= capacity && finalSlots && finalSlots < minimumFinalSlots
      ? targetMatchCount + minimumFinalSlots - finalSlots
      : targetMatchCount;
    const maximumGames = Math.ceil(matchCount * 4 / players.length);
    let previousSitOuts = new Set();
    for (let index = 0; index < lockedRoundCount || (players.length >= 4 && locked.length + selected.length < matchCount); index += 1) {
      if (!rounds[index]) rounds[index] = { players: new Set(), matches: [] };
      const round = rounds[index];
      round.matches.forEach((match) => matchPlayers(match).forEach((player) => {
        if (!playerUsage.has(player)) return;
        playerUsage.set(player, playerUsage.get(player) + 1);
        futureLockedUsage.set(player, futureLockedUsage.get(player) - 1);
      }));
      const slots = Math.min(capacity - round.matches.length, matchCount - locked.length - selected.length);
      const order = orderedPlayersForCycle(shuffledPlayers, index);
      const rank = new Map(order.map((player, position) => [player, position]));
      const nextRoundMatches = rounds[index + 1]?.matches || [];
      const nextRoundSlots = Math.min(capacity, matchCount - (index + 1) * capacity);
      const needsLockedSitOut = players.length - capacity * 4 > Math.max(0, nextRoundSlots - nextRoundMatches.length) * 4;
      const nextLockedPlayers = needsLockedSitOut ? rounds[index + 1]?.players || new Set() : new Set();
      const available = players.filter((player) => !round.players.has(player))
        .sort((first, second) =>
          Number((playerUsage.get(first) || 0) + (futureLockedUsage.get(first) || 0) >= maximumGames) - Number((playerUsage.get(second) || 0) + (futureLockedUsage.get(second) || 0) >= maximumGames) ||
          Number(previousSitOuts.has(second)) - Number(previousSitOuts.has(first)) ||
          (playerUsage.get(first) || 0) - (playerUsage.get(second) || 0) ||
          Number(nextLockedPlayers.has(first)) - Number(nextLockedPlayers.has(second)) ||
          rank.get(first) - rank.get(second)
        );
      const groups = Math.min(slots, Math.floor(available.length / 4));
      const teams = chooseRoundTeams(available.slice(0, groups * 4), partnerCounts, opponentCounts, random, levels);
      for (let groupIndex = 0; groupIndex < groups; groupIndex += 1) {
        const split = teams[groupIndex];
        const group = [...split.teamA, ...split.teamB];
        while (usedIds.has(`${idPrefix}${nextId}`)) nextId += 1;
        const match = {
          id: `${idPrefix}${nextId++}`,
          round: index + 1,
          court: nextCourtNumber(round.matches),
          teamA: split.teamA,
          teamB: split.teamB,
          scoreA: "",
          scoreB: "",
          status: "scheduled",
          winner: null,
        };
        selected.push(match);
        round.matches.push(match);
        group.forEach((player) => {
          round.players.add(player);
          playerUsage.set(player, (playerUsage.get(player) || 0) + 1);
        });
      }
      previousSitOuts = new Set(players.filter((player) => !round.players.has(player)));
    }

    return rounds.flatMap((round) => round.matches.slice().sort((a, b) => a.court - b.court));
  }

  function chooseRoundTeams(active, partnerCounts, opponentCounts, random, levels) {
    if (!active.length) return [];
    let best = null;
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const order = attempt ? shuffleArray(active, random) : active;
      const partners = new Map(partnerCounts);
      const opponents = new Map(opponentCounts);
      const teams = [];
      for (let index = 0; index < order.length; index += 4) {
        teams.push(splitOpenPlayTeams(order.slice(index, index + 4), partners, opponents, random, levels));
      }
      const partnerValues = [...partners.values()];
      const opponentValues = [...opponents.values()];
      const score = Math.max(0, ...partnerValues) * 10000 + Math.max(0, ...opponentValues) * 10000 +
        partnerValues.reduce((sum, count) => sum + count ** 3, 0) * 10 +
        opponentValues.reduce((sum, count) => sum + count ** 3, 0);
      if (!best || score < best.score) best = { score, teams, partners, opponents };
    }
    partnerCounts.clear();
    opponentCounts.clear();
    best.partners.forEach((count, pair) => partnerCounts.set(pair, count));
    best.opponents.forEach((count, pair) => opponentCounts.set(pair, count));
    return best.teams;
  }

  function splitOpenPlayTeams(group, partnerCounts, opponentCounts, random, levels) {
    const options = [
      { teamA: [group[0], group[1]], teamB: [group[2], group[3]] },
      { teamA: [group[0], group[2]], teamB: [group[1], group[3]] },
      { teamA: [group[0], group[3]], teamB: [group[1], group[2]] },
    ];
    const best = options
      .map((option) => ({
        option,
        score: 4 * ((partnerCounts.get(pairKey(option.teamA[0], option.teamA[1])) || 0) + (partnerCounts.get(pairKey(option.teamB[0], option.teamB[1])) || 0)) +
          option.teamA.reduce((sum, first) => sum + option.teamB.reduce((total, second) => total + (opponentCounts.get(pairKey(first, second)) || 0), 0), 0) +
          teamGap(option, levels) + random() * 0.01,
      }))
      .sort((a, b) => a.score - b.score)[0].option;

    [best.teamA, best.teamB].forEach((team) => {
      const key = pairKey(team[0], team[1]);
      partnerCounts.set(key, (partnerCounts.get(key) || 0) + 1);
    });
    best.teamA.forEach((first) => best.teamB.forEach((second) => {
      const key = pairKey(first, second);
      opponentCounts.set(key, (opponentCounts.get(key) || 0) + 1);
    }));
    return best;
  }

  // Beginner, Intermediate and Advanced count as 1, 2 and 3; an Unrated Player counts as the average of the
  // rated Players on the roster. Returns null when nobody is rated, so the Schedule is unbalanced as before.
  function skillValues(players, skillLevels) {
    const byName = new Map(Object.entries(skillLevels || {}).map(([name, level]) => [playerNameKey(name), SKILL_VALUES[String(level).toLowerCase()]]));
    const rated = players.map((player) => byName.get(playerNameKey(player))).filter(Boolean);
    if (!rated.length) return null;
    const unratedValue = rated.reduce((sum, value) => sum + value, 0) / rated.length;
    return new Map(players.map((player) => [player, byName.get(playerNameKey(player)) || unratedValue]));
  }

  // Matches names the way Players are matched: trimmed, single-spaced, regardless of case.
  function playerNameKey(name) {
    return String(name).trim().replace(/\s+/g, " ").toLowerCase();
  }

  function teamGap(split, levels) {
    if (!levels) return 0;
    const teamLevel = (team) => team.reduce((sum, player) => sum + levels.get(player), 0);
    return Math.abs(teamLevel(split.teamA) - teamLevel(split.teamB));
  }

  function matchPlayers(match) {
    return [...match.teamA, ...match.teamB];
  }

  function pairKey(first, second) {
    return [first, second].map((value) => String(value).toLowerCase()).sort().join("::");
  }

  function orderedPlayersForCycle(players, cycle) {
    const count = players.length;
    let step = count ? (cycle * 2 + 1) % count || 1 : 1;
    while (greatestCommonDivisor(step, count) !== 1) step = (step + 1) % count || 1;
    return players.map((_, index) => players[(cycle + index * step) % count]);
  }

  function greatestCommonDivisor(first, second) {
    while (second) [first, second] = [second, first % second];
    return first;
  }

  function shuffleArray(items, random) {
    const copy = items.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function nextCourtNumber(matches) {
    const usedCourts = new Set(matches.map((match) => Number(match.court)).filter(Boolean));
    let court = 1;
    while (usedCourts.has(court)) court += 1;
    return court;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function parseTournamentPlayers(playersInput) {
    const seen = new Set();
    return String(playersInput || "")
      .split(/[\n,]+/)
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => name.slice(0, 32))
      .filter((name) => {
        const key = name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function isIntegerInRange(value, min, max) {
    if (value === null || value === undefined) return false;
    if (typeof value === "string" && value.trim() === "") return false;
    const num = Number(value);
    if (!Number.isFinite(num) || Math.floor(num) !== num) return false;
    return num >= min && num <= max;
  }

  function tournamentErrors(tournament) {
    const config = tournament || {};
    const errors = {};

    if (!isIntegerInRange(config.courts, 1, 16)) {
      errors.courts = "Courts must be between 1 and 16";
    }

    if (!isIntegerInRange(config.matchesPerPlayer, 1, 30)) {
      errors.matchesPerPlayer = "Matches per player must be between 1 and 30";
    }

    if (!isIntegerInRange(config.targetScore, 1, 99)) {
      errors.targetScore = "Target score must be between 1 and 99";
    }

    if (!isIntegerInRange(config.transitionMinutes, 0, 20)) {
      errors.transitionMinutes = "Transition minutes must be between 0 and 20";
    }

    const players = parseTournamentPlayers(config.playersText);
    if (players.length < 4) {
      errors.playersText = "Add at least 4 registered players";
    }

    return errors;
  }

  const scheduler = {
    buildOpenPlayMatches,
    parseTournamentPlayers,
    tournamentErrors,
  };
  root.OpenPlayScheduler = scheduler;
  if (typeof module === "object" && module.exports) module.exports = scheduler;
})(typeof globalThis === "object" ? globalThis : window);
