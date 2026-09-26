const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The charts draw with the vendored D3 that index.html loads as a global.
globalThis.d3 = require("../vendor/d3-7.9.0.min.js");
const load = () => import("../qlik-mashup.js");
const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const qlikCss = fs.readFileSync(path.join(__dirname, "../qlik-mashup.css"), "utf8");

const cube = (dims, measures, matrix) => ({
  qDimensionInfo: dims.map((t) => ({ qFallbackTitle: t })),
  qMeasureInfo: measures.map((t) => ({ qFallbackTitle: t })),
  qDataPages: [{ qMatrix: matrix.map((r) => r.map(([qText, qNum]) => ({ qText, qNum }))) }],
});

test("every Analytics tab in app.js has a mashup subject, and the dashboard too", async () => {
  const { SUBJECTS } = await load();
  const block = appCode.slice(appCode.indexOf("const QLIK_SHEETS = ["), appCode.indexOf("\n  ];", appCode.indexOf("const QLIK_SHEETS = [")));
  const ids = [...block.matchAll(/^\s*id: "([^"]+)"/gm)].map((m) => m[1]);
  assert.equal(ids.length, 6);
  for (const id of [...ids, "dashboard"]) assert.ok(SUBJECTS[id], `no mashup subject for ${id}`);
  assert.doesNotMatch(appCode, /<qlik-embed\b/, "no Qlik-rendered UI remains (ADR 0004)");
});

test("hypercube props keep the chart's column order and sort measures high to low", async () => {
  const { hypercubeProps } = await load();
  const def = hypercubeProps({ dims: [{ qLibraryId: "d" }], measures: [{ qLibraryId: "m1" }, { qLibraryId: "m2" }], sort: [2, 0, 1], limit: 10 }).qHyperCubeDef;
  assert.deepEqual(def.qInterColumnSortOrder, [2, 0, 1]);
  assert.deepEqual(def.qMeasures[0], { qLibraryId: "m1", qSortBy: { qSortByNumeric: -1 } });
  assert.deepEqual(def.qInitialDataFetch[0], { qTop: 0, qLeft: 0, qWidth: 3, qHeight: 10 });
  assert.deepEqual(hypercubeProps({ measures: [{}, {}] }).qHyperCubeDef.qInterColumnSortOrder, [0, 1]);
});

test("a hypercube page maps to labelled rows, with NaN cells as null", async () => {
  const { toTable, isEmpty } = await load();
  const t = toTable(cube(["Player"], ["Wins", "Win %"], [[["Ana", 1], ["4", 4], ["80.0%", 0.8]], [["Ben", 2], ["-", "NaN"], ["-", "NaN"]]]));
  assert.deepEqual(t.columns, ["Player", "Wins", "Win %"]);
  assert.equal(t.rows[0].label, "Ana");
  assert.deepEqual(t.rows[0].cells[2], { text: "80.0%", num: 0.8 });
  assert.equal(t.rows[1].cells[1].num, null);
  assert.equal(isEmpty(t, { type: "table" }), false);
  // Qlik answers an empty cube with a single all-null row.
  const empty = toTable(cube(["Partnership"], ["Matches"], [[["-", "NaN"], ["-", "NaN"]]]));
  assert.equal(isEmpty(empty, { type: "scatter" }), true);
});

test("renderers escape Qlik text and scale bars to the largest value", async () => {
  const { toTable, RENDERERS } = await load();
  const t = toTable(cube(["Court"], ["Matches"], [[["<b>1</b>", 1], ["4", 4]], [["2", 2], ["2", 2]]]));
  const svg = RENDERERS.bar(t, { title: "Matches per Court" });
  assert.doesNotMatch(svg, /<b>/);
  assert.match(svg, /&lt;b&gt;1&lt;\/b&gt;/);
  const heights = [...svg.matchAll(/height="([\d.]+)" rx/g)].map((m) => Number(m[1]));
  assert.equal(heights[0], heights[1] * 2);
});

const charts = (subject) => subject.charts.flatMap((c) => (c.type === "tabs" ? c.tabs : [c]));

