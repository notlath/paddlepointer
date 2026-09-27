type GeneratedMatch = { round: number; court: number; teamA: [string, string]; teamB: [string, string] };
type Scheduler = {
  buildOpenPlayMatches: (players: string[], courts: number, matchesPerPlayer: number, lockedMatches: unknown[], random?: () => number, skillLevels?: Record<string, string>) => GeneratedMatch[];
};

// Both applications use the established, tested scheduling algorithm during the migration.
const scheduler = require("../../../open-play-scheduler.js") as Scheduler;
export const buildOpenPlayMatches = scheduler.buildOpenPlayMatches;
