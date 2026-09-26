const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getFocusableElements,
  handleDialogKeydown,
  applyInert,
  createConfirmationController,
} = require("../dialog-lifecycle.js");

function createMockElement(tag, attrs = {}, children = []) {
  const attributes = { ...attrs };
  const elem = {
    tagName: tag.toUpperCase(),
    attributes,
    children: [...children],
    disabled: Boolean(attrs.disabled),
    inert: false,
    getAttribute(name) {
      return attributes[name] !== undefined ? attributes[name] : null;
    },
    setAttribute(name, val) {
      attributes[name] = String(val);
    },
    removeAttribute(name) {
      delete attributes[name];
    },
    hasAttribute(name) {
      return attributes[name] !== undefined;
    },
    focusCalled: 0,
    focus() {
      elem.focusCalled += 1;
    },
    querySelectorAll(selector) {
      const results = [];
      function walk(node) {
        for (const child of node.children) {
          if (matchesSelector(child, selector)) {
            results.push(child);
          }
          walk(child);
        }
      }
      walk(elem);
      return results;
    },
    querySelector(selector) {
      return elem.querySelectorAll(selector)[0] || null;
    },
    contains(child) {
      if (child === elem) return true;
      function check(node) {
        for (const c of node.children) {
          if (c === child || check(c)) return true;
        }
        return false;
      }
      return check(elem);
    },
  };
  return elem;
}

function matchesSelector(node, selector) {
  const parts = selector.split(",").map((s) => s.trim());
  return parts.some((part) => {
    if (part.startsWith("button") && node.tagName === "BUTTON" && !node.disabled) return true;
    if (part.includes('data-action="')) {
      const match = part.match(/data-action="([^"]+)"/);
      if (match && node.getAttribute("data-action") === match[1]) return true;
    }
    if (part.startsWith("a[href]") && node.tagName === "A" && node.hasAttribute("href")) return true;
    if (part.startsWith("input") && node.tagName === "INPUT" && !node.disabled) return true;
    if (part.includes("tabindex") && node.hasAttribute("tabindex") && node.getAttribute("tabindex") !== "-1") return true;
    return false;
  });
}

function createMockEvent({ key, shiftKey = false }) {
  let defaultPrevented = false;
  return {
    key,
    shiftKey,
    preventDefault() {
      defaultPrevented = true;
    },
    get defaultPrevented() {
      return defaultPrevented;
    },
  };
}

test("getFocusableElements returns only keyboard focusable, non-disabled elements", () => {
  const btn1 = createMockElement("button", { "data-action": "continue" });
  const btnDisabled = createMockElement("button", { disabled: true });
  const link = createMockElement("a", { href: "#" });
  const hiddenInput = createMockElement("input", { tabindex: "-1" });
  const container = createMockElement("div", {}, [btn1, btnDisabled, link, hiddenInput]);

  const focusables = getFocusableElements(container);
  assert.equal(focusables.length, 2);
  assert.equal(focusables[0], btn1);
  assert.equal(focusables[1], link);
});

test("Tab on the last focusable element wraps to the first focusable element", () => {
  const btn1 = createMockElement("button", { "data-action": "continue" });
  const btn2 = createMockElement("button", { "data-action": "reset" });
  const dialog = createMockElement("section", {}, [btn1, btn2]);

  const event = createMockEvent({ key: "Tab", shiftKey: false });
  const trapped = handleDialogKeydown(event, {
    dialog,
    activeElement: btn2,
    allowEscape: false,
  });

  assert.equal(trapped, true);
  assert.equal(event.defaultPrevented, true);
  assert.equal(btn1.focusCalled, 1);
  assert.equal(btn2.focusCalled, 0);
});

test("Shift+Tab on the first focusable element wraps to the last focusable element", () => {
  const btn1 = createMockElement("button", { "data-action": "continue" });
  const btn2 = createMockElement("button", { "data-action": "reset" });
  const dialog = createMockElement("section", {}, [btn1, btn2]);

  const event = createMockEvent({ key: "Tab", shiftKey: true });
  const trapped = handleDialogKeydown(event, {
    dialog,
    activeElement: btn1,
    allowEscape: false,
  });

  assert.equal(trapped, true);
  assert.equal(event.defaultPrevented, true);
  assert.equal(btn2.focusCalled, 1);
  assert.equal(btn1.focusCalled, 0);
});

test("Tab stays inside dialog when active element is outside dialog", () => {
  const btn1 = createMockElement("button", { "data-action": "continue" });
  const btn2 = createMockElement("button", { "data-action": "reset" });
  const dialog = createMockElement("section", {}, [btn1, btn2]);
  const outsideBtn = createMockElement("button", { "data-action": "outside" });

  const event = createMockEvent({ key: "Tab", shiftKey: false });
  const trapped = handleDialogKeydown(event, {
    dialog,
    activeElement: outsideBtn,
    allowEscape: false,
  });

  assert.equal(trapped, true);
  assert.equal(event.defaultPrevented, true);
  assert.equal(btn1.focusCalled, 1);
});

