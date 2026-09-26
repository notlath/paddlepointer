const test = require("node:test");
const assert = require("node:assert/strict");
const navigationFocus = require("../navigation-focus.js");

function createMockElement(tagName, attrs = {}) {
  let focused = false;
  let focusOptions = null;
  const attributes = { ...attrs };

  return {
    tagName: tagName.toUpperCase(),
    attributes,
    textContent: attrs.textContent || "",
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    getAttribute(name) {
      return attributes[name] !== undefined ? attributes[name] : null;
    },
    hasAttribute(name) {
      return attributes[name] !== undefined;
    },
    focus(options) {
      focused = true;
      focusOptions = options;
    },
    get isFocused() {
      return focused;
    },
    get focusOptions() {
      return focusOptions;
    },
  };
}

function createMockContainer({ heading, main }) {
  return {
    querySelector(selector) {
      if (selector === "#main-content h1") {
        return heading || null;
      }
      if (selector === "#main-content") {
        return main || null;
      }
      return null;
    },
  };
}

test("focusDestinationHeading focuses view heading with tabindex=-1 and preventScroll", () => {
  assert.ok(navigationFocus, "navigation-focus.js module must exist");
  const heading = createMockElement("h1", { textContent: "Courtside Board" });
  const main = createMockElement("main", { id: "main-content" });
  const container = createMockContainer({ heading, main });

  const result = navigationFocus.focusDestinationHeading(container);

  assert.equal(result, true);
  assert.equal(heading.isFocused, true);
  assert.equal(heading.getAttribute("tabindex"), "-1");
  assert.deepEqual(heading.focusOptions, { preventScroll: true });
});

test("focusDestinationHeading falls back to #main-content if no heading is found", () => {
  assert.ok(navigationFocus, "navigation-focus.js module must exist");
  const main = createMockElement("main", { id: "main-content" });
  const container = createMockContainer({ heading: null, main });

  const result = navigationFocus.focusDestinationHeading(container);

  assert.equal(result, true);
  assert.equal(main.isFocused, true);
  assert.equal(main.getAttribute("tabindex"), "-1");
  assert.deepEqual(main.focusOptions, { preventScroll: true });
});

test("focusDestinationHeading returns false gracefully if container has neither heading nor main", () => {
  assert.ok(navigationFocus, "navigation-focus.js module must exist");
  const container = createMockContainer({ heading: null, main: null });

  const result = navigationFocus.focusDestinationHeading(container);

  assert.equal(result, false);
});

test("getViewHeadingTitle extracts heading text cleanly", () => {
  assert.ok(navigationFocus, "navigation-focus.js module must exist");
  const heading = createMockElement("h1", { textContent: "  Doubles Mixer  " });
  const container = createMockContainer({ heading, main: null });

  assert.equal(navigationFocus.getViewHeadingTitle(container), "Doubles Mixer");
});

test("styles.css defines skip-link, focus-visible states, and un-outlined programmatic focus", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");

  assert.match(css, /\.skip-link\s*\{/);
  assert.match(css, /\.skip-link:focus/);
  assert.match(css, /#main-content:focus/);
  assert.match(css, /h1\[tabindex="-1"\]:focus/);
});

test("index.html includes skip link pointing to #main-content before #app", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

  const skipLinkIndex = html.indexOf('href="#main-content"');
  const appIndex = html.indexOf('id="app"');

  assert.ok(skipLinkIndex > -1, "Skip link pointing to #main-content must exist in index.html");
  assert.ok(appIndex > -1, "app container must exist in index.html");
  assert.ok(skipLinkIndex < appIndex, "Skip link must precede #app in index.html");
  assert.match(html, /class="skip-link"/);
});

test("index.html loads navigation-focus.js before app.js", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

  const navFocusIndex = html.indexOf('src="navigation-focus.js');
  const appIndex = html.indexOf('src="app.js');

  assert.ok(navFocusIndex > -1, "navigation-focus.js must be loaded in index.html");
  assert.ok(appIndex > -1, "app.js must be loaded in index.html");
  assert.ok(navFocusIndex < appIndex, "navigation-focus.js must load before app.js");
});

test("app.js renders main landmark with id=main-content, tabindex=-1, and aria-label=Main content", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");

  assert.match(appCode, /id="main-content"/);
  assert.match(appCode, /tabindex="-1"/);
  assert.match(appCode, /aria-label="Main content"/);
});
