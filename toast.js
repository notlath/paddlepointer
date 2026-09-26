(function (root) {
  "use strict";

  const DEFAULT_DURATION_MS = 2600;
  const EXIT_DURATION_MS = 160;

  function createToastManager(options = {}) {
    const defaultSetTimeout = typeof window !== "undefined" ? window.setTimeout.bind(window) : globalThis.setTimeout;
    const defaultClearTimeout = typeof window !== "undefined" ? window.clearTimeout.bind(window) : globalThis.clearTimeout;

    const containerOption = options.container;
    const setTimeoutFn = options.setTimeout || defaultSetTimeout;
    const clearTimeoutFn = options.clearTimeout || defaultClearTimeout;
    const duration = typeof options.duration === "number" ? options.duration : DEFAULT_DURATION_MS;
    const prefersReducedMotion = options.prefersReducedMotion || (() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

    let timer = null;
    let removalTimer = null;
    let currentMessage = "";

    function resolveTarget() {
      if (typeof containerOption === "function") {
        return containerOption();
      }
      if (containerOption) {
        return containerOption;
      }
      if (typeof document !== "undefined") {
        return document.getElementById("toast-region") || document.body;
      }
      return null;
    }

    function show(message) {
      clearTimer();
      const text = String(message ?? "").trim();
      if (!text) {
        hide();
        return;
      }

      const target = resolveTarget();
      if (!target) return;

      const wasLeaving = Boolean(target.querySelector?.(".toast")?.classList?.contains("is-leaving"));
      clearRemovalTimer();
      currentMessage = String(message ?? "");
      target.innerHTML = `<div class="toast${wasLeaving ? " is-replacing" : ""}" role="status">${escapeHtml(text)}</div>`;
      timer = setTimeoutFn(hide, typeof target.querySelector === "function" ? Math.max(0, duration - getExitDuration()) : duration);
    }

    function hide() {
      clearTimer();
      const target = resolveTarget();
      const toast = target?.querySelector?.(".toast");
      if (!toast?.classList) {
        removeToast(target);
        return;
      }
      toast.classList.add("is-leaving");
      const exitDuration = getExitDuration();
      if (exitDuration === 0) {
        removeToast(target);
        return;
      }
      removalTimer = setTimeoutFn(() => removeToast(target), exitDuration);
    }

    function removeToast(target) {
      clearRemovalTimer();
      currentMessage = "";
      if (target) target.innerHTML = "";
    }

    function clearTimer() {
      if (timer !== null) {
        clearTimeoutFn(timer);
        timer = null;
      }
    }

    function clearRemovalTimer() {
      if (removalTimer !== null) {
        clearTimeoutFn(removalTimer);
        removalTimer = null;
      }
    }

    function getExitDuration() {
      return prefersReducedMotion() ? 0 : Math.max(0, Math.min(EXIT_DURATION_MS, duration));
    }

    function isVisible() {
      return timer !== null || removalTimer !== null;
    }

    function getMessage() {
      return currentMessage;
    }

    return { show, hide, isVisible, getMessage };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  const toast = { createToastManager, escapeHtml };
  root.PaddlePointToast = toast;
  if (typeof module === "object" && module.exports) module.exports = toast;
})(typeof globalThis === "object" ? globalThis : window);
