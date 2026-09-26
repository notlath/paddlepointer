const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createScoreHighlighter } = require("../score-highlight.js");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8").replace(/\r\n/g, "\n");
const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8").replace(/\r\n/g, "\n");
const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

// A rendered page stand-in: score elements carrying data-score-key, as app.js renders them.
function fakePage(scores) {
  const elements = scores.map(([key, value]) => {
    const classes = new Set();
    return {
      textContent: String(value),
      getAttribute: (name) => (name === "data-score-key" ? key : null),
      classList: { add: (name) => classes.add(name), contains: (name) => classes.has(name) },
    };
  });
  return {
    elements,
    querySelectorAll: (selector) => (selector === "[data-score-key]" ? elements : []),
    highlighted: () => elements.filter((el) => el.classList.contains("score-changed")).map((el) => el.getAttribute("data-score-key")),
  };
}

test("the first render of a Scoreboard never highlights", () => {
  const highlighter = createScoreHighlighter();
  const page = fakePage([["scoreboard:g1:A", 0], ["scoreboard:g1:B", 0]]);
  highlighter.apply(page);
  assert.deepEqual(page.highlighted(), []);
});

test("a recorded Rally highlights only the Score that changed", () => {
  const highlighter = createScoreHighlighter();
  highlighter.apply(fakePage([["scoreboard:g1:A", 4], ["scoreboard:g1:B", 2]]));
  const next = fakePage([["scoreboard:g1:A", 5], ["scoreboard:g1:B", 2]]);
  highlighter.apply(next);
  assert.deepEqual(next.highlighted(), ["scoreboard:g1:A"]);
});

test("undoing a Rally highlights the Score that went back", () => {
  const highlighter = createScoreHighlighter();
  highlighter.apply(fakePage([["scoreboard:g1:A", 5], ["scoreboard:g1:B", 2]]));
  const undone = fakePage([["scoreboard:g1:A", 4], ["scoreboard:g1:B", 2]]);
  highlighter.apply(undone);
  assert.deepEqual(undone.highlighted(), ["scoreboard:g1:A"]);
});

test("a side-out, server switch, or unchanged refresh does not highlight", () => {
  const highlighter = createScoreHighlighter();
  highlighter.apply(fakePage([["live:m1:A", 7], ["live:m1:B", 5]]));
  const refresh = fakePage([["live:m1:A", 7], ["live:m1:B", 5]]);
  highlighter.apply(refresh);
  assert.deepEqual(refresh.highlighted(), []);
});

test("leaving a view forgets its Scores, so returning never highlights", () => {
  const highlighter = createScoreHighlighter();
  highlighter.apply(fakePage([["live:m1:A", 7], ["live:m1:B", 5]]));
  highlighter.apply(fakePage([])); // another view rendered in between
  const back = fakePage([["live:m1:A", 9], ["live:m1:B", 5]]);
  highlighter.apply(back);
  assert.deepEqual(back.highlighted(), []);
});

test("a new Match with a new key is not compared with the previous Match", () => {
  const highlighter = createScoreHighlighter();
  highlighter.apply(fakePage([["scoreboard:g1:A", 11], ["scoreboard:g1:B", 9]]));
  const fresh = fakePage([["scoreboard:g2:A", 0], ["scoreboard:g2:B", 0]]);
  highlighter.apply(fresh);
  assert.deepEqual(fresh.highlighted(), []);
});

test("the same court shown twice (grid and full-size overlay) highlights both copies", () => {
  const highlighter = createScoreHighlighter();
  highlighter.apply(fakePage([["live:m1:A", 3], ["live:m1:A", 3]]));
  const changed = fakePage([["live:m1:A", 4], ["live:m1:A", 4]]);
  highlighter.apply(changed);
  assert.deepEqual(changed.highlighted(), ["live:m1:A", "live:m1:A"]);
  const repeat = fakePage([["live:m1:A", 4], ["live:m1:A", 4]]);
  highlighter.apply(repeat);
  assert.deepEqual(repeat.highlighted(), [], "a later render with the same Score does not replay the highlight");
});

test("app.js marks Scoreboard and Live Board Scores and checks them after every render", () => {
  assert.match(appCode, /class="score-number" data-score-key="scoreboard:\$\{escapeAttr\(game\.id\)\}:\$\{key\}"/, "each Scoreboard Team Score has a key per Match and Team");
  const liveCard = appCode.slice(appCode.indexOf("function renderLiveScoreCard("), appCode.indexOf("function renderLiveCardRefreshState("));
  assert.equal((liveCard.match(/data-score-key="live:\$\{escapeAttr\(liveMatch\.id\)\}:[AB]"/g) || []).length, 4, "live and Final court cards key both Team Scores by court card");
  const render = appCode.slice(appCode.indexOf("function render() {"), appCode.indexOf("const renderScheduler ="));
  assert.ok(render.indexOf("scoreHighlighter.apply(app)") > render.indexOf("app.innerHTML ="), "Scores are compared after the page is rebuilt");
  assert.ok(html.indexOf("score-highlight.js") > -1 && html.indexOf("score-highlight.js") < html.indexOf("app.js"), "index.html loads score-highlight.js before app.js");
});

test("the highlight is a short transform and opacity animation that reduced motion turns off", () => {
  const rule = css.match(/\.score-changed\s*\{([^}]*)\}/);
  assert.ok(rule, ".score-changed is styled");
  assert.match(rule[1], /animation:\s*score-change\s+var\(--motion-duration-slow\)\s+var\(--motion-easing\)/, "220ms, within the 300ms limit");
  const frames = css.match(/@keyframes\s+score-change\s*\{([\s\S]*?)\n\}/);
  assert.ok(frames, "score-change keyframes exist");
  const props = [...frames[1].matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
  assert.ok(props.length > 0 && props.every((p) => p === "opacity" || p === "transform"), `only opacity and transform animate (found ${props.join(", ")})`);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.score-changed\s*\{\s*animation:\s*none;/);
});
