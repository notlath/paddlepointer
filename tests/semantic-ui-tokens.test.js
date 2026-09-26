const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
const rootBlock = css.match(/:root\s*\{([\s\S]*?)\n\}/)[1];
const tokens = Object.fromEntries(
  [...rootBlock.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()])
);

test("brand tokens keep their current values", () => {
  assert.deepEqual(
    {
      navy: tokens["--navy"],
      navy2: tokens["--navy-2"],
      court: tokens["--court"],
      courtDark: tokens["--court-dark"],
      accent: tokens["--accent"],
      accent2: tokens["--accent-2"],
      ink: tokens["--ink"],
      muted: tokens["--muted"],
      line: tokens["--line"],
      surface: tokens["--surface"],
      soft: tokens["--soft"],
      danger: tokens["--danger"],
      shadow: tokens["--shadow"],
    },
    {
      navy: "#0a1f54",
      navy2: "#102b66",
      court: "#3f9b46",
      courtDark: "#276b37",
      accent: "#b6ff3b",
      accent2: "#ff7a59",
      ink: "#111827",
      muted: "#667085",
      line: "#d9e2ec",
      surface: "#ffffff",
      soft: "#f5f7fa",
      danger: "#c83232",
      shadow: "0 18px 45px rgba(10, 31, 84, 0.13)",
    }
  );
});

test("semantic surface tokens cover every shared surface", () => {
  for (const name of ["page", "panel", "elevated", "nav", "input", "overlay", "court"]) {
    assert.ok(tokens[`--surface-${name}`], `missing --surface-${name}`);
  }
});

test("semantic state tokens cover every interaction state with a foreground pairing", () => {
  for (const name of ["primary", "warning", "destructive", "success", "selected", "disabled"]) {
    assert.ok(tokens[`--color-${name}`], `missing --color-${name}`);
    assert.ok(tokens[`--color-on-${name}`], `missing --color-on-${name}`);
  }
  for (const name of ["hover", "pressed", "focus-visible"]) {
    assert.ok(tokens[`--state-${name}`], `missing --state-${name}`);
  }
});

test("semantic brand-backed tokens reference brand colors instead of new hex values", () => {
  assert.equal(tokens["--color-primary"], "var(--accent)");
  assert.equal(tokens["--color-on-primary"], "var(--navy)");
  assert.equal(tokens["--color-warning"], "var(--accent-2)");
  assert.equal(tokens["--color-destructive"], "var(--danger)");
  assert.equal(tokens["--surface-court"], "var(--court)");
  assert.equal(tokens["--surface-page"], "var(--soft)");
});

test("named scales exist for type, space, radius, elevation, control, icon, motion, and layer", () => {
  const scales = {
    "--font-size-": ["xs", "sm", "md", "lg"],
    "--space-": ["1", "2", "3", "4", "5"],
    "--radius-": ["sm", "md", "lg", "pill"],
    "--elevation-": ["1", "2", "3"],
    "--control-height-": ["sm", "md", "lg"],
    "--icon-size-": ["sm", "md", "lg"],
    "--motion-duration-": ["fast", "base", "slow"],
    "--layer-": ["raised", "sticky", "nav", "overlay", "skip-link"],
  };
  for (const [prefix, steps] of Object.entries(scales)) {
    for (const step of steps) {
      assert.ok(tokens[`${prefix}${step}`], `missing ${prefix}${step}`);
    }
  }
});