test("Escape closes dialog when allowEscape is true and calls onEscape", () => {
  const closeBtn = createMockElement("button", { "data-action": "close" });
  const dialog = createMockElement("section", {}, [closeBtn]);

  let escaped = false;
  const event = createMockEvent({ key: "Escape" });
  const handled = handleDialogKeydown(event, {
    dialog,
    activeElement: closeBtn,
    allowEscape: true,
    onEscape: () => {
      escaped = true;
    },
  });

  assert.equal(handled, true);
  assert.equal(event.defaultPrevented, true);
  assert.equal(escaped, true);
});

test("Escape does NOT close dialog when allowEscape is false (e.g. Match Recovery)", () => {
  const btn1 = createMockElement("button", { "data-action": "continue" });
  const dialog = createMockElement("section", {}, [btn1]);

  let escaped = false;
  const event = createMockEvent({ key: "Escape" });
  const handled = handleDialogKeydown(event, {
    dialog,
    activeElement: btn1,
    allowEscape: false,
    onEscape: () => {
      escaped = true;
    },
  });

  assert.equal(handled, false);
  assert.equal(event.defaultPrevented, false);
  assert.equal(escaped, false);
});

test("applyInert sets inert and aria-hidden when true, and removes when false", () => {
  const header = createMockElement("header");
  const main = createMockElement("main");

  applyInert([header, main], true);
  assert.equal(header.inert, true);
  assert.equal(header.getAttribute("aria-hidden"), "true");
  assert.equal(main.inert, true);
  assert.equal(main.getAttribute("aria-hidden"), "true");

  applyInert([header, main], false);
  assert.equal(header.inert, false);
  assert.equal(header.hasAttribute("aria-hidden"), false);
  assert.equal(main.inert, false);
  assert.equal(main.hasAttribute("aria-hidden"), false);
});

test("destructive confirmation cancel closes without running the operation and restores focus", () => {
  let runs = 0;
  const changes = [];
  const settled = [];
  const controller = createConfirmationController({
    onChange: (confirmation) => changes.push(confirmation),
    onSettled: (target) => settled.push(target),
  });
  const details = {
    title: "Reset Team A vs Team B?",
    description: "The score will return to 0-0.",
    confirmLabel: "Reset Match",
    cancelLabel: "Keep Match",
  };

  assert.equal(controller.open(details, () => { runs += 1; }, { action: "reset-active" }), true);
  assert.deepEqual(controller.current(), details);
  assert.equal(controller.cancel(), true);
  assert.equal(controller.current(), null);
  assert.equal(runs, 0);
  assert.deepEqual(changes, [details, null]);
  assert.deepEqual(settled, [{ action: "reset-active" }]);
});

test("destructive confirmation runs the pending operation once", async () => {
  let runs = 0;
  const settled = [];
  const controller = createConfirmationController({ onSettled: (target) => settled.push(target) });

  controller.open(
    { title: "Clear results?", description: "Scores will be removed.", confirmLabel: "Clear Results", cancelLabel: "Keep Results" },
    async () => { runs += 1; },
    { action: "clear-tournament-results" }
  );

  assert.equal(await controller.confirm(), true);
  assert.equal(await controller.confirm(), false);
  assert.equal(runs, 1);
  assert.deepEqual(settled, [{ action: "clear-tournament-results" }]);
});

test("destructive confirmation passes the selected value to the operation", async () => {
  let selected = null;
  const controller = createConfirmationController();
  controller.open(
    { title: "Which Team retired?", choices: [{ value: "A", label: "Team A" }], cancelLabel: "Continue Match" },
    (value) => { selected = value; }
  );

  await controller.confirm("A");

  assert.equal(selected, "A");
});

test("styles.css defines accessible .sr-only utility class", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");

  assert.match(css, /\.sr-only\s*\{[^}]*position:\s*absolute/);
  assert.match(css, /\.sr-only\s*\{[^}]*width:\s*1px/);
  assert.match(css, /\.sr-only\s*\{[^}]*height:\s*1px/);
  assert.match(css, /\.sr-only\s*\{[^}]*clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
});

test("index.html includes dialog-lifecycle.js before app.js", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

  const dialogScriptIndex = html.indexOf('src="dialog-lifecycle.js');
  const appScriptIndex = html.indexOf('src="app.js');

  assert.ok(dialogScriptIndex > -1, "dialog-lifecycle.js must be referenced in index.html");
  assert.ok(appScriptIndex > -1, "app.js must be referenced in index.html");
  assert.ok(dialogScriptIndex < appScriptIndex, "dialog-lifecycle.js must be loaded before app.js");
});

test("Match Recovery dialog template announces role alertdialog, describedby, and destructive consequence", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");

  assert.match(appCode, /role="alertdialog"/);
  assert.match(appCode, /aria-labelledby="match-recovery-title"/);
  assert.match(appCode, /aria-describedby="match-recovery-desc"/);
  assert.match(appCode, /id="match-recovery-desc"/);
  assert.match(appCode, /Resetting will clear the current match score/);
});

test("Live Score overlay dialog template announces role dialog and has accessible sr-only heading", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");

  assert.match(appCode, /class="live-score-overlay"\s+role="dialog"\s+aria-modal="true"\s+aria-labelledby="live-score-dialog-title"/);
  assert.match(appCode, /id="live-score-dialog-title"\s+class="sr-only">Full size live match score<\/h2>/);
});
