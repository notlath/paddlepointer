const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");

// Extract renderLogin from app.js to test portal markup
const extractRenderLogin = () => {
  const helpersMatch = appCode.match(/(function authPortalTheme[\s\S]+?function authFieldError\([\s\S]+?\n  \})/);
  assert.ok(helpersMatch, "auth helper functions must be extractable from app.js");

  const renderButtonsMatch = appCode.match(/function renderLoginPortalButtons\(activePortal\) \{[\s\S]*?\n  \}/);
  assert.ok(renderButtonsMatch, "renderLoginPortalButtons must exist in app.js");

  const escapeFn = (str) =>
    String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const fn = new Function(
    "state",
    "escapeHtml",
    "escapeAttr",
    `${renderButtonsMatch[0]}
    ${helpersMatch[1]}
    return renderLogin();`
  );

  return (portal, overrides = {}) => {
    const state = {
      authForm: {
        portal,
        username: "",
        password: "",
        visitorName: "",
        errors: {},
        failure: "",
        pending: false,
        ...overrides,
      },
    };
    return fn(state, escapeFn, escapeFn);
  };
};

const renderLoginPortal = extractRenderLogin();

test("Criterion 1 & 2: all three portals render in a dark asymmetric shell with one restrained accent", () => {
  for (const portal of ["admin", "player", "visitor"]) {
    const html = renderLoginPortal(portal);

    // Dark navy shell
    assert.match(html, /class="[^"]*clean-auth-shell[^"]*"/, `${portal} must use clean-auth-shell`);
    assert.match(html, /class="[^"]*dark-auth-shell[^"]*"/, `${portal} must use dark-auth-shell`);

    // White logo and existing product promise live in the shared brand rail
    assert.match(
      html,
      /<div class="auth-brand-rail">[\s\S]*?<div class="auth-login-logo">\s*<img src="assets\/paddlepoint-logo-w-h\.webp"/,
      `${portal} must render the white horizontal logo`
    );
    assert.match(html, /<p class="auth-brand-tagline">Tap to score\.<br>Rules handled\.<\/p>/);
    assert.doesNotMatch(
      html,
      /assets\/mtc-paddlepoint-logo-cl\.webp/,
      `${portal} must not render colored logo block`
    );
  }

  // Stylesheet enforces the asymmetric desktop composition and one shared accent
  assert.match(
    css,
    /\.auth-shell\.clean-auth-shell\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.05fr\)\s+minmax\(420px,\s*0\.95fr\);[^}]*width:\s*min\(1120px,\s*100%\);[^}]*max-width:\s*1120px;/s
  );
  assert.match(
    css,
    /\.dark-auth-shell\s+\.auth-card\s*\{[^}]*border-radius:\s*var\(--radius-lg\);[^}]*box-shadow:\s*none;/s,
    "dark-auth-shell card must use the large radius token and sit flat on the navy shell"
  );
  assert.match(css, /\.dark-auth-shell\s+\.auth-card\s*\{[^}]*border-top:\s*3px solid var\(--color-auth-accent\);/s);
  assert.match(
    css,
    /\.dark-auth-shell\s+\.row-actions\s+\.button\.primary\s*\{[^}]*color:\s*var\(--color-on-auth-accent\);[^}]*background:\s*var\(--color-auth-accent\);/s
  );
  assert.doesNotMatch(css, /\.(?:admin|player|visitor)-auth-shell\s+\.auth-card\s*\{/);

  // No separate gradient card backgrounds for player or visitor
  assert.doesNotMatch(css, /\.player-auth-shell\s+\.auth-card\s*\{[^}]*linear-gradient/);
  assert.doesNotMatch(css, /\.visitor-auth-shell\s+\.auth-card\s*\{[^}]*linear-gradient/);
});

test("Criterion 3: each portal states who it is for once (no repetitive access eyebrow, clear heading, Switch portal label)", () => {
  const expectedHeadings = {
    admin: "Admin Sign In",
    player: "Player Sign In",
    visitor: "Visitor Sign In",
  };

  for (const [portal, heading] of Object.entries(expectedHeadings)) {
    const html = renderLoginPortal(portal);

    // No separate eyebrow repeating the role
    assert.doesNotMatch(html, /<p class="eyebrow">/, `${portal} must not render redundant eyebrow`);

    // Heading clearly states role
    assert.match(html, new RegExp(`<h1>[\\s\\S]*?${heading}</h1>`), `${portal} must render heading ${heading}`);

    // Switch portal line says "Switch portal:" without repeating "Active portal: [Role]"
    assert.match(html, /<div class="auth-portal-status">Switch portal:<\/div>/, `${portal} must use Switch portal: status`);
    assert.doesNotMatch(html, /Active portal:/, `${portal} must not repeat Active portal: in status`);
  }
});

test("Criterion 4: consistent Sign In button copy across all portals (and Signing in… when pending)", () => {
  for (const portal of ["admin", "player", "visitor"]) {
    const idleHtml = renderLoginPortal(portal, { pending: false });
    assert.match(
      idleHtml,
      /<button class="button primary" type="submit">Sign In<\/button>/,
      `${portal} must have Sign In button copy`
    );
    assert.doesNotMatch(idleHtml, /Login as Admin|Enter Player Page|Enter Visitor Page/);

    const pendingHtml = renderLoginPortal(portal, { pending: true });
    assert.match(
      pendingHtml,
      /<button class="button primary" type="submit" disabled aria-busy="true">Signing in…<\/button>/,
      `${portal} pending button must say Signing in… with aria-busy`
    );
  }
});

