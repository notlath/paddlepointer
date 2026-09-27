type Team = "A" | "B";
export type Game = {
  id: string;
  type: "doubles";
  teamA: { name: string; players: string[]; positions: { right: number; left: number }; startingRight: number; score: number };
  teamB: { name: string; players: string[]; positions: { right: number; left: number }; startingRight: number; score: number };
  firstServer: Team;
  servingTeam: Team;
  serverNumber: number;
  currentServerIndex: number;
  targetScore: number;
  winByTwo: boolean;
  status: "active" | "completed";
  winner: Team | null;
  endedEarly: boolean;
  retiredTeam: Team | null;
  sideOuts: number;
  events: Record<string, unknown>[];
  startedAt: string;
  endedAt: string | null;
};

type Engine = {
  createGame: (options: Record<string, unknown>) => Game;
  recordRally: (game: Game, winner: Team, options?: Record<string, unknown>) => unknown;
  undoRally: (game: Game) => Game | null;
  endGameEarly: (game: Game, options?: Record<string, unknown>) => Game | null;
  resetGame: (game: Game, options?: Record<string, unknown>) => Game | null;
  scoreCall: (game: Game) => string;
  servePosition: (game: Game) => { side: "right" | "left" };
  currentServerName: (game: Game) => string;
  detectWinner: (game: Game) => Team | null;
};

// Reuse the tested scoring rules during the migration.
export const rallyEngine = require("../../../rally-engine.js") as Engine;