test("every KPI band holds at most four values and leads with one hero", async () => {
  const { SUBJECTS } = await load();
  for (const [id, subject] of Object.entries(SUBJECTS)) {
    const bands = subject.charts.filter((c) => c.type === "kpi");
    assert.ok(bands.length <= 1, `${id} has one KPI band at most`);
    for (const band of bands) {
      assert.ok(band.measures.length <= 4, `${id} KPI band has at most four values`);
      assert.equal(band.hero, true, `${id} KPI band has a hero`);
    }
  }
  assert.equal(SUBJECTS["court-analytics"].charts.filter((c) => c.type === "kpi").length, 1, "Event / Court Analytics has a KPI band");
});

test("each subject carries the content its ticket asks for", async () => {
  const { SUBJECTS } = await load();
  assert.ok(charts(SUBJECTS.overview).some((c) => /distribution/i.test(c.title || "")), "Overview has a win-rate distribution");
  const match = charts(SUBJECTS["match-analysis"]);
  assert.ok(match.some((c) => c.type === "table" && /Match Details/.test(c.title)), "Match Analysis has a Match details table");
  assert.ok(match.some((c) => c.type === "note"), "Match Analysis shows missing duration as context");
  const tabs = SUBJECTS["player-performance"].charts.find((c) => c.type === "tabs");
  assert.deepEqual(tabs.tabs.map((t) => t.title), ["Partner Performance", "Opponent Results"]);
});

test("a table page window is bounded and clamped", async () => {
  const { pageWindow } = await load();
  assert.deepEqual(pageWindow(60, 1, 25), { page: 1, top: 25, height: 25, from: 26, to: 50, pages: 3 });
  assert.deepEqual(pageWindow(60, 9, 25), { page: 2, top: 50, height: 10, from: 51, to: 60, pages: 3 });
  assert.deepEqual(pageWindow(0, 0, 25), { page: 0, top: 0, height: 0, from: 0, to: 0, pages: 1 });
});

test("tables are captioned and paged only when there is more than one page", async () => {
  const { toTable, RENDERERS } = await load();
  const t = toTable(cube(["Player"], ["Wins"], [[["Ana", 1], ["4", 4]]]));
  const one = RENDERERS.table(t, { title: "Standings" }, { page: 0, total: 1 });
  assert.match(one, /<caption class="sr-only">Standings<\/caption>/);
  assert.doesNotMatch(one, /qm-pager/);
  const many = RENDERERS.table(t, { title: "Standings" }, { page: 1, total: 60 });
  assert.match(many, /Rows 26-50 of 60/);
  assert.match(many, /data-qm="page" data-page="0"/);
  assert.match(many, /data-page="2"/);
  const last = RENDERERS.table(t, { title: "Standings" }, { page: 2, total: 60 });
  assert.match(last, /data-page="3"[^>]*disabled/);
});

test("every drawn chart carries its data as a table too", async () => {
  const { toTable, RENDERERS } = await load();
  const t = toTable(cube(["Court"], ["Matches", "Win %"], [[["1", 1], ["4", 4], ["50%", 0.5]]]));
  for (const type of ["bar", "line", "scatter"]) {
    const out = RENDERERS[type](t, { title: "Chart" });
    assert.match(out, /<details class="qm-data"><summary>Show data table<\/summary>/, `${type} has a data table`);
    assert.match(out, /<th scope="row">1<\/th>/, `${type} data table lists the rows`);
  }
});

