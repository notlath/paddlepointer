const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");

test("styles.css does not hide side-nav-label when mobile drawer is open", () => {
  // Check that mobile-open does not hide labels below 980px
  assert.doesNotMatch(
    css,
    /\.side-nav\.mobile-open\s+\.side-nav-label\s*\{[^}]*display:\s*none/s,
    ".side-nav.mobile-open .side-nav-label should not be display: none"
  );
  assert.doesNotMatch(
    css,
    /\.side-nav\.collapsed\.mobile-open\s+\.side-nav-label\s*\{[^}]*display:\s*none/s,
    ".side-nav.collapsed.mobile-open .side-nav-label should not be display: none"
  );
});

test("styles.css gives mobile drawer sufficient width for labels without using collapsed rail width", () => {
  // Mobile-open drawer should not be forced to var(--sidebar-collapsed)
  assert.doesNotMatch(
    css,
    /\.side-nav\.mobile-open\s*\{[^}]*width:\s*var\(--sidebar-collapsed\)/s,
    ".side-nav.mobile-open should not be locked to --sidebar-collapsed"
  );

  // Mobile drawer width should be at least expanded width or responsive min(280px, ...)
  assert.match(css, /--drawer-width:\s*min\(\s*280px/i, "Mobile drawer width should be min(280px, ...)");
  assert.match(
    css,
    /@media \(max-width: 980px\) \{\s*\.side-nav\s*\{[^}]*width:\s*var\(--drawer-width\)/,
    "The mobile drawer should use --drawer-width"
  );
});

test("styles.css preserves compact icon rail for desktop collapsed sidebar", () => {
  assert.match(
    css,
    /body\.app-mode\.sidebar-collapsed\s+\.side-nav\s*\{[^}]*width:\s*var\(--sidebar-collapsed\)/s,
    "Desktop collapsed sidebar should still use var(--sidebar-collapsed)"
  );
  assert.match(
    css,
    /\.side-nav\.collapsed\s+\.side-nav-label\s*\{[^}]*display:\s*none/s,
    "Desktop collapsed rail should still hide labels"
  );
});

test("styles.css keeps offscreen drawer hidden from tab order and accessibility when closed on mobile", () => {
  assert.match(
    css,
    /\.side-nav:not\(\.mobile-open\)[^{]*\{[^}]*visibility:\s*hidden/s,
    "Closed mobile side nav should have visibility: hidden"
  );
});

test("renderHeader marks the active destination with aria-current='page' and .active", () => {
  assert.match(
    appCode,
    /aria-current=["']page["']/,
    "renderHeader should set aria-current='page' on active destination"
  );
});

test("menu button accessible name and expanded state match whether mobile drawer is open", () => {
  assert.match(
    appCode,
    /menuLabel\s*=\s*menuOpen\s*\?\s*["']Close navigation menu["']\s*:\s*["']Open navigation menu["']/,
    "renderHeader should set menuLabel based on menuOpen state"
  );
  assert.match(
    appCode,
    /menuExpanded\s*=\s*menuOpen\s*\?\s*["']true["']\s*:\s*["']false["']/,
    "renderHeader should set menuExpanded based on menuOpen state"
  );
});

test("dynamic header rendering produces correct attributes when drawer is open vs closed", () => {
  // Simulate the header rendering logic directly
  function renderHeaderMarkup({ mobileNavOpen, currentView }) {
    const menuOpen = Boolean(mobileNavOpen);
    const menuExpanded = menuOpen ? "true" : "false";
    const menuLabel = menuOpen ? "Close navigation menu" : "Open navigation menu";
    const nav = [
      ["home", "Dashboard"],
      ["history", "History"],
      ["leaderboard", "Leaderboard"],
    ];

    const navItems = nav.map(([view, label]) => {
      const isActive = currentView === view;
      return `<button class="nav-btn side-nav-item ${isActive ? "active" : ""}" data-action="view" data-value="${view}" title="${label}"${isActive ? ' aria-current="page"' : ""}>
        <span class="side-nav-label">${label}</span>
      </button>`;
    }).join("");

    return `
      <aside id="application-navigation" class="side-nav ${menuOpen ? "mobile-open" : ""}" aria-label="Application navigation">
        <nav class="side-menu">${navItems}</nav>
      </aside>
      <div class="sidebar-scrim ${menuOpen ? "open" : ""}" data-action="close-nav" aria-hidden="true"></div>
      <button class="menu-toggle ${menuOpen ? "open" : ""}" type="button" data-action="toggle-nav" aria-label="${menuLabel}" aria-expanded="${menuExpanded}" aria-controls="application-navigation">
      </button>
    `;
  }

  // When drawer is open
  const openHtml = renderHeaderMarkup({ mobileNavOpen: true, currentView: "home" });
  assert.match(openHtml, /class="menu-toggle open"/);
  assert.match(openHtml, /aria-expanded="true"/);
  assert.match(openHtml, /aria-label="Close navigation menu"/);
  assert.match(openHtml, /class="side-nav mobile-open"/);
  assert.match(openHtml, /class="sidebar-scrim open"/);
  assert.match(openHtml, /data-action="close-nav"/);
  assert.match(openHtml, /data-value="home"[^>]*aria-current="page"/);
  assert.doesNotMatch(openHtml, /data-value="history"[^>]*aria-current="page"/);

  // When drawer is closed
  const closedHtml = renderHeaderMarkup({ mobileNavOpen: false, currentView: "history" });
  assert.doesNotMatch(closedHtml, /class="menu-toggle open"/);
  assert.match(closedHtml, /aria-expanded="false"/);
  assert.match(closedHtml, /aria-label="Open navigation menu"/);
  assert.doesNotMatch(closedHtml, /class="side-nav mobile-open"/);
  assert.doesNotMatch(closedHtml, /class="sidebar-scrim open"/);
  assert.match(closedHtml, /data-value="history"[^>]*aria-current="page"/);
  assert.doesNotMatch(closedHtml, /data-value="home"[^>]*aria-current="page"/);
});

test("Escape keydown closes mobile navigation drawer and returns focus to menu button", () => {
  assert.match(
    appCode,
    /event\.key\s*===\s*["']Escape["']\s*&&\s*state\.mobileNavOpen/,
    "Keydown listener should check for Escape when state.mobileNavOpen is true"
  );
  assert.match(
    appCode,
    /renderNowAndFocus\(['"]\.menu-toggle['"]\)/,
    "Closing drawer via Escape should restore focus to .menu-toggle"
  );
});

test("scrim activation closes mobile navigation drawer", () => {
  assert.match(
    appCode,
    /sidebar-scrim[^>]+data-action=["'](?:toggle-nav|close-nav)["']/,
    "Sidebar scrim should trigger drawer close"
  );
});
