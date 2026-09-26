(function (root) {
  "use strict";

  // Render scheduler module: ensures the app rebuilds the page at most once per frame.
  // Multiple state updates within the same frame are coalesced into a single render pass.
  function createRenderScheduler(options = {}) {
    const defaultRequestFrame =
      typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => setTimeout(callback, 0);

    const defaultCancelFrame =
      typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function"
        ? window.cancelAnimationFrame.bind(window)
        : (id) => clearTimeout(id);

    const renderFn = options.render;
    const requestFrameFn = options.requestFrame || defaultRequestFrame;
    const cancelFrameFn = options.cancelFrame || defaultCancelFrame;

    let scheduled = false;
    let frameId = null;

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      frameId = requestFrameFn(executeRender);
    }

    function executeRender() {
      scheduled = false;
      frameId = null;
      if (typeof renderFn === "function") {
        renderFn();
      }
    }

    function update(mutator) {
      if (typeof mutator === "function") {
        mutator();
      }
      schedule();
    }

    function flush() {
      if (!scheduled) return;
      if (frameId !== null && typeof cancelFrameFn === "function") {
        cancelFrameFn(frameId);
      }
      executeRender();
    }

    function cancel() {
      if (frameId !== null && typeof cancelFrameFn === "function") {
        cancelFrameFn(frameId);
      }
      scheduled = false;
      frameId = null;
    }

    function isScheduled() {
      return scheduled;
    }

    return { schedule, update, flush, cancel, isScheduled };
  }

  const renderScheduler = { createRenderScheduler };
  root.PaddlePointRenderScheduler = renderScheduler;
  if (typeof module === "object" && module.exports) module.exports = renderScheduler;
})(typeof globalThis === "object" ? globalThis : window);
