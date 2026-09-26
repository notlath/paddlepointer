(function (root) {
  "use strict";

  const PLACEHOLDER_NAMES = new Set([
    "player 1",
    "player 2",
    "a - player 1",
    "a - player 2",
    "b - player 1",
    "b - player 2",
  ]);

  function setupErrors(setup = {}) {
    const isDoubles = setup.type === "doubles";
    const fields = isDoubles
      ? ["teamAPlayer1", "teamAPlayer2", "teamBPlayer1", "teamBPlayer2"]
      : ["teamAPlayer1", "teamBPlayer1"];

    const errors = {};
    const seen = new Map();

    for (const field of fields) {
      const raw = setup[field];
      const trimmed = typeof raw === "string" ? raw.trim() : "";

      if (!trimmed) {
        errors[field] = "Enter a player name";
        continue;
      }

      const normalized = trimmed.toLowerCase();
      if (PLACEHOLDER_NAMES.has(normalized)) {
        errors[field] = "Enter a real player name";
        continue;
      }

      if (seen.has(normalized)) {
        errors[field] = "Player names must be unique";
        continue;
      }

      seen.set(normalized, field);
    }

    return errors;
  }

  function applyVisitorPrefill(setup = {}, user = null, isVisitor = false) {
    if (!user || !isVisitor) return setup;
    const currentP1 = (setup && setup.teamAPlayer1) || "";
    if (typeof currentP1 === "string" && currentP1.trim()) return setup;

    const displayName = typeof user.displayName === "string" ? user.displayName.trim() : "";
    if (!displayName) return setup;

    const normalizedName = displayName.toLowerCase();
    const otherFields = ["teamAPlayer2", "teamBPlayer1", "teamBPlayer2"];
    const alreadyUsed = otherFields.some((field) => {
      const val = setup[field];
      return typeof val === "string" && val.trim().toLowerCase() === normalizedName;
    });

    if (alreadyUsed) return setup;

    return {
      ...setup,
      teamAPlayer1: displayName,
    };
  }

  const api = {
    setupErrors,
    applyVisitorPrefill,
    PLACEHOLDER_NAMES,
  };

  root.PaddlePointSetupValidation = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis === "object" ? globalThis : window);
