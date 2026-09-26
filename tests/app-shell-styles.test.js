const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");

// Top-level @media blocks with their query and body, found by brace matching.
function mediaBlocks(source) {
  const blocks = [];
  const re = /@media([^{]+)\{/g;
  let match;
  while ((match = re.exec(source))) {
    let depth = 1;
    let i = re.lastIndex;
    while (depth > 0 && i < source.length) {
      if (source[i] === "{") depth += 1;
      if (source[i] === "}") depth -= 1;
      i += 1;
    }
    blocks.push({ query: match[1].trim(), start: match.index, end: i, body: source.slice(re.lastIndex, i - 1) });
    re.lastIndex = i;
  }
  return blocks;
}

const blocks = mediaBlocks(css);
const blockAt = (index) => blocks.find((block) => index > block.start && index < block.end);

test("collapsed rail rules apply only at desktop widths, so resizing never shrinks the mobile drawer", () => {
  const matches = [...css.matchAll(/\.side-nav\.collapsed|\.sidebar-collapsed\b/g)];
  assert.ok(matches.length > 0, "collapsed rail rules must exist");
  for (const match of matches) {
    const block = blockAt(match.index);
    assert.ok(
      block && /min-width:\s*981px/.test(block.query) && !/max-width/.test(block.query),
      `collapsed selector at offset ${match.index} must live inside @media (min-width: 981px)`
    );
  }
});

test("one responsive rule path controls the mobile drawer", () => {
  const drawerBlocks = blocks.filter(
    (block) => /max-width:\s*980px/.test(block.query) && /\.side-nav|\.sidebar-scrim|\.side-logo/.test(block.body)
  );
  assert.equal(drawerBlocks.length, 1, "exactly one max-width: 980px block may style the drawer");
  const drawer = drawerBlocks[0].body;
  assert.match(drawer, /\.side-nav\s*\{[^}]*width:\s*var\(--drawer-width\)/, "drawer width is set once on .side-nav");
  assert.doesNotMatch(drawer, /\.side-nav-label|\.side-logo/, "drawer must not re-declare labels or logo treatment");
});

test("legacy top-bar dropdown and navy top bar no longer compete with the shell", () => {
  assert.doesNotMatch(css, /\.top-actions\.open/);
  assert.doesNotMatch(css, /^\s*\.top-actions\s*\{/m, "only .topbar .top-actions may style the actions group");
  assert.doesNotMatch(css, /^\s*\.menu-toggle\s*\{/m, "only .topbar .menu-toggle may style the menu button");
  assert.doesNotMatch(css, /^\s*\.nav-btn(\.icon-only|:hover|\.active)?[\s,{]/m, "shell buttons are styled by their shell classes");
  assert.doesNotMatch(css, /body\.live-tv-mode(\.sidebar-collapsed)?\s+\.(page|topbar)/, "live view reuses the app-mode offsets");
  assert.doesNotMatch(css, /body\.app-mode\s+\.side-nav\s+\.side-nav-item/, "nav density must not out-rank the collapsed rail");
});

test("shell layers and transitions consume the shared tokens", () => {
  const rule = (selector) => {
    const match = css.match(new RegExp(`^${selector.replace(/\./g, "\\.")}\\s*\\{([^}]*)\\}`, "m"));
    assert.ok(match, `${selector} rule must exist`);
    return match[1];
  };
  assert.match(rule(".side-nav"), /z-index:\s*var\(--layer-nav\)/);
  assert.match(rule(".side-nav"), /transition:[^;]*var\(--motion-duration-/);
  assert.match(rule(".topbar"), /z-index:\s*var\(--layer-sticky\)/);
  const drawer = blocks.find((block) => /max-width:\s*980px/.test(block.query) && /\.sidebar-scrim/.test(block.body)).body;
  assert.match(drawer, /\.sidebar-scrim\s*\{[^}]*z-index:\s*calc\(var\(--layer-nav\)/);
  assert.match(drawer, /\.sidebar-scrim\s*\{[^}]*transition:[^;]*var\(--motion-duration-/);
  assert.match(drawer, /\.side-nav\s*\{[^}]*transition:[^;]*var\(--motion-duration-/);
});

test("top-bar identity and logout shrink to fit narrow phones instead of overflowing", () => {
  assert.match(css, /^\.topbar \.top-actions\s*\{[^}]*min-width:\s*0/m, "the actions group must be allowed to shrink");
  assert.match(css, /^\.top-user\s*\{[^}]*min-width:\s*0/m, "the identity chip must be allowed to shrink");
  assert.match(css, /^\.top-user-name\s*\{[^}]*text-overflow:\s*ellipsis/m, "a long name truncates");
});

test("crossing the drawer breakpoint closes the drawer and re-renders the shell", () => {
  assert.match(
    appCode,
    /matchMedia\(["']\(max-width: 980px\)["']\)[\s\S]{0,120}addEventListener\(["']change["'][\s\S]{0,160}mobileNavOpen\s*=\s*false[\s\S]{0,60}update\(\)/
  );
});
