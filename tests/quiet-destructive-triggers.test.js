const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");

test("destructive action trigger buttons in app.js use quiet-danger style", () => {
  const actions = [
    "reset-recovered-match",
    "reset-active",
    "reset-tournament",
    "clear-history"
  ];

  for (const action of actions) {
    const regex = new RegExp(`class="button ghost quiet-danger"[^>]*data-action="${action}"`);
    assert.match(
      appCode,
      regex,
      `Trigger button for "${action}" must have class "button ghost quiet-danger"`
    );
  }
});

test("destructive confirmation dialog in app.js preserves solid danger button for confirm decision", () => {
  assert.match(
    appCode,
    /class="button danger"[^>]*data-action="confirm-destructive-confirmation"/,
    "Final confirmation action must retain solid danger class"
  );
});

test("styles.css declares .button.quiet-danger and removes history-clear", () => {
  assert.match(
    styles,
    /\.button\.quiet-danger\s*\{[^}]*color:\s*var\(--color-danger-text\)/,
    ".button.quiet-danger rule must declare color: var(--color-danger-text)"
  );
  assert.doesNotMatch(styles, /history-clear/, "styles.css should not contain history-clear");
});
