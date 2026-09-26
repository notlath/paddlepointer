const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8").replace(/\r\n/g, "\n");
const raw = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8").replace(/\r\n/g, "\n");
const css = raw.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));

const TV_QUERY = "@media (min-width: 1400px) and (min-height: 900px)";

// Every style rule with its selector list, declarations, and the @media heads that wrap it.
function styleRules(source) {
  const rules = [];
  const stack = [];
  let start = 0;
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === "{") {
      const head = source.slice(start, i).trim().replace(/\s+/g, " ");
      if (!head.startsWith("@")) {
        const body = source.slice(i + 1, source.indexOf("}", i));
        const declarations = Object.fromEntries([...body.matchAll(/([a-z-]+)\s*:\s*([^;]+);/g)].map(([, prop, value]) => [prop, value.trim()]));
        rules.push({ selectors: head.split(",").map((s) => s.trim()), declarations, media: stack.filter((s) => s.startsWith("@media")) });
      }
      stack.push(head);
      start = i + 1;
    } else if (source[i] === "}") {
      stack.pop();
      start = i + 1;
    }
  }
  return rules;
}

const rules = styleRules(css);
// media: undefined = any context, null = top level only, string = inside that @media.
const find = (selector, media) => rules.filter((r) => r.selectors.includes(selector) && (media === undefined ? true : media === null ? r.media.length === 0 : r.media.includes(media)));
const fn = (name) => {
  const source = appCode.match(new RegExp(`\\n  function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}\\n`));
  assert.ok(source, `app.js must define ${name}`);
  return source[0];
};

test("the Live Board locks to the screen only when a TV-sized viewport has room for every court", () => {
  for (const selector of ["body.live-tv-mode", ".live-tv-mode .app-shell", ".live-tv-mode .page"]) {
    const locking = find(selector).filter((r) => r.declarations.overflow === "hidden");
    assert.ok(locking.length > 0, `${selector} still locks on TV-sized screens`);
    for (const rule of locking) assert.deepEqual(rule.media, [TV_QUERY], `${selector} hides overflow only inside ${TV_QUERY}`);
  }
  assert.equal(find("body.live-tv-mode", TV_QUERY)[0].declarations.height, "100dvh");
});

test("on a locked TV screen the court grid takes the remaining height instead of growing past the page", () => {
  const panel = find(".live-tv-mode .live-score-panel", TV_QUERY)[0];
  assert.equal(panel.declarations["grid-template-rows"], "auto minmax(0, 1fr)", "two panel rows: the head, then the stretching court area");
  const tabpanel = find(".live-tv-mode .live-tabpanel", TV_QUERY)[0];
  assert.ok(tabpanel, "the tab panel is sized on TV screens");
  assert.equal(tabpanel.declarations["min-height"], "0");
  assert.equal(tabpanel.declarations["grid-template-rows"], "minmax(0, 1fr)");
});

test("TV-scale text never drops below 12px", () => {
  const offenders = [];
  for (const rule of rules) {
    if (!rule.selectors.some((s) => s.startsWith(".live-tv-mode"))) continue;
    const size = rule.declarations["font-size"];
    const min = size && size.match(/^clamp\(\s*([\d.]+)rem/);
    if (min && parseFloat(min[1]) < 0.75) offenders.push(`${rule.selectors.join(", ")} { font-size: ${size} }`);
  }
  assert.deepEqual(offenders, []);
});

test("below TV width the side panel stacks under the courts with its two lists side by side", () => {
  const query = "@media (max-width: 1399px)";
  assert.equal(find(".live-view-grid", query)[0]?.declarations["grid-template-columns"], "minmax(0, 1fr)");
  assert.equal(find(".live-side-panel", query)[0]?.declarations["grid-template-columns"], "repeat(2, minmax(0, 1fr))");
});

test("court cards wrap long heads and meta instead of cutting them off", () => {
  for (const selector of [".live-score-card-head", ".live-score-meta"]) {
    assert.equal(find(selector, null).find((r) => r.declarations["flex-wrap"])?.declarations["flex-wrap"], "wrap", `${selector} wraps`);
  }
});

test("on phones a Top Player row keeps rank, name, and record on one line", () => {
  const collapsing = rules.filter((r) => r.selectors.includes(".top-player-row") && r.declarations["grid-template-columns"] && r.declarations["grid-template-columns"] !== "46px minmax(0, 1fr) auto" && !r.media.includes(TV_QUERY));
  assert.deepEqual(collapsing.map((r) => `${r.media.join(" ")} ${r.selectors.join(", ")}`), [], "no phone or tablet breakpoint stacks the rank, name, and record");
});

test("Live title actions stay on one line", () => {
  assert.equal(find(".live-tv-title .row-actions", null)[0]?.declarations["flex-wrap"], "nowrap");
  assert.equal(find(".live-tv-title .button", null)[0]?.declarations["white-space"], "nowrap", "button labels such as Refresh Live never wrap");
});

test("a Final court card names the winner in text once and marks the winning Team and Score", () => {
  const card = fn("renderLiveScoreCard");
  const completed = card.slice(card.indexOf('if (liveMatch.statusType === "completed")'), card.indexOf("const tag = expanded"));
  assert.doesNotMatch(completed, /live-final-winner/, "no separate winner block repeats the winning Team");
  assert.equal((completed.match(/winnerClass\("[AB]"\)/g) || []).length, 4, "each Team's name and Score can carry the winner mark");
  assert.match(completed, /escapeHtml\(liveMatch\.scoreCallText\)/, "the meta line keeps the text that says who won");
  const winnerColor = find(".live-score-card.final .live-score-number strong.is-winner", null)[0]?.declarations.color;
  assert.equal(winnerColor, "var(--color-primary)", "winner mark must use primary semantic token");
  assert.equal(rules.some((r) => r.selectors.some((s) => s.includes("live-final-winner"))), false, "winner block styles are gone");
});

test("the Live Board states each label once", () => {
  const view = fn("renderLiveView");
  assert.doesNotMatch(view, /<span>Live Board<\/span>/, "the section head does not repeat the page heading");
  assert.doesNotMatch(view, /subheadLabel/, "the selected tab already names the Ongoing or Next view");
  const head = view.slice(view.indexOf('class="live-section-head"'), view.indexOf('id="live-board-panel"'));
  assert.match(head, /renderLiveBoardTabs\(activeTab\)/);
  assert.match(head, /class="live-court-subhead">\$\{escapeHtml\(subheadValue\)\}/, "the court counts sit beside the tabs");
  assert.doesNotMatch(fn("renderLiveNextMatch"), /winner-badge/, "rows in Next Matches do not each repeat a Next badge");
});
