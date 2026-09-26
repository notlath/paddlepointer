const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createToastManager } = require("../toast.js");
const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");

function fakeTimer() {
  let currentTime = 0;
  let nextId = 1;
  const timers = new Map();

  return {
    setTimeout: (callback, delay = 0) => {
      const id = nextId++;
      timers.set(id, { callback, due: currentTime + delay });
      return id;
    },
    clearTimeout: (id) => {
      timers.delete(id);
    },
    advance: (ms) => {
      currentTime += ms;
      for (const [id, t] of Array.from(timers.entries()).sort((a, b) => a[1].due - b[1].due)) {
        if (t.due <= currentTime) {
          timers.delete(id);
          t.callback();
        }
      }
    },
    count: () => timers.size,
  };
}

function fakeContainer() {
  return {
    innerHTML: "",
  };
}

function fakeAnimatedContainer() {
  let html = "";
  let toast = null;

  return {
    get innerHTML() {
      return html;
    },
    set innerHTML(value) {
      html = value;
      const classes = value.match(/class="([^"]*)"/)?.[1].split(/\s+/).filter(Boolean) || [];
      toast = classes.length
        ? {
            classList: {
              add: (...names) => names.forEach((name) => classes.includes(name) || classes.push(name)),
              contains: (name) => classes.includes(name),
            },
          }
        : null;
    },
    querySelector: (selector) => (selector === ".toast" ? toast : null),
  };
}

test("shows toast with role=status and escaped message", () => {
  const container = fakeContainer();
  const timer = fakeTimer();
  const manager = createToastManager({
    container,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
  });

  manager.show("Round 1, Court 2 started <fun>");

  assert.equal(
    container.innerHTML,
    '<div class="toast" role="status">Round 1, Court 2 started &lt;fun&gt;</div>'
  );
  assert.equal(manager.isVisible(), true);
  assert.equal(manager.getMessage(), "Round 1, Court 2 started <fun>");
});

test("leaves every other part of the page untouched when showing and hiding", () => {
  const appContainer = {
    renderCount: 1,
    fieldValue: "Typed notes",
    hasFocus: true,
  };
  const toastContainer = fakeContainer();
  const timer = fakeTimer();
  const manager = createToastManager({
    container: toastContainer,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
  });

  // Showing toast does not alter appContainer
  manager.show("Admin access required");
  assert.equal(appContainer.renderCount, 1);
  assert.equal(appContainer.fieldValue, "Typed notes");
  assert.equal(appContainer.hasFocus, true);

  // Advancing timer to hide toast does not alter appContainer
  timer.advance(2600);
  assert.equal(toastContainer.innerHTML, "");
  assert.equal(manager.isVisible(), false);
  assert.equal(appContainer.renderCount, 1);
  assert.equal(appContainer.fieldValue, "Typed notes");
  assert.equal(appContainer.hasFocus, true);
});

test("disappears after the default delay (2600ms)", () => {
  const container = fakeContainer();
  const timer = fakeTimer();
  const manager = createToastManager({
    container,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
  });

  manager.show("LAN link copied");
  assert.equal(manager.isVisible(), true);

  timer.advance(2599);
  assert.equal(manager.isVisible(), true);
  assert.notEqual(container.innerHTML, "");

  timer.advance(1);
  assert.equal(manager.isVisible(), false);
  assert.equal(container.innerHTML, "");
});

test("reset timer and update message when a new toast appears before delay expires", () => {
  const container = fakeContainer();
  const timer = fakeTimer();
  const manager = createToastManager({
    container,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
  });

  manager.show("First message");
  timer.advance(1500);
  assert.equal(manager.getMessage(), "First message");

  // Trigger second toast
  manager.show("Second message");
  assert.equal(container.innerHTML, '<div class="toast" role="status">Second message</div>');
  assert.equal(manager.getMessage(), "Second message");

  // Advance 1500ms (3000ms from start) — second message should still be visible because timer reset
  timer.advance(1500);
  assert.equal(manager.isVisible(), true);
  assert.equal(container.innerHTML, '<div class="toast" role="status">Second message</div>');

  // Advance remaining 1100ms
  timer.advance(1100);
  assert.equal(manager.isVisible(), false);
  assert.equal(container.innerHTML, "");
});