test("Criterion 5: Visitor optional name field is labeled 'Full name (optional)'", () => {
  const visitorHtml = renderLoginPortal("visitor");
  assert.match(visitorHtml, /<span class="label">Full name \(optional\)<\/span>/);
  assert.doesNotMatch(visitorHtml, /<span class="label">Full name optional<\/span>/);
});

test("Criterion 6: Player 'Password not needed' helper card matches dark-shell card styling", () => {
  const playerHtml = renderLoginPortal("player");
  assert.match(playerHtml, /class="field helper-card login-helper-card"/);
  assert.match(playerHtml, /<strong>Not needed<\/strong>/);
  assert.match(playerHtml, /<span>Players only enter their assigned username\.<\/span>/);

  // Stylesheet helper card styling
  assert.match(
    css,
    /\.login-helper-card\s*\{[^}]*min-height:\s*44px;[^}]*background:\s*var\(--surface-page\);/s,
    "login-helper-card must be styled to match form fields"
  );
});

test("Criterion 7: lock glyph uses consistent SVG stroke style and inherits heading color", () => {
  for (const portal of ["admin", "player", "visitor"]) {
    const html = renderLoginPortal(portal);
    assert.match(
      html,
      /<span class="auth-lock-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false">/,
      `${portal} must use consistent lock SVG stroke`
    );
    // Ensure no hardcoded color fills inside lock SVG
    assert.doesNotMatch(html, /<circle[^>]*fill="#fff"/);
  }

  // Stylesheet lock icon inherits color
  assert.match(
    css,
    /\.auth-lock-icon\s*\{[^}]*color:\s*inherit;/s,
    ".auth-lock-icon must inherit color from heading"
  );
});

test("Criterion 8: switching portals keeps focus on sensible control and does not flash background", () => {
  // Stylesheet sets dark navy background for body.auth-mode and body.player-auth-mode
  assert.match(css, /body\.auth-mode\s*\{[^}]*background:\s*var\(--surface-auth-shell\);/s);
  assert.match(css, /body\.player-auth-mode/);
  assert.match(css, /body\.auth-mode\s+\.page\s*\{[^}]*background:\s*var\(--surface-auth-shell\);/s);

  // In app.js render(), fallback focus moves to username input
  assert.match(
    appCode,
    /else if \(!signedIn && !isRestoring\)\s*\{\s*const fallbackAuthInput = app\.querySelector\('\[data-auth-field="username"\]'\);\s*if \(fallbackAuthInput && typeof fallbackAuthInput\.focus === "function"\)\s*\{\s*fallbackAuthInput\.focus\(\{ preventScroll: true \}\);/s,
    "render() must restore focus to username field in auth mode when switch button is gone"
  );
});

test("Criterion 9: validation errors, sign-in failure, pending state, and session restore display in dark shell", () => {
  // Field errors in dark shell
  const withErrors = renderLoginPortal("admin", {
    errors: { username: "Enter your username", password: "Enter your password" },
  });
  assert.match(withErrors, /aria-invalid="true"/);
  assert.match(withErrors, /<span class="field-error" id="auth-username-error">Enter your username<\/span>/);
  assert.match(withErrors, /<span class="field-error" id="auth-password-error">Enter your password<\/span>/);

  // Failure banner
  const withFailure = renderLoginPortal("visitor", { failure: "Invalid credentials" });
  assert.match(withFailure, /<div class="auth-failure full-width" id="auth-failure">Invalid credentials<\/div>/);
  assert.match(withFailure, /aria-describedby="auth-failure"/);

  // Session restore uses dark-auth-shell and white logo
  assert.match(
    css,
    /\.dark-auth-shell\s+\.session-loading-card\s*\{[^}]*background:\s*transparent;/s
  );
  assert.match(
    css,
    /\.dark-auth-shell\s+\.session-loading-spinner\s*\{[^}]*border-top-color:\s*var\(--color-auth-accent\);/s
  );
  assert.match(
    css,
    /\.dark-auth-shell\s+\.session-loading-message\s*\{[^}]*color:\s*var\(--color-on-dark-muted\);/s
  );
});

test("Criterion 10: short-viewport and 375px mobile layouts keep primary action visible without horizontal scroll", () => {
  // Mobile container width is constrained to viewport without horizontal scroll
  assert.match(css, /@media\s*\(max-width:\s*767px\)[\s\S]*?\.auth-shell\.clean-auth-shell\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[^}]*width:\s*min\(560px,\s*100%\);[^}]*max-width:\s*560px;/s);
  assert.match(css, /body\.auth-mode\s+\.page\s*\{[^}]*padding:\s*clamp\(16px,\s*3\.2vh,\s*32px\)\s*16px;/s);

  // Short viewport query tunes padding, logo, and gaps
  const shortQueryMatch = css.match(/@media\s*\(max-height:\s*700px\)\s*and\s*\(max-width:\s*767px\)[\s\S]*?\{([\s\S]*?\n\})/);
  assert.ok(shortQueryMatch, "Short viewport media query must exist");
  const shortBody = shortQueryMatch[1];
  assert.ok(shortBody.includes("padding: 16px 20px"), "Short viewport scales card padding");
  assert.ok(shortBody.includes(".auth-login-logo"), "Short viewport scales auth logo");

  assert.match(
    css,
    /@media\s*\(max-height:\s*700px\)\s*and\s*\(min-width:\s*768px\)\s*and\s*\(max-width:\s*900px\)[\s\S]*?\.auth-brand-rail\s*\{[^}]*min-height:\s*340px;[^}]*padding:\s*20px;[\s\S]*?\.auth-brand-tagline\s*\{[^}]*display:\s*none;/s,
    "Short landscape viewports compact the brand rail instead of cropping its statement"
  );
});
