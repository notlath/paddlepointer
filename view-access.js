(function (root) {
  "use strict";

  // View access module: decides which nav items, views and match controls a session may use,
  // from the allowed actions in its "who am I" response (see api/access_policy.php) instead of
  // its own role lists. Hiding UI is a convenience; the server still refuses anything it disallows.

  const STAFF_ONLY_VIEWS = new Set(["admin", "tournament", "live", "analytics", "players"]);
  const SUPER_ADMIN_ONLY_VIEWS = new Set(["profile", "people"]);
  const VISITOR_ALLOWED_VIEWS = new Set(["home", "setup", "scoreboard", "summary", "history", "leaderboard", "rules"]);
  const KNOWN_VIEWS = new Set([
    "home",
    "dashboard",
    "admin",
    "setup",
    "live",
    "history",
    "leaderboard",
    "tournament",
    "people",
    "players",
    "profile",
    "rules",
    "scoreboard",
    "summary",
    "analytics",
  ]);

  function isSuperAdmin(permissions) {
    return Boolean(permissions && permissions.manage_users);
  }

  function isStaff(permissions) {
    return Boolean(permissions && permissions.view_all_history);
  }

  function isPlayer(permissions) {
    return Boolean(permissions && permissions.view_own_history);
  }

  function isVisitor(permissions) {
    return Boolean(permissions && permissions.view_visitor_history);
  }

  function canUseStandaloneSetup(permissions) {
    return isSuperAdmin(permissions) || isVisitor(permissions);
  }

  function navigationFor(permissions) {
    if (isSuperAdmin(permissions)) {
      return [
        ["home", "Dashboard"],
        ["setup", "New Match"],
        ["live", "Live"],
        ["history", "History"],
        ["leaderboard", "Leaderboard"],
        ["analytics", "Analytics"],
        ["tournament", "Tournament"],
        ["players", "Players"],
        ["people", "People"],
        ["profile", "Profile"],
        ["rules", "Rules"],
      ];
    }

    if (isStaff(permissions)) {
      return [
        ["home", "Dashboard"],
        ["live", "Live"],
        ["history", "History"],
        ["leaderboard", "Leaderboard"],
        ["analytics", "Analytics"],
        ["tournament", "Tournament"],
        ["players", "Players"],
        ["rules", "Rules"],
      ];
    }

    if (isVisitor(permissions)) {
      return [
        ["home", "Home"],
        ["setup", "New Match"],
        ["history", "History"],
        ["leaderboard", "Leaderboard"],
        ["rules", "Rules"],
      ];
    }

    return [];
  }

  // Decides whether `view` may be shown. Returns the view to show and a refusal message to toast
  // (null when allowed, or when the redirect needs no toast).
  function resolveView(view, permissions) {
    if (typeof view !== "string" || !view.trim()) {
      return { view: "home", message: null };
    }
    const clean = view.trim().toLowerCase();
    const normalized = clean === "dashboard" ? "home" : clean;

    if (!KNOWN_VIEWS.has(normalized)) {
      return { view: "home", message: "Requested view is not available" };
    }
    if (isPlayer(permissions) && !["home", "summary"].includes(normalized)) {
      return { view: "home", message: "Player accounts can view match summaries only" };
    }
    if (isVisitor(permissions) && !VISITOR_ALLOWED_VIEWS.has(normalized)) {
      return { view: "home", message: "Visitor accounts can use New Match, History, Leaderboard, and Rules only" };
    }
    if (normalized === "setup" && !canUseStandaloneSetup(permissions)) {
      return { view: "home", message: "New Match is available to Super Admins and Visitors" };
    }
    if (STAFF_ONLY_VIEWS.has(normalized) && !isStaff(permissions)) {
      return { view: "home", message: "Admin access required" };
    }
    if (SUPER_ADMIN_ONLY_VIEWS.has(normalized) && !isSuperAdmin(permissions)) {
      return { view: "home", message: "Super Admin access required" };
    }
    return { view: normalized, message: null };
  }

  function getViewFromUrl(url) {
    if (!url) return "";
    try {
      const parsed = new URL(url, "https://example.test");
      const value = parsed.searchParams.get("view");
      return value ? value.trim() : "";
    } catch (error) {
      return "";
    }
  }

  function buildViewUrl(url, view) {
    try {
      const parsed = new URL(url || "/", "https://example.test");
      const clean = typeof view === "string" ? view.trim().toLowerCase() : "";
      const target = clean === "dashboard" ? "home" : clean;
      if (!target) {
        parsed.searchParams.delete("view");
      } else {
        parsed.searchParams.set("view", target);
      }
      return parsed.pathname + parsed.search + parsed.hash;
    } catch (error) {
      return view ? `?view=${encodeURIComponent(view)}` : "";
    }
  }

  const viewAccess = {
    KNOWN_VIEWS,
    isSuperAdmin,
    isStaff,
    isPlayer,
    isVisitor,
    canUseStandaloneSetup,
    navigationFor,
    resolveView,
    getViewFromUrl,
    buildViewUrl,
  };
  root.PaddlePointViewAccess = viewAccess;
  if (typeof module === "object" && module.exports) module.exports = viewAccess;
})(typeof globalThis === "object" ? globalThis : window);
