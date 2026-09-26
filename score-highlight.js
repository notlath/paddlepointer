(function (root) {
  "use strict";

  // Score highlight module: after each render, marks the score elements whose value changed since the
  // previous render. Keys missing from a render are forgotten, so a first render or a return to a view
  // never highlights, and an unchanged refresh leaves every Score still.
  function createScoreHighlighter() {
    let previous = new Map();

    function apply(page) {
      const current = new Map();
      for (const element of page.querySelectorAll("[data-score-key]")) {
        const key = element.getAttribute("data-score-key");
        const value = String(element.textContent).trim();
        if (previous.has(key) && previous.get(key) !== value) {
          element.classList.add("score-changed");
        }
        current.set(key, value);
      }
      previous = current;
    }

    return { apply };
  }

  const scoreHighlight = { createScoreHighlighter };
  root.PaddlePointScoreHighlight = scoreHighlight;
  if (typeof module === "object" && module.exports) module.exports = scoreHighlight;
})(typeof globalThis === "object" ? globalThis : window);
