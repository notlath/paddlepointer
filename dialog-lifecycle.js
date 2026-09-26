(function (root) {
  "use strict";

  const FOCUSABLE_SELECTOR = [
    "button:not([disabled])",
    "a[href]",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"]):not([disabled])',
  ].join(", ");

  function getFocusableElements(container) {
    if (!container || typeof container.querySelectorAll !== "function") return [];
    const elements = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));
    return elements.filter((element) => {
      if (element.disabled) return false;
      const tabIndex = element.getAttribute ? element.getAttribute("tabindex") : null;
      if (tabIndex === "-1") return false;
      return true;
    });
  }

  function handleDialogKeydown(event, options = {}) {
    const dialog = options.dialog;
    if (!dialog) return false;

    const key = event.key;
    if (key === "Tab") {
      const focusables = getFocusableElements(dialog);
      if (focusables.length === 0) {
        event.preventDefault();
        return true;
      }

      const active =
        options.activeElement !== undefined
          ? options.activeElement
          : typeof document !== "undefined"
          ? document.activeElement
          : null;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey) {
        // Shift + Tab: if on first element or outside, wrap to last
        if (active === first || !dialog.contains(active)) {
          event.preventDefault();
          if (typeof last.focus === "function") last.focus();
          return true;
        }
      } else {
        // Tab: if on last element or outside, wrap to first
        if (active === last || !dialog.contains(active)) {
          event.preventDefault();
          if (typeof first.focus === "function") first.focus();
          return true;
        }
      }
      return true;
    }

    if (key === "Escape") {
      if (options.allowEscape) {
        event.preventDefault();
        if (typeof options.onEscape === "function") {
          options.onEscape();
        }
        return true;
      }
      return false;
    }

    return false;
  }

  function applyInert(elements, isInert) {
    const list = Array.isArray(elements) ? elements : [elements].filter(Boolean);
    list.forEach((element) => {
      if (!element) return;
      if (isInert) {
        element.inert = true;
        if (typeof element.setAttribute === "function") {
          element.setAttribute("aria-hidden", "true");
        }
      } else {
        element.inert = false;
        if (typeof element.removeAttribute === "function") {
          element.removeAttribute("aria-hidden");
        }
      }
    });
  }

  function createConfirmationController(options = {}) {
    let pending = null;
    const onChange = typeof options.onChange === "function" ? options.onChange : () => {};
    const onSettled = typeof options.onSettled === "function" ? options.onSettled : () => {};

    function open(details, onConfirm, returnFocus) {
      if (!details || typeof onConfirm !== "function") return false;
      pending = { details, onConfirm, returnFocus };
      onChange(details);
      return true;
    }

    function current() {
      return pending ? pending.details : null;
    }

    function cancel() {
      if (!pending) return false;
      const returnFocus = pending.returnFocus;
      pending = null;
      onChange(null);
      onSettled(returnFocus);
      return true;
    }

    async function confirm(value) {
      if (!pending) return false;
      const { onConfirm, returnFocus } = pending;
      pending = null;
      onChange(null);
      try {
        await onConfirm(value);
      } finally {
        onSettled(returnFocus);
      }
      return true;
    }

    return { open, current, cancel, confirm };
  }

  const api = {
    getFocusableElements,
    handleDialogKeydown,
    applyInert,
    createConfirmationController,
  };

  root.PaddlePointDialogLifecycle = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis === "object" ? globalThis : window);
