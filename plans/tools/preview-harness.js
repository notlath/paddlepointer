// Preview harness for PaddlePoint layout checks — no login, no database, no files written.
//
// How to use (any Chromium browser, or an agent's browser tool):
//   1. Serve the repo root:  php -S 127.0.0.1:8000 -t .
//   2. Open a NON-app page on the same origin so the app has not booted yet, with the view
//      you want in the query string, e.g.  http://127.0.0.1:8000/DESIGN.md?view=scoreboard
//   3. Paste this whole file into the DevTools console (or a javascript-exec tool) and run it.
//      It fetches index.html, injects a stubbed fetch + a signed-in Super Admin session,
//      drops the Qlik mashup script, and replaces the document in place.
//   4. To load another view, repeat from step 2 (a fresh page load is required: re-running
//      this on an already-booted page fails with "Identifier 'perms' has already been declared").
//
// Views: home, setup, live, tournament, history, leaderboard, people, profile, rules, scoreboard.
// The Scoreboard needs an active Match: boot view=setup, then run startDemoMatch() (defined below,
// available on window after boot), then wait ~1s.
//
// Clean up when finished: run clearPreviewHarness() (removes the fake session and demo Match
// from localStorage for this origin).

(async () => {
  const html = await (await fetch("/index.html")).text();
  const stub = `<script>
    const perms = { manage_users: true, view_all_history: true, manage_tournament: true, score_matches: true,
      view_analytics: true, start_match: true, edit_tournament: true, reset_tournament: true };
    const user = { id: 1, username: "preview", displayName: "Preview Admin", display_name: "Preview Admin", role: "super_admin" };
    localStorage.setItem("ac-pickle-score-auth-v2-admin", JSON.stringify({ token: "preview-only", user, permissions: perms }));
    const J = (o) => Promise.resolve(new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } }));
    window.fetch = (u) => {
      u = String(u);
      if (u.includes("auth.php?action=me")) return J({ ok: true, user, permissions: perms });
      if (u.includes("auth.php?action=users")) return J({ ok: true, users: [] });
      if (u.includes("get-history")) return J({ ok: true, games: [] });
      if (u.includes("get-leaderboard")) return J({ ok: true, gamesCount: 0, playerRows: [], teamRows: [] });
      if (u.includes("user-counts")) return J({ ok: true, counts: { super_admin: 1, admin: 2, player: 14, visitor: 3, totalActive: 20, totalInactive: 1 } });
      if (u.includes("network-info")) return J({ ok: true });
      if (u.includes("get-tournament")) return J({ ok: true, tournament: null });
      return J({ ok: true, game: { id: "preview-game" } });
    };
    // The app renders through requestAnimationFrame, which stalls in hidden/background tabs.
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
    window.startDemoMatch = () => {
      const inputs = [...document.querySelectorAll("input.input")].slice(0, 4);
      ["Ana Cruz", "Ben Lim", "Cara Diaz", "Dan Uy"].forEach((name, i) => {
        inputs[i].value = name;
        inputs[i].dispatchEvent(new Event("input", { bubbles: true }));
      });
      [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Start Match").click();
    };
    window.clearPreviewHarness = () => {
      ["ac-pickle-score-auth-v2-admin", "ac-pickle-score-active-v1", "ac-pickle-score-setup-v1"].forEach((k) => localStorage.removeItem(k));
    };
  <\/script>`;
  const page = html
    .replace("<body>", "<body>" + stub)
    .replace(/<script type="module" src="qlik-mashup[^<]*<\/script>/, "");
  document.open();
  document.write(page);
  document.close();
})();
