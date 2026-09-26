const test = require("node:test");
const assert = require("node:assert/strict");

const {
  LIVE_BOARD_TABS,
  getNextTabValue,
  getTabProps,
  handleTabKeydown,
} = require("../live-board-tabs.js");

function createMockEvent(key) {
  let defaultPrevented = false;
  return {
    key,
    preventDefault() {
      defaultPrevented = true;
    },
    get defaultPrevented() {
      return defaultPrevented;
    },
  };
}

test("LIVE_BOARD_TABS contains ongoing and next in order", () => {
  assert.deepEqual(LIVE_BOARD_TABS, ["ongoing", "next"]);
});

test("getNextTabValue moves forward and wraps around", () => {
  assert.equal(getNextTabValue("ongoing", "next"), "next");
  assert.equal(getNextTabValue("next", "next"), "ongoing");
});

test("getNextTabValue moves backward and wraps around", () => {
  assert.equal(getNextTabValue("next", "prev"), "ongoing");
  assert.equal(getNextTabValue("ongoing", "prev"), "next");
});

test("getNextTabValue jumps to first and last tab", () => {
  assert.equal(getNextTabValue("next", "first"), "ongoing");
  assert.equal(getNextTabValue("ongoing", "first"), "ongoing");
  assert.equal(getNextTabValue("ongoing", "last"), "next");
  assert.equal(getNextTabValue("next", "last"), "next");
});

test("getTabProps computes correct roving tabindex and aria attributes for active tab", () => {
  const ongoingProps = getTabProps("ongoing", "ongoing");
  assert.equal(ongoingProps.id, "live-tab-ongoing");
  assert.equal(ongoingProps.role, "tab");
  assert.equal(ongoingProps.isSelected, true);
  assert.equal(ongoingProps.ariaSelected, "true");
  assert.equal(ongoingProps.tabIndex, 0);
  assert.equal(ongoingProps.ariaControls, "live-board-panel");
});

test("getTabProps computes correct roving tabindex and aria attributes for inactive tab", () => {
  const nextProps = getTabProps("next", "ongoing");
  assert.equal(nextProps.id, "live-tab-next");
  assert.equal(nextProps.role, "tab");
  assert.equal(nextProps.isSelected, false);
  assert.equal(nextProps.ariaSelected, "false");
  assert.equal(nextProps.tabIndex, -1);
  assert.equal(nextProps.ariaControls, "live-board-panel");
});

test("handleTabKeydown navigates next tab on ArrowRight", () => {
  const event = createMockEvent("ArrowRight");
  let selected = null;
  const handled = handleTabKeydown(event, {
    currentTab: "ongoing",
    onSelectTab: (tab) => {
      selected = tab;
    },
  });

  assert.equal(handled, true);
  assert.equal(event.defaultPrevented, true);
  assert.equal(selected, "next");
});

test("handleTabKeydown navigates prev tab on ArrowLeft", () => {
  const event = createMockEvent("ArrowLeft");
  let selected = null;
  const handled = handleTabKeydown(event, {
    currentTab: "ongoing",
    onSelectTab: (tab) => {
      selected = tab;
    },
  });

  assert.equal(handled, true);
  assert.equal(event.defaultPrevented, true);
  assert.equal(selected, "next");
});

test("handleTabKeydown navigates to first tab on Home", () => {
  const event = createMockEvent("Home");
  let selected = null;
  const handled = handleTabKeydown(event, {
    currentTab: "next",
    onSelectTab: (tab) => {
      selected = tab;
    },
  });

  assert.equal(handled, true);
  assert.equal(event.defaultPrevented, true);
  assert.equal(selected, "ongoing");
});

test("handleTabKeydown navigates to last tab on End", () => {
  const event = createMockEvent("End");
  let selected = null;
  const handled = handleTabKeydown(event, {
    currentTab: "ongoing",
    onSelectTab: (tab) => {
      selected = tab;
    },
  });

  assert.equal(handled, true);
  assert.equal(event.defaultPrevented, true);
  assert.equal(selected, "next");
});

test("handleTabKeydown ignores unhandled keys (ArrowUp, ArrowDown, Tab, Enter, Space)", () => {
  for (const key of ["ArrowUp", "ArrowDown", "Tab", "Enter", " "]) {
    const event = createMockEvent(key);
    let selected = null;
    const handled = handleTabKeydown(event, {
      currentTab: "ongoing",
      onSelectTab: (tab) => {
        selected = tab;
      },
    });

    assert.equal(handled, false);
    assert.equal(event.defaultPrevented, false);
    assert.equal(selected, null);
  }
});

test("styles.css defines focus-visible styles for live-board-tab", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");

  assert.match(css, /\.live-board-tab:focus-visible\s*\{/);
  assert.match(css, /\.live-tv-mode \.live-board-tab:focus-visible\s*\{/);
});

test("index.html loads live-board-tabs.js before app.js", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

  const tabsIndex = html.indexOf('src="live-board-tabs.js');
  const appIndex = html.indexOf('src="app.js');

  assert.ok(tabsIndex > -1, "live-board-tabs.js must be loaded in index.html");
  assert.ok(appIndex > -1, "app.js must be loaded in index.html");
  assert.ok(tabsIndex < appIndex, "live-board-tabs.js must load before app.js");
});

test("app.js templates include tablist, tab, and tabpanel with corresponding ARIA relationships", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");

  assert.match(appCode, /class="live-board-tabs"\s+role="tablist"\s+aria-label="Live board tabs"/);
  assert.match(appCode, /role="\$\{props\.role\}"/);
  assert.match(appCode, /aria-controls="\$\{props\.ariaControls\}"/);
  assert.match(appCode, /id="live-board-panel"\s+class="live-tabpanel"\s+role="tabpanel"\s+aria-labelledby="live-tab-\$\{activeTab\}"/);
});
