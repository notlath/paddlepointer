(function (root) {
  "use strict";

  const LIVE_BOARD_TABS = Object.freeze(["ongoing", "next"]);

  function getNextTabValue(currentValue, direction) {
    const currentIndex = LIVE_BOARD_TABS.indexOf(currentValue);
    const index = currentIndex >= 0 ? currentIndex : 0;

    if (direction === "next") {
      return LIVE_BOARD_TABS[(index + 1) % LIVE_BOARD_TABS.length];
    }
    if (direction === "prev") {
      return LIVE_BOARD_TABS[(index - 1 + LIVE_BOARD_TABS.length) % LIVE_BOARD_TABS.length];
    }
    if (direction === "first") {
      return LIVE_BOARD_TABS[0];
    }
    if (direction === "last") {
      return LIVE_BOARD_TABS[LIVE_BOARD_TABS.length - 1];
    }

    return LIVE_BOARD_TABS[index];
  }

  function getTabProps(tabValue, activeTab) {
    const isSelected = tabValue === activeTab;
    return {
      id: `live-tab-${tabValue}`,
      role: "tab",
      isSelected,
      ariaSelected: isSelected ? "true" : "false",
      tabIndex: isSelected ? 0 : -1,
      ariaControls: "live-board-panel",
    };
  }

  function handleTabKeydown(event, options = {}) {
    if (!event) return false;

    const currentTab = options.currentTab;
    const key = event.key;

    let nextTab = null;
    if (key === "ArrowRight") {
      nextTab = getNextTabValue(currentTab, "next");
    } else if (key === "ArrowLeft") {
      nextTab = getNextTabValue(currentTab, "prev");
    } else if (key === "Home") {
      nextTab = getNextTabValue(currentTab, "first");
    } else if (key === "End") {
      nextTab = getNextTabValue(currentTab, "last");
    }

    if (nextTab !== null) {
      if (typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      if (typeof options.onSelectTab === "function") {
        options.onSelectTab(nextTab);
      }
      return true;
    }

    return false;
  }

  const api = {
    LIVE_BOARD_TABS,
    getNextTabValue,
    getTabProps,
    handleTabKeydown,
  };

  root.PaddlePointLiveBoardTabs = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis === "object" ? globalThis : window);
