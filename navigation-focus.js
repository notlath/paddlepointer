(function (root) {
  "use strict";

  function focusDestinationHeading(container) {
    if (!container) return false;

    const target =
      container.querySelector("#main-content h1") ||
      container.querySelector("#main-content");

    if (!target || typeof target.focus !== "function") return false;

    if (!target.hasAttribute("tabindex")) {
      target.setAttribute("tabindex", "-1");
    }

    target.focus({ preventScroll: true });
    return true;
  }

  function getViewHeadingTitle(container) {
    if (!container) return "";
    const heading = container.querySelector("#main-content h1");
    return heading ? (heading.textContent || "").trim() : "";
  }

  const api = {
    focusDestinationHeading,
    getViewHeadingTitle,
  };

  root.PaddlePointNavigationFocus = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis === "object" ? globalThis : window);