test("the KPI hero, the context note and the tab region render", async () => {
  const { toTable, RENDERERS, tabsMarkup } = await load();
  const t = toTable(cube([], ["Win %", "Matches"], [[["62%", 0.62], ["21", 21]]]));
  assert.match(RENDERERS.kpi(t, { hero: true }), /qm-kpi qm-kpi--hero"><span class="qm-kpi-label">Win %/);
  const note = toTable(cube([], ["Missing"], [[["3", 3]]]));
  assert.equal(RENDERERS.note(note, { text: "{0} Matches have no duration." }), '<p class="qm-note">3 Matches have no duration.</p>');
  const tabs = tabsMarkup({ tabs: [{ title: "Partners" }, { title: "Opponents" }] }, "t1");
  assert.match(tabs, /role="tablist"/);
  assert.match(tabs, /role="tab" id="t1-tab-0" aria-controls="t1-panel-0" aria-selected="true"/);
  assert.match(tabs, /id="t1-panel-1" role="tabpanel" aria-labelledby="t1-tab-1" hidden/);
});

test("the analytics shell keeps one title and product vocabulary", async () => {
  const { SUBJECTS } = await load();
  assert.equal(SUBJECTS.dashboard.charts[0].bare, true, "Dashboard chart title is owned by its PaddlePoint card");
  assert.match(appCode, /<nav class="analytics-subnav" aria-label="Analytics subjects">/);
  assert.match(appCode, /aria-current="page"/);
  assert.doesNotMatch(appCode, /aria-label="Analytics sheets"/);
  assert.doesNotMatch(appCode, /Staff access, Qlik Cloud/);
});

test("analytics styling uses shared geometry tokens", () => {
  assert.doesNotMatch(qlikCss, /border-radius:\s*(?:999px|12px|10px|6px)/, "analytics CSS does not fork the radius scale");
  assert.match(qlikCss, /\.analytics-sheet-panel\s*\{[^}]*background:\s*transparent/s);
  assert.match(qlikCss, /\.qm-kpi--hero\s*\{[^}]*var\(--surface-nav\)/s);
});

test("a column Qlik cannot resolve fails the chart instead of showing no data", async () => {
  const { toTable } = await load();
  const broken = cube(["Player"], ["Wins"], []);
  broken.qMeasureInfo[0].qError = { qErrorCode: 7001 };
  assert.throws(() => toTable(broken), /Wins.*7001/);
});

test("a suspended or disconnected Qlik session counts as lost; chart errors do not", async () => {
  const { isSessionLost } = await load();
  assert.equal(isSessionLost({ code: -11, enigmaError: true, message: "Session suspended" }), true);
  assert.equal(isSessionLost({ code: -1, enigmaError: true, message: "Not connected" }), true);
  assert.equal(isSessionLost(new Error('Qlik could not resolve "Wins" (error 7001)')), false);
  assert.equal(isSessionLost({ code: 403 }), false);
  assert.equal(isSessionLost(undefined), false);
});

const ev = (elem, id, name, state = "O") => ({ elem, id, name, state });

test("the Event dropdown lists All Events, then the Current Event shortcut, then every other Event", async () => {
  const { eventOptions } = await load();
  const { options, value } = eventOptions([ev(0, "spring", "Spring Open"), ev(1, "fall", "Fall Classic"), ev(2, "summer", "Summer Open")], { id: "fall", name: "Fall Classic" });
  assert.deepEqual(options.map((o) => o.label), ["All Events", "Current Event: Fall Classic", "Spring Open", "Summer Open"]);
  assert.deepEqual(options.map((o) => o.value), ["", "1", "0", "2"]);
  assert.equal(value, "", "nothing selected reads as All Events");
});

test("the Event dropdown reflects the selection, including a Current Event with no Matches yet", async () => {
  const { eventOptions } = await load();
  const cells = [ev(0, "spring", "Spring Open", "S"), ev(1, "summer", "Summer Open", "X")];
  const picked = eventOptions(cells, { id: "fall", name: "Fall Classic" });
  assert.equal(picked.value, "0");
  assert.equal(picked.options[1].disabled, true, "the Current Event is not in Qlik until it has a Match");
  assert.match(picked.options[1].label, /Fall Classic.*no Matches yet/);
  assert.match(picked.options.at(-1).label, /Summer Open \(excluded\)/);
  const current = eventOptions([ev(0, "fall", "Fall Classic", "S")], { id: "fall", name: "Fall Classic" });
  assert.equal(current.value, "0", "the shortcut is the selected option when the Current Event is selected");
  const several = eventOptions([ev(0, "a", "A", "S"), ev(1, "b", "B", "S")], null);
  assert.equal(several.value, "multiple");
  assert.equal(several.options.find((o) => o.value === "multiple").label, "2 Events selected");
});

test("Events that share a name are told apart by id", async () => {
  const { eventOptions } = await load();
  const { options } = eventOptions([ev(0, "lets_gooo", "Open Play"), ev(1, "open_play", "Open Play")], null);
  assert.deepEqual(options.slice(1).map((o) => o.label), ["Open Play (lets_gooo)", "Open Play (open_play)"]);
});

test("selection chips name the field and value, escape Qlik text, and can each be removed", async () => {
  const { selectionChips, selectionsSummary } = await load();
  const selections = [{ qField: "Event Id", qSelected: "fall" }, { qField: "Player", qSelected: "<b>Ana</b>" }];
  const html = selectionChips(selections);
  assert.equal((html.match(/data-qm="remove-selection"/g) || []).length, 2);
  assert.match(html, /data-field="Player"/);
  assert.match(html, /aria-label="Remove Player selection"/);
  assert.doesNotMatch(html, /<b>Ana/);
  assert.equal(selectionsSummary(selections), "Filtered by Event Id: fall; Player: <b>Ana</b>");
  assert.equal(selectionsSummary([]), "No selections.");
});

test("arrow keys move through the Player results and wrap; Home and End jump", async () => {
  const { moveActive } = await load();
  assert.equal(moveActive(-1, "ArrowDown", 3), 0);
  assert.equal(moveActive(2, "ArrowDown", 3), 0);
  assert.equal(moveActive(-1, "ArrowUp", 3), 2);
  assert.equal(moveActive(0, "ArrowUp", 3), 2);
  assert.equal(moveActive(1, "Home", 3), 0);
  assert.equal(moveActive(0, "End", 3), 2);
  assert.equal(moveActive(1, "ArrowDown", 0), -1, "no results, nothing active");
});

const pc = (qText, qElemNumber, qState = "O") => ({ qText, qElemNumber, qState });

test("Player results are options with the active one marked, Qlik text escaped, excluded Players labelled", async () => {
  const { playerListbox } = await load();
  const html = playerListbox([pc("Ana <b>Cruz</b>", 4), pc("Ben Lim", 9, "X")], "an", 1, "qm-p-1");
  assert.equal((html.match(/role="option"/g) || []).length, 2);
  assert.match(html, /id="qm-p-1-1"[^>]*aria-selected="true"/);
  assert.match(html, /data-elem="4"[^>]*aria-selected="false"/);
  assert.doesNotMatch(html, /<b>Cruz/);
  assert.match(html, /Ben Lim \(excluded\)/);
});

test("no match shows a message naming the search; a long result list is capped with a hint", async () => {
  const { playerListbox } = await load();
  assert.match(playerListbox([], "zzz <i>", -1, "x"), /No Players match “zzz &lt;i&gt;”/);
  const many = Array.from({ length: 21 }, (_, i) => pc(`P${i}`, i));
  const html = playerListbox(many, "p", -1, "x");
  assert.equal((html.match(/role="option"/g) || []).length, 20);
  assert.match(html, /Keep typing to narrow/);
});

test("the Player filter is a type-ahead searched in Qlik, not a chip list", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../qlik-mashup.js"), "utf8");
  assert.match(source, /f === D\.player \? mountPlayerFilter/);
  assert.match(source, /searchListObjectFor\("\/qListObjectDef"/);
  assert.match(source, /role="combobox"/);
});

// Match Dates come from Qlik as day serials (days since 1899-12-30) with an element number each.
const day = (elem, iso, state = "O") => ({ elem, num: 46281 + Math.round((Date.parse(iso) - Date.parse("2026-09-16")) / 864e5), state });
const days = [day(0, "2026-09-16"), day(1, "2026-09-18"), day(2, "2026-09-21"), day(3, "2026-09-23"), day(4, "2026-09-24")];

test("Qlik day serials and ISO dates convert both ways", async () => {
  const { serialToIso, isoToSerial } = await load();
  assert.equal(serialToIso(46281), "2026-09-16");
  assert.equal(isoToSerial("2026-09-16"), 46281);
  assert.equal(isoToSerial(serialToIso(46288)), 46288);
  assert.equal(isoToSerial(""), null);
});

test("a date range selects every Match Date inside it, inclusive, and open ends run to the edge", async () => {
  const { rangeElems } = await load();
  assert.deepEqual(rangeElems(days, "2026-09-18", "2026-09-23"), [1, 2, 3]);
  assert.deepEqual(rangeElems(days, "2026-09-21", ""), [2, 3, 4]);
  assert.deepEqual(rangeElems(days, "", "2026-09-18"), [0, 1]);
  assert.deepEqual(rangeElems(days, "2026-09-19", "2026-09-20"), [], "a range with no Matches selects nothing");
});

test("a To date before From is refused with a message", async () => {
  const { rangeError } = await load();
  assert.match(rangeError("2026-09-23", "2026-09-18"), /To date must be on or after the From date/);
  assert.equal(rangeError("2026-09-18", "2026-09-18"), "");
  assert.equal(rangeError("2026-09-18", ""), "");
  assert.equal(rangeError("", ""), "");
});

test("inputs reflect a Match Date selection made elsewhere; a scattered selection is flagged, not faked", async () => {
  const { dateRangeOf } = await load();
  const pick = (...elems) => days.map((d) => ({ ...d, state: elems.includes(d.elem) ? "S" : "A" }));
  assert.deepEqual(dateRangeOf(pick(1, 2, 3)), { from: "2026-09-18", to: "2026-09-23" });
  assert.deepEqual(dateRangeOf(days), { from: "", to: "" }, "nothing selected");
  assert.deepEqual(dateRangeOf(pick(0, 3)), { scattered: true }, "dates 1 and 2 sit inside 0..3 but are not selected");
});

test("the Match Date filter is two native date inputs", () => {
  const source = fs.readFileSync(path.join(__dirname, "../qlik-mashup.js"), "utf8");
  assert.match(source, /f === D\.matchDate \? mountDateFilter/);
  assert.equal((source.match(/type="date"/g) || []).length, 2);
});

test("a % measure gets a 0-100% axis; other measures keep a rounded top", async () => {
  const { toTable, valueScale } = await load();
  const pct = valueScale(toTable(cube(["Date"], ["Win %"], [[["1", 1], ["67%", 0.67]], [["2", 2], ["40%", 0.4]]])), 1, [100, 0]);
  assert.deepEqual(pct.scale.domain(), [0, 1]);
  assert.equal(pct.format(0.5), "50%");
  const count = valueScale(toTable(cube(["Court"], ["Matches"], [[["1", 1], ["11", 11]]])), 1, [100, 0]);
  assert.deepEqual(count.scale.domain(), [0, 12], "D3 rounds 11 up to 12, not 20");
  assert.equal(count.format(1500), "1,500");
  const raw = valueScale(toTable(cube(["Court"], ["Matches"], [[["1", 1], ["11", 11]]])), 1, [0, 100], false);
  assert.deepEqual(raw.scale.domain(), [0, 11], "horizontal bars fill to the largest value");
});

test("a count axis has whole-number ticks only; a fractional measure keeps its decimals", async () => {
  const { toTable, RENDERERS } = await load();
  const ticks = (svg) => [...svg.matchAll(/<text class="qm-tick" x="[\d.]+" y="[\d.]+" text-anchor="end">([^<]*)</g)].map((m) => m[1]);
  const count = toTable(cube(["Date"], ["Matches"], [[["a", 1], ["2", 2]], [["b", 2], ["1", 1]]]));
  assert.deepEqual(ticks(RENDERERS.bar(count, { title: "Matches" })), ["0", "1", "2"]);
  const avg = toTable(cube(["Date"], ["Avg"], [[["a", 1], ["2.5", 2.5]], [["b", 2], ["1", 1]]]));
  assert.ok(ticks(RENDERERS.bar(avg, { title: "Avg" })).some((v) => v.includes(".")));
});

test("an hour chart labels its axis and tooltips as clock hours, and its card explains the chart", async () => {
  const { toTable, RENDERERS, SUBJECTS, hourLabel } = await load();
  assert.deepEqual([0, 1, 12, 13, 17, 23].map(hourLabel), ["12 AM", "1 AM", "12 PM", "1 PM", "5 PM", "11 PM"]);
  const t = toTable(cube(["Hour"], ["Matches"], [[["1", 1], ["1", 1]], [["17", 17], ["2", 2]]]));
  const svg = RENDERERS.bar(t, { title: "Matches by Hour of Day", hour: true });
  assert.match(svg, />1 AM</);
  assert.match(svg, />5 PM</);
  assert.match(svg, /data-label="5 PM"/);
  const chart = SUBJECTS["match-analysis"].charts.find((c) => c.title === "Matches by Hour of Day");
  assert.ok(chart.hour && chart.sub);
});

test("time charts label Match Dates as short dates and space line points by date", async () => {
  const { toTable, RENDERERS } = await load();
  // Day serials 46281 = 2026-09-16, 46283 = 2026-09-18, 46291 = 2026-09-26.
  const t = toTable(cube(["Match Date"], ["Win %"], [[["2026-09-16", 46281], ["50%", 0.5]], [["2026-09-18", 46283], ["60%", 0.6]], [["2026-09-26", 46291], ["70%", 0.7]]]));
  assert.match(RENDERERS.bar(t, { title: "Matches", time: true }), />Sep 16</);
  const xs = [...RENDERERS.line(t, { title: "Win %", time: true }).matchAll(/<circle cx="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.ok(xs[2] - xs[1] > 3 * (xs[1] - xs[0]), "eight days apart is drawn wider than two days apart");
});

test("drawn charts are keyboard-focusable and each mark carries its tooltip text", async () => {
  const { toTable, RENDERERS } = await load();
  const t = toTable(cube(["Court"], ["Matches"], [[["<b>1</b>", 1], ["4", 4]]]));
  for (const type of ["bar", "line"]) {
    const out = RENDERERS[type](t, { title: "Matches per Court" });
    assert.match(out, /<svg class="qm-svg"[^>]*tabindex="0"/, `${type} takes focus`);
    assert.match(out, /aria-label="Matches per Court\. Use the arrow keys to read each value\."/);
    assert.match(out, /data-label="&lt;b&gt;1&lt;\/b&gt;" data-value="Matches: 4"/, `${type} mark carries escaped tooltip text`);
  }
});

test("x labels are thinned so they never overlap, and charts draw at the width they are given", async () => {
  const { toTable, RENDERERS, labelStep } = await load();
  assert.equal(labelStep(["1", "2"], 100), 1, "short labels in wide slots all show");
  assert.equal(labelStep(["2026-09-21"], 20), 4, "dates in 20px slots show every 4th");
  const rows = Array.from({ length: 30 }, (_, i) => [[`2026-09-${String(i + 1).padStart(2, "0")}`, i], [String(i), i]]);
  const t = toTable(cube(["Date"], ["Matches"], rows));
  const narrow = RENDERERS.bar(t, { title: "Matches" }, undefined, 320);
  assert.match(narrow, /viewBox="0 0 320 260" width="320"/);
  assert.ok((narrow.match(/class="qm-tick"[^>]*text-anchor="middle"/g) || []).length < 30, "not every date is labelled");
});

test("horizontal bars keep full category names and scale to the largest value", async () => {
  const { toTable, RENDERERS } = await load();
  const t = toTable(cube(["Player"], ["Wins"], [[["Alexandria <i>Montgomery</i>", 1], ["8", 8]], [["Ben", 2], ["4", 4]]]));
  const html = RENDERERS.hbar(t, { title: "Wins by Player" });
  assert.match(html, /<ol class="qm-hbars" aria-label="Wins by Player">/);
  assert.match(html, /Alexandria &lt;i&gt;Montgomery&lt;\/i&gt;/, "full name, escaped");
  assert.match(html, /width: 100%/);
  assert.match(html, /width: 50%/);
});

test("match tables describe each Match by its Teams, newest first, never by its database id", async () => {
  const { SUBJECTS, hypercubeProps } = await load();
  const tables = [["overview", "Recent Matches"], ["match-analysis", "Match Details"], ["player-performance", "Match History"]]
    .map(([subject, title]) => SUBJECTS[subject].charts.find((c) => c.title === title));
  for (const chart of tables) {
    const [match, date] = hypercubeProps(chart).qHyperCubeDef.qDimensions;
    assert.equal(match.qDef.qFieldLabels[0], "Match");
    assert.match(match.qDef.qFieldDefs[0], /Concat\(.*'A'.*' vs '.*'B'/s, `${chart.title} names both Teams`);
    assert.match(match.qDef.qFieldDefs[0], /Dual\(/, "same-Team rematches stay separate rows");
    assert.doesNotMatch(JSON.stringify(chart.dims), /"Leaderboard Match Id"\],/, "the id is not the column");
    assert.equal(date.qDef.qSortCriterias[0].qSortByNumeric, -1, `${chart.title} is newest first`);
  }
});