test("clears container when hidden manually or when empty message is given", () => {
  const container = fakeContainer();
  const timer = fakeTimer();
  const manager = createToastManager({
    container,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
  });

  manager.show("Notice");
  assert.equal(manager.isVisible(), true);

  manager.hide();
  assert.equal(manager.isVisible(), false);
  assert.equal(container.innerHTML, "");
  assert.equal(timer.count(), 0);

  manager.show("Notice 2");
  assert.equal(manager.isVisible(), true);

  manager.show("");
  assert.equal(manager.isVisible(), false);
  assert.equal(container.innerHTML, "");
});

test("supports resolving container lazily via a function", () => {
  let target = null;
  const timer = fakeTimer();
  const manager = createToastManager({
    container: () => target,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
  });

  // Target not yet created
  manager.show("Ignored if target missing");
  assert.equal(manager.isVisible(), false);

  // Target created
  target = fakeContainer();
  manager.show("Now delivered");
  assert.equal(target.innerHTML, '<div class="toast" role="status">Now delivered</div>');
  assert.equal(manager.isVisible(), true);
});

test("exits within the existing toast lifetime and replaces a leaving toast without stacking", () => {
  const container = fakeAnimatedContainer();
  const timer = fakeTimer();
  const manager = createToastManager({
    container,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
  });

  manager.show("First message");
  timer.advance(2440);
  assert.equal(container.querySelector(".toast").classList.contains("is-leaving"), true);
  assert.equal(manager.isVisible(), true);

  manager.show("Second message");
  assert.equal(container.innerHTML, '<div class="toast is-replacing" role="status">Second message</div>');
  assert.equal(timer.count(), 1, "the leaving toast removal is cancelled before the replacement timer starts");

  timer.advance(2439);
  assert.equal(manager.isVisible(), true);
  timer.advance(1);
  assert.equal(container.querySelector(".toast").classList.contains("is-leaving"), true);
  timer.advance(159);
  assert.equal(manager.isVisible(), true);
  timer.advance(1);
  assert.equal(manager.isVisible(), false);
  assert.equal(container.innerHTML, "");
});

test("preserves a custom duration shorter than the exit motion", () => {
  const container = fakeAnimatedContainer();
  const timer = fakeTimer();
  const manager = createToastManager({
    container,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    duration: 100,
  });

  manager.show("Match saved");
  timer.advance(0);
  timer.advance(99);
  assert.equal(manager.isVisible(), true);
  timer.advance(1);
  assert.equal(manager.isVisible(), false);
});

test("toast motion is composited and instant under reduced motion", () => {
  assert.match(css, /\.toast\s*\{[^}]*animation:\s*toast-enter\s+var\(--motion-duration-base\)/s);
  assert.match(css, /\.toast\.is-leaving\s*\{[^}]*opacity:\s*0;[^}]*transform:\s*translateY\(8px\);[^}]*transition:\s*opacity\s+var\(--motion-duration-fast\)[^;]*,\s*transform\s+var\(--motion-duration-fast\)/s);
  assert.match(css, /@keyframes\s+toast-enter\s*\{[^}]*opacity:\s*0;[^}]*transform:\s*translateY\(10px\);[\s\S]*opacity:\s*1;[^}]*transform:\s*translateY\(0\)/s);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.toast\.is-leaving[^{}]*\{[^}]*opacity:\s*1;[^}]*transform:\s*none;[^}]*transition:\s*none;/s);

  const container = fakeAnimatedContainer();
  const timer = fakeTimer();
  const manager = createToastManager({
    container,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
    duration: 1000,
    prefersReducedMotion: () => true,
  });

  manager.show("Match saved");
  timer.advance(1000);
  assert.equal(manager.isVisible(), false);
  assert.equal(container.innerHTML, "");
});
