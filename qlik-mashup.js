// PaddlePoint's Qlik mashup (ADR 0004): Qlik computes, PaddlePoint draws.
//
// Every chart is a session object built from the app's master dimensions and measures, so
// business logic stays in Qlik and nothing here depends on a Sheet being published or its
// objects carrying renderer defaults. To customise a chart, edit SUBJECTS below; to restyle
// it, edit qlik-mashup.css.
//
// app.js renders <div data-qlik-mashup="subject-id"></div> and calls attach(app) after each
// render. The mashup swaps its own long-lived element in for that placeholder, so the app's
// innerHTML re-renders never tear down a live chart.

const QLIK_API = "https://cdn.jsdelivr.net/npm/@qlik/api@2.16.0/qix.js";
const HOST = "mtcmarketing.sg.qlikcloud.com";
const CLIENT_ID = "01a0ae9258265bb658e4d2b4021fac4c";
const APP_ID = "17ca2f54-46de-426c-9895-48f6c51513a3";

// Hypercube building blocks. L = master item by id, F = field, E = expression.
const L = (id) => ({ qLibraryId: id });
const F = (field, label = field) => ({ qDef: { qFieldDefs: [field], qFieldLabels: [label], qSortCriterias: [{ qSortByNumeric: 1, qSortByAscii: 1 }] } });
const E = (expr, label) => ({ qDef: { qDef: expr, qLabel: label } });
// Number format for a measure whose master item has none, e.g. fmt(L(id), "#,##0.0").
const fmt = (measure, pattern) => ({ ...measure, qDef: { ...measure.qDef, qNumFormat: { qType: "F", qFmt: pattern, qDec: ".", qThou: ",", qUseThou: 1 } } });

// Master items in the app, named so the catalogue reads like the Sheets do.
const M = {
  matches: L("DMjJQ"), wins: L("WwVAxj"), losses: L("CmKGnVm"), winPct: L("pTjNHW"),
  pointsFor: L("jPXeaBN"), pointsAgainst: L("GCTtjv"), pointDiff: L("Hxwy"),
  completed: L("6ae083f6-496f-4563-89c4-166c9c51cf38"), activePlayers: L("d587be5b-7c86-4dbc-8040-dd37a2a4b17f"),
  events: L("892c1529-b5c4-4cc9-8517-45a8e15029d3"), avgDuration: L("jwLsQpW"),
  avgMargin: fmt(L("311140a2-c87e-4df7-9b8b-6e152747618f"), "#,##0.0"),
  close: L("hJWwANp"), result: L("3ed79216-73d2-498f-abfc-9e6e55284e19"),
  participation: L("1046064c-7313-4ef0-acf6-875c26271ccc"), utilization: L("6ee3d4a9-61f3-4ca4-821a-9ec34313568d"),
  missingDuration: L("ee42c450-81aa-4ec5-bd17-4282d470d3f4"),
};
const D = {
  player: L("QALqASy"), matchDate: L("PwUrBz"), eventId: L("PnXaMzj"), partner: L("ffdc601d-f8c5-4a3a-abc3-756f91192483"),
  opponent: L("aa76fb17-93bf-458c-9442-b6e30f4dc8fb"), ranked: L("9c492aad-b3b6-45fd-9410-e7ae3481f8e3"),
  unranked: L("4f315dee-8e77-4998-8aa4-4a5dcdff01bc"),
};
const STANDINGS = [M.matches, M.wins, M.losses, M.winPct, M.pointsFor, M.pointsAgainst, M.pointDiff];
// Players per 20-point Win % band. Win % is the governed master measure, referenced by name;
// only the banding lives here.
const WIN_BAND = { qDef: {
  qFieldDefs: ["=Aggr(Dual(Num(RangeMin(Floor([Win %], 0.2), 0.8), '0%') & '-' & Num(RangeMin(Floor([Win %], 0.2), 0.8) + 0.2, '0%'), RangeMin(Floor([Win %], 0.2), 0.8)), Player)"],
  qFieldLabels: ["Win % band"], qSortCriterias: [{ qSortByNumeric: 1 }] } };
// A Match reads as its Teams ("Ana Cruz & Ben Lim vs Cara Diaz & Dan Ong"), not its database id
// ("game_1789464018652_5459cc"). Player selections are cleared inside the Concat so a selected
// Player still sees both Teams. The dual value's number is the millisecond stamp inside the id, so two
// Matches between the same Teams stay separate rows and sort in play order.
const teamOf = (side) => `Concat({<Player=, [Player Key]=, [Leaderboard Team]={'${side}'}>} DISTINCT Player, ' & ')`;
const MATCH = F(`=Aggr(Dual(${teamOf("A")} & ' vs ' & ${teamOf("B")}, Alt(Num#(SubField([Leaderboard Match Id], '_', 2)), 0)), [Leaderboard Match Id])`, "Match");
const MATCH_SCORE = E("Only([Team A Score]) & ' - ' & Only([Team B Score])", "Score");
const MATCH_WINNER = E(`If(Only([Leaderboard Winner]) = 'A', ${teamOf("A")}, ${teamOf("B")})`, "Winner");
// Match lists lead with the newest Match.
const NEWEST_FIRST = { ...D.matchDate, qDef: { ...D.matchDate.qDef, qSortCriterias: [{ qSortByNumeric: -1 }] } };
const PAGE_SIZE = 25;

// One entry per Analytics tab (ids match QLIK_SHEETS in app.js) plus the Admin dashboard.
// Chart fields: type (kpi | note | bar | hbar | line | scatter | table | tabs), title, dims, measures,
// Use bar (columns) for an ordered axis such as dates or hours, and hbar to compare named categories.
// sort (column order, dims first then measures; measures sort high-to-low), limit (rows),
// time (the dimension is Match Date: date-formatted axis, and a line spaces points by date),
// hour (the dimension is an hour 0-23: labelled "5 PM"), sub (a plain-language line under the title).
// A KPI band holds at most four values and leads with its hero (docs/qlik-sheet-design.md).
// A table without a limit is paged PAGE_SIZE rows at a time. tabs: tables sharing one region.
export const SUBJECTS = {
  dashboard: {
    charts: [{ type: "bar", title: "Matches Over Time", dims: [D.matchDate], measures: [M.matches], wide: true, bare: true, time: true }],
  },
  overview: {
    filters: [D.eventId, D.matchDate],
    charts: [
      { type: "kpi", hero: true, measures: [M.completed, M.activePlayers, M.events, M.avgDuration] },
      { type: "bar", title: "Matches Over Time", dims: [D.matchDate], measures: [M.completed], wide: true, time: true },
      { type: "hbar", title: "Win % Distribution (Players)", dims: [WIN_BAND], measures: [M.activePlayers] },
      { type: "table", title: "Top 10 Players", dims: [D.player], measures: [M.wins, M.losses, M.winPct, M.pointDiff], sort: [1, 3, 4, 0, 2], limit: 10 },
      { type: "table", title: "Recent Matches", dims: [MATCH, NEWEST_FIRST], measures: [MATCH_SCORE, MATCH_WINNER], sort: [1, 0, 2, 3], limit: 10, wide: true },
    ],
  },
  "match-analysis": {
    filters: [D.eventId, D.matchDate],
    charts: [
      { type: "kpi", hero: true, measures: [M.matches, M.close, M.avgMargin, M.avgDuration] },
      { type: "note", measures: [M.missingDuration], text: "{0} Matches have no recorded duration and are left out of duration averages.", wide: true },
      { type: "bar", title: "Matches by Hour of Day", sub: "How many Matches finished in each hour of the day, in Philippine time. Hours with no Matches are not shown.",
        dims: [F("Match Hour", "Hour")], measures: [M.matches], wide: true, hour: true },
      { type: "hbar", title: "Avg Duration by Round", dims: [F("Match Round", "Round")], measures: [M.avgDuration] },
      { type: "hbar", title: "Avg Duration by Court", dims: [F("Match Court", "Court")], measures: [M.avgDuration], sort: [1, 0] },
      { type: "table", title: "Match Details", dims: [MATCH, NEWEST_FIRST], measures: [MATCH_SCORE, MATCH_WINNER, M.avgDuration], sort: [1, 0, 2, 3, 4], wide: true },
    ],
  },
  leaderboard: {
    filters: [D.player, D.eventId],
    charts: [
      { type: "table", title: "Leaderboard Standings", dims: [D.player], measures: STANDINGS, sort: [2, 4, 7, 0, 1, 3, 5, 6], wide: true },
      { type: "hbar", title: "Wins by Player", dims: [D.player], measures: [M.wins], sort: [1, 0], limit: 15, wide: true },
    ],
  },
  "player-performance": {
    filters: [D.player, D.eventId, D.matchDate],
    charts: [
      { type: "kpi", hero: true, measures: [M.winPct, M.matches, M.wins, M.pointDiff] },
      { type: "line", title: "Win % Over Time", dims: [D.matchDate], measures: [M.winPct], wide: true, time: true },
      { type: "table", title: "Match History", dims: [MATCH, NEWEST_FIRST], measures: [M.result, M.pointsFor, M.pointsAgainst, M.pointDiff], sort: [1, 0, 2, 3, 4, 5], wide: true },
      { type: "tabs", title: "Partners and Opponents", wide: true, tabs: [
        { type: "table", title: "Partner Performance", dims: [D.partner], measures: [M.matches, M.wins, M.losses, M.winPct, M.pointDiff], sort: [1, 4, 0, 2, 3, 5] },
        { type: "table", title: "Opponent Results", dims: [D.opponent], measures: [M.matches, M.wins, M.losses, M.winPct, M.pointDiff], sort: [1, 4, 0, 2, 3, 5] },
      ] },
    ],
  },
  "partnership-analysis": {
    filters: [D.eventId, D.matchDate],
    charts: [
      { type: "scatter", title: "Win % vs Matches Together (3+ Matches)", dims: [D.ranked], measures: [M.matches, M.winPct], wide: true,
        empty: "No Partnership has played 3 or more Matches together yet." },
      { type: "table", title: "Ranked Partnerships", dims: [D.ranked], measures: [M.matches, M.wins, M.losses, M.winPct, M.pointDiff], sort: [4, 1, 0, 2, 3, 5],
        empty: "No Partnership has played 3 or more Matches together yet." },
      { type: "table", title: "Other Partnerships (fewer than 3 Matches)", dims: [D.unranked], measures: [M.matches], sort: [1, 0] },
    ],
  },
  "court-analytics": {
    filters: [D.eventId, D.matchDate],
    charts: [
      { type: "kpi", hero: true, measures: [M.completed, M.events, M.activePlayers, M.avgDuration] },
      { type: "table", title: "Event Summary", dims: [F("Event Name", "Event")], measures: [M.participation, M.activePlayers, M.completed, M.avgDuration], wide: true },
      { type: "hbar", title: "Matches per Court", dims: [F("Match Court", "Court")], measures: [M.completed], sort: [1, 0] },
      { type: "table", title: "Court Utilization", dims: [F("Event Name", "Event"), F("Match Court", "Court")], measures: [M.utilization, M.completed, M.missingDuration] },
      { type: "table", title: "Event Leaderboard", dims: [D.player], measures: STANDINGS, sort: [2, 4, 7, 0, 1, 3, 5, 6], wide: true },
    ],
  },
};

// ---- pure helpers (covered by tests/qlik-mashup.test.js) ----

const isPaged = (chart) => chart.type === "table" && !chart.limit;

export function hypercubeProps(chart) {
  const dims = (chart.dims || []).map((d) => ({ ...d, qNullSuppression: true }));
  const measures = (chart.measures || []).map((m) => ({ ...m, qSortBy: { qSortByNumeric: -1 } }));
  const width = dims.length + measures.length;
  return {
    qInfo: { qType: "paddlepoint-mashup" },
    qHyperCubeDef: {
      qDimensions: dims,
      qMeasures: measures,
      qInterColumnSortOrder: chart.sort || [...Array(width).keys()],
      qSuppressZero: false,
      qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: width, qHeight: Math.min(chart.limit || (isPaged(chart) ? PAGE_SIZE : 200), Math.floor(10000 / width)) }],
    },
  };
}

// qHyperCube -> { columns: [label], rows: [{ label, cells: [{text, num}] }] }
export function toTable(hc, limit = Infinity) {
  // A missing master item comes back as an empty cube with qError on its column (7001).
  const broken = [...hc.qDimensionInfo, ...hc.qMeasureInfo].find((c) => c.qError);
  if (broken) throw new Error(`Qlik could not resolve "${broken.qFallbackTitle}" (error ${broken.qError.qErrorCode})`);
  const columns = [...hc.qDimensionInfo, ...hc.qMeasureInfo].map((c) => c.qFallbackTitle);
  const matrix = (hc.qDataPages[0] && hc.qDataPages[0].qMatrix) || [];
  const rows = matrix.slice(0, limit).map((row) => ({
    label: row[0].qText,
    cells: row.map((c) => ({ text: c.qText ?? "", num: typeof c.qNum === "number" && Number.isFinite(c.qNum) ? c.qNum : null })),
  }));
  return { columns, rows, dims: hc.qDimensionInfo.length };
}

// Which rows page `page` of `total` covers; an out-of-range page is clamped to the last one.
export function pageWindow(total, page, size) {
  const pages = Math.max(1, Math.ceil(total / size));
  page = Math.min(Math.max(page, 0), pages - 1);
  const top = page * size, height = Math.max(0, Math.min(size, total - top));
  return { page, top, height, from: height ? top + 1 : 0, to: top + height, pages };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---- filters and selections ----

// Options for the Event dropdown: All Events, the Current Event shortcut, then every other Event.
// cells: [{ elem, id, name, state }] from the Event Id list; current: { id, name } or null.
export function eventOptions(cells, current) {
  const selected = cells.filter((c) => c.state === "S");
  const sameName = (c) => cells.filter((o) => o.name === c.name).length > 1;
  const here = current && cells.find((c) => c.id === current.id);
  const options = [{ value: "", label: "All Events" }];
  if (selected.length > 1) options.push({ value: "multiple", label: `${selected.length} Events selected`, disabled: true });
  // A new Event is not in Qlik until its first Match is finished and the app reloads.
  if (current) options.push(here
    ? { value: String(here.elem), label: `Current Event: ${current.name}` }
    : { value: "no-current", label: `Current Event: ${current.name} (no Matches yet)`, disabled: true });
  for (const c of cells) {
    if (current && c.id === current.id) continue;
    options.push({ value: String(c.elem), label: `${sameName(c) ? `${c.name} (${c.id})` : c.name}${c.state === "X" ? " (excluded)" : ""}` });
  }
  return { options, value: selected.length === 0 ? "" : selected.length === 1 ? String(selected[0].elem) : "multiple" };
}

// One removable chip per active selection; qSelections comes from a selection object.
export const selectionChips = (selections) => selections.map((s) => `
  <li class="qm-selection"><span><strong>${esc(s.qField)}</strong> ${esc(s.qSelected)}</span>
    <button type="button" class="qm-selection-remove" data-qm="remove-selection" data-field="${esc(s.qField)}" aria-label="Remove ${esc(s.qField)} selection">×</button></li>`).join("");

export const selectionsSummary = (selections) =>
  selections.length ? `Filtered by ${selections.map((s) => `${s.qField}: ${s.qSelected}`).join("; ")}` : "No selections.";

const PLAYER_RESULTS = 20;

// The active option after a key press in the Player results; arrows wrap.
export function moveActive(active, key, count) {
  if (!count) return -1;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowDown") return active + 1 >= count ? 0 : active + 1;
  if (key === "ArrowUp") return active <= 0 ? count - 1 : active - 1;
  return active;
}

// The Player results list. cells come from a Qlik list object; an empty list says so, and a
// long one is capped (fetch one more than PLAYER_RESULTS to know) with a hint to keep typing.
export function playerListbox(cells, term, active, id) {
  if (!cells.length) return `<li class="qm-option-note" role="presentation">No Players match “${esc(term)}”.</li>`;
  return cells.slice(0, PLAYER_RESULTS).map((c, i) => `
    <li class="qm-option qm-state-${esc(c.qState)}" role="option" id="${id}-${i}" data-elem="${c.qElemNumber}" aria-selected="${i === active}">${esc(c.qText)}${c.qState === "X" ? " (excluded)" : ""}</li>`).join("")
    + (cells.length > PLAYER_RESULTS ? `<li class="qm-option-note" role="presentation">Showing the first ${PLAYER_RESULTS}. Keep typing to narrow the list.</li>` : "");
}

// Match Dates come from Qlik as day serials (days since 1899-12-30); date inputs speak ISO.
const SERIAL_ZERO = Date.UTC(1899, 11, 30);
export const serialToIso = (n) => new Date(SERIAL_ZERO + n * 864e5).toISOString().slice(0, 10);
export const isoToSerial = (iso) => (iso ? Math.round((Date.parse(iso) - SERIAL_ZERO) / 864e5) : null);

// Element numbers of the Match Dates inside From..To, inclusive; an empty end is open.
// cells: [{ elem, num, state }] from the Match Date list.
export function rangeElems(cells, from, to) {
  const lo = isoToSerial(from) ?? -Infinity, hi = isoToSerial(to) ?? Infinity;
  return cells.filter((c) => c.num >= lo && c.num <= hi).map((c) => c.elem);
}

export const rangeError = (from, to) => (from && to && to < from ? "The To date must be on or after the From date." : "");

// What the From/To inputs should show for the dates selected in Qlik. A selection that is not one
// unbroken run of dates (made in Qlik Cloud, say) cannot be shown as a range: { scattered: true }.
export function dateRangeOf(cells) {
  const picked = cells.filter((c) => c.state === "S");
  if (!picked.length) return { from: "", to: "" };
  const lo = Math.min(...picked.map((c) => c.num)), hi = Math.max(...picked.map((c) => c.num));
  if (cells.filter((c) => c.num >= lo && c.num <= hi).length !== picked.length) return { scattered: true };
  return { from: serialToIso(lo), to: serialToIso(hi) };
}

// ---- renderers: data in, markup out. Restyle via qlik-mashup.css. ----

// Charts are drawn with D3 (vendor/d3-7.9.0.min.js: index.html loads it, and so do the tests).
// D3 owns the scales, ticks, number and date formats and the line path; the markup stays a
// string so a chart re-renders with the rest of its card, and tooltips() adds the interaction.
const d3 = () => globalThis.d3;

// SVG charts are drawn at the card's real width (W is the default for tests), so their text
// stays at the type scale on every screen instead of shrinking with the card. MIN_W is the
// narrowest a plot is drawn; a narrower card scrolls it sideways.
const W = 640, MIN_W = 280, H = 260, PAD = { l: 48, r: 16, t: 20, b: 40 }, TICKS = 4;

// A measure's linear scale over `range`. A % measure (Qlik text ends in %) keeps a fixed
// 0-100% domain so charts compare honestly; any other measure gets D3's nice rounded domain.
export function valueScale(t, col, range, nice = true) {
  const vals = t.rows.map((r) => r.cells[col].num || 0);
  const pct = t.rows.some((r) => r.cells[col].text.endsWith("%"));
  const top = d3().max(vals) || 0;
  const scale = d3().scaleLinear().domain([0, pct && top <= 1 ? 1 : top || 1]).range(range);
  if (nice && !(pct && top <= 1)) scale.nice(TICKS);
  // A measure whose values are all whole numbers (a count) never gets a 0.5 or 1.5 tick.
  return { vals, scale, integer: !pct && vals.every(Number.isInteger), format: scale.tickFormat(TICKS, pct ? "%" : ",~r") };
}

// Draw every nth x label so labels never overlap (about 7px per character at caption size).
export const labelStep = (labels, gap) =>
  Math.max(1, Math.ceil((Math.min(12, Math.max(1, ...labels.map((l) => l.length))) * 7 + 8) / gap));
const short = (label) => (label.length > 12 ? label.slice(0, 11) + "…" : label);
// A time chart's dimension is a Qlik day serial; its axis reads "Sep 21" rather than the full date.
const serialDate = (n) => new Date(SERIAL_ZERO + n * 864e5);
// An hour-of-day dimension is 0-23; it reads "5 PM" rather than "17".
export const hourLabel = (h) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
const xLabel = (chart, r) => {
  const n = r.cells[0].num;
  if (chart.time && Number.isFinite(n)) return d3().utcFormat("%b %-d")(serialDate(n));
  return chart.hour && Number.isInteger(n) ? hourLabel(n) : r.label;
};

function axisY(s, w) {
  return s.scale.ticks(TICKS).filter((v) => !s.integer || Number.isInteger(v)).map((v) => {
    const y = s.scale(v);
    return `<line class="qm-gridline${v === 0 ? " qm-baseline" : ""}" x1="${PAD.l}" x2="${w - PAD.r}" y1="${y}" y2="${y}"/><text class="qm-tick" x="${PAD.l - 8}" y="${y + 4}" text-anchor="end">${esc(s.format(v))}</text>`;
  }).join("");
}
const tickX = (x, label, anchor = "middle") => `<text class="qm-tick" x="${x}" y="${H - PAD.b + 18}" text-anchor="${anchor}">${esc(label)}</text>`;
// One hoverable, focusable data point; tooltips() reads these attributes.
const mark = (cls, x, y, label, value, body) =>
  `<g class="${cls} qm-mark" data-x="${x}" data-y="${y}" data-label="${esc(label)}" data-value="${esc(value)}">${body}</g>`;

// Every drawn chart also carries its numbers as a table, for screen readers and exact values.
// nearest: "x" picks the column or point under the pointer's x; "xy" the closest point.
const svg = (t, chart, body, w, nearest = "x") => `<div class="qm-plot">
  <svg class="qm-svg" viewBox="0 0 ${w} ${H}" width="${w}" height="${H}" tabindex="0" role="img" data-nearest="${nearest}"
    aria-label="${esc(chart.title)}. Use the arrow keys to read each value.">${body}</svg></div>
  <details class="qm-data"><summary>Show data table</summary>${RENDERERS.table(t, chart)}</details>`;

function pager(chart, { page, total }) {
  const w = pageWindow(total, page, PAGE_SIZE);
  if (w.pages < 2) return "";
  return `<nav class="qm-pager" aria-label="${esc(chart.title || "Table")} pages"><span>Rows ${w.from}-${w.to} of ${total}</span>
    <button type="button" class="button ghost" data-qm="page" data-page="${w.page - 1}"${w.page === 0 ? " disabled" : ""}>Previous</button>
    <button type="button" class="button ghost" data-qm="page" data-page="${w.page + 1}"${w.page >= w.pages - 1 ? " disabled" : ""}>Next</button></nav>`;
}

export function tabsMarkup(chart, id) {
  return `<div class="qm-tablist" role="tablist" aria-label="${esc(chart.title || "")}">${chart.tabs.map((tab, i) => `
    <button type="button" class="qm-tab" role="tab" id="${id}-tab-${i}" aria-controls="${id}-panel-${i}" aria-selected="${i === 0}"${i ? ' tabindex="-1"' : ""} data-qm="tab">${esc(tab.title)}</button>`).join("")}</div>
    ${chart.tabs.map((_, i) => `<div class="qm-tabpanel" id="${id}-panel-${i}" role="tabpanel" aria-labelledby="${id}-tab-${i}"${i ? " hidden" : ""}></div>`).join("")}`;
}

export const RENDERERS = {
  kpi(t, chart = {}) {
    const row = t.rows[0];
    return `<div class="qm-kpis">${t.columns.map((c, i) => `
      <div class="qm-kpi${chart.hero && i === 0 ? " qm-kpi--hero" : ""}"><span class="qm-kpi-label">${esc(c)}</span><strong class="qm-kpi-value">${esc(row ? row.cells[i].text : "-")}</strong></div>`).join("")}</div>`;
  },
  note(t, chart) {
    return `<p class="qm-note">${esc(chart.text.replace("{0}", t.rows[0] ? t.rows[0].cells[0].text : "-"))}</p>`;
  },
  bar(t, chart, _paging, w = W) {
    const s = valueScale(t, t.dims, [H - PAD.b, PAD.t]);
    const x = d3().scaleBand().domain(d3().range(t.rows.length)).range([PAD.l, w - PAD.r]).paddingInner(0.3).paddingOuter(0.15);
    const bw = x.bandwidth(), labels = t.rows.map((r) => xLabel(chart, r)), step = labelStep(labels, x.step());
    const bars = t.rows.map((r, i) => {
      const y = s.scale(s.vals[i]), cx = x(i) + bw / 2, text = r.cells[t.dims].text;
      return mark("qm-bar", cx, y, chart.hour ? labels[i] : r.label, `${t.columns[t.dims]}: ${text}`, `
        <rect x="${x(i)}" y="${y}" width="${bw}" height="${H - PAD.b - y}" rx="${Math.min(3, bw / 4)}"/>
        ${bw >= 24 ? `<text class="qm-value" x="${cx}" y="${y - 6}" text-anchor="middle">${esc(text)}</text>` : ""}
        ${i % step === 0 ? tickX(cx, short(labels[i])) : ""}`);
    }).join("");
    return svg(t, chart, axisY(s, w) + bars, w);
  },
  // A time chart spaces its points by date (gaps in play show as gaps) with D3's own date ticks;
  // any other line spaces them evenly and thins the labels.
  line(t, chart, _paging, w = W) {
    const time = chart.time && t.rows.every((r) => Number.isFinite(r.cells[0].num));
    // A line joins points in order, so a time line is drawn in date order whatever Qlik's sort.
    if (time) t = { ...t, rows: [...t.rows].sort((a, b) => a.cells[0].num - b.cells[0].num) };
    const s = valueScale(t, t.dims, [H - PAD.b, PAD.t]), n = t.rows.length;
    let px, ticks;
    if (time) {
      const x = d3().scaleUtc().domain(d3().extent(t.rows, (r) => serialDate(r.cells[0].num))).range([PAD.l + 8, w - PAD.r - 8]);
      px = (i) => x(serialDate(t.rows[i].cells[0].num));
      // D3 picks calendar-friendly dates (weeks, months); thin them if they would still collide.
      const format = x.tickFormat(), dates = n > 1 ? x.ticks(Math.max(3, Math.floor((w - PAD.l - PAD.r) / 80))) : [];
      const step = labelStep(dates.map(format), (w - PAD.l - PAD.r) / Math.max(1, dates.length));
      ticks = n > 1
        ? dates.map((d, i) => (i % step === 0 ? tickX(x(d), format(d)) : "")).join("")
        : tickX(px(0), xLabel(chart, t.rows[0]));
    } else {
      const x = d3().scalePoint().domain(d3().range(n)).range([PAD.l + 8, w - PAD.r - 8]).padding(n === 1 ? 0.5 : 0);
      const step = labelStep(t.rows.map((r) => r.label), x.step() || w);
      px = x;
      ticks = t.rows.map((r, i) => (i % step === 0 ? tickX(x(i), short(r.label)) : "")).join("");
    }
    const line = d3().line().x((_, i) => px(i)).y((v) => s.scale(v)).curve(d3().curveMonotoneX);
    const area = d3().area().x((_, i) => px(i)).y0(H - PAD.b).y1((v) => s.scale(v)).curve(d3().curveMonotoneX);
    const dots = t.rows.map((r, i) => mark("qm-point", px(i), s.scale(s.vals[i]), r.label, `${t.columns[t.dims]}: ${r.cells[t.dims].text}`,
      `<circle cx="${px(i)}" cy="${s.scale(s.vals[i])}" r="4"/>`)).join("");
    return svg(t, chart, axisY(s, w) + ticks + `<path class="qm-area" d="${area(s.vals)}"/><path class="qm-line" d="${line(s.vals)}"/>` + dots, w);
  },
  scatter(t, chart, _paging, w = W) {
    const xs = valueScale(t, t.dims, [PAD.l + 8, w - PAD.r - 8]), ys = valueScale(t, t.dims + 1, [H - PAD.b, PAD.t]);
    const dots = t.rows.map((r, i) => mark("qm-point", xs.scale(xs.vals[i]), ys.scale(ys.vals[i]), r.label,
      `${t.columns[t.dims]}: ${r.cells[t.dims].text} · ${t.columns[t.dims + 1]}: ${r.cells[t.dims + 1].text}`,
      `<circle cx="${xs.scale(xs.vals[i])}" cy="${ys.scale(ys.vals[i])}" r="6"/>`)).join("");
    const ticksX = xs.scale.ticks(Math.max(2, Math.floor((w - PAD.l - PAD.r) / 80))).map((v) => tickX(xs.scale(v), xs.format(v))).join("");
    return svg(t, chart, axisY(ys, w) + ticksX + dots +
      `<text class="qm-axis-title" x="${(PAD.l + w - PAD.r) / 2}" y="${H - 4}" text-anchor="middle">${esc(t.columns[t.dims])}</text>
      <text class="qm-axis-title" x="${PAD.l}" y="11">${esc(t.columns[t.dims + 1])}</text>`, w, "xy");
  },
  // Ranked categories as HTML rows: names wrap instead of being cut, text stays at the type
  // scale at any width, and every value is printed, so no separate data table is needed.
  hbar(t, chart) {
    const s = valueScale(t, t.dims, [0, 100], false);
    return `<ol class="qm-hbars" aria-label="${esc(chart.title || "")}">${t.rows.map((r, i) => `
      <li class="qm-hbar"><span class="qm-hbar-label">${esc(r.label)}</span>
        <span class="qm-hbar-track" aria-hidden="true"><span class="qm-hbar-fill" style="width: ${+s.scale(s.vals[i]).toFixed(2)}%"></span></span>
        <span class="qm-hbar-value">${esc(r.cells[t.dims].text)}</span></li>`).join("")}</ol>`;
  },
  table(t, chart = {}, paging) {
    return `<div class="qm-table-wrap"><table class="qm-table">${chart.title ? `<caption class="sr-only">${esc(chart.title)}</caption>` : ""}
      <thead><tr>${t.columns.map((c, i) => `<th scope="col" class="${i >= t.dims ? "qm-num" : ""}">${esc(c)}</th>`).join("")}</tr></thead>
      <tbody>${t.rows.map((r) => `<tr>${r.cells.map((c, i) => i === 0 ? `<th scope="row">${esc(c.text)}</th>` : `<td class="${i >= t.dims ? "qm-num" : ""}">${esc(c.text)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div>${paging ? pager(chart, paging) : ""}`;
  },
};

// A chart with no real rows (Qlik returns one all-null row for an empty cube) shows its
// empty message instead of an empty axis.
export function isEmpty(t, chart) {
  if (chart.type === "kpi" || chart.type === "note") return false;
  return t.rows.length === 0 || t.rows.every((r) => r.cells.slice(t.dims).every((c) => c.num === null && (c.text === "" || c.text === "-")));
}

// enigma's SESSION_SUSPENDED (-11) and NOT_CONNECTED (-1): the socket dropped (sleep, Wi-Fi,
// network change), so every chart on the session fails at once. Anything else is one chart's fault.
export const isSessionLost = (error) => Boolean(error && error.enigmaError && (error.code === -11 || error.code === -1));

// ---- runtime (browser only) ----

let docPromise = null;
let appSession = null;
let root = null;
let current = null; // { id, objects: [], generation }
let generation = 0;
let tabIds = 0;
let lastReconnect = 0;

// Reopens a lost session and redraws the subject on screen, at most once per 10 s so a dead
// network ends at the retry panel instead of a reconnect loop. Returns whether it reconnected.
function reconnect(error) {
  if (!isSessionLost(error) || !root || !root.isConnected || Date.now() - lastReconnect < 10000) return false;
  lastReconnect = Date.now();
  close();
  build(root.dataset.subject);
  return true;
}

function openDoc() {
  if (!docPromise) {
    docPromise = import(QLIK_API).then(async ({ openAppSession }) => {
      const session = openAppSession({
        appId: APP_ID,
        // One session per browser tab: selections carry across tabs of the view, not across browser tabs.
        identity: `paddlepoint-${crypto.randomUUID()}`,
        // Called again whenever the socket reconnects, so an expired token is simply replaced.
        hostConfig: { authType: "oauth2", host: HOST, clientId: CLIENT_ID, getAccessToken: () => window.getPaddlePointQlikToken() },
      });
      appSession = session;
      const doc = await session.getDoc();
      // A dropped connection: reopen once and redraw the subject on screen. If that fails too,
      // build() shows the retry panel. close() clears appSession first, so sign-out never reopens.
      doc.on("closed", () => {
        if (appSession !== session) return;
        appSession = null;
        docPromise = null;
        current = null;
        if (root && root.isConnected) build(root.dataset.subject);
      });
      return doc;
    });
    docPromise.catch(() => { docPromise = null; });
  }
  return docPromise;
}

// Ends the Qlik session: on sign-out (app.js) and when the page is hidden for good.
export function close() {
  generation++;
  current = null;
  const session = appSession;
  appSession = null;
  docPromise = null;
  if (session) session.close().catch(() => {});
}

function card(chart, body) {
  return `${chart.title && !chart.bare ? `<h2 class="qm-title">${esc(chart.title)}</h2>` : ""}${chart.sub ? `<p class="qm-sub">${esc(chart.sub)}</p>` : ""}<div class="qm-body">${body}</div>`;
}

// Redraws SVG charts when their card changes width (window resize, sidebar toggle, tab shown).
const SVG_TYPES = new Set(["bar", "line", "scatter"]);
const resizer = typeof ResizeObserver === "function"
  ? new ResizeObserver((entries) => entries.forEach((e) => e.target.qmResize && e.target.qmResize()))
  : null;

// Reads the value under the pointer, a tap, or the keyboard (arrow keys, Home, End, Escape once
// the chart has focus). The nearest mark wins, so a thin column is as easy to hit as a wide one.
function tooltips(el) {
  const svgEl = el.querySelector(".qm-svg");
  if (!svgEl) return;
  const plot = svgEl.parentElement, marks = [...svgEl.querySelectorAll(".qm-mark")];
  const tip = plot.appendChild(Object.assign(document.createElement("div"), { className: "qm-tip", hidden: true }));
  tip.setAttribute("role", "status");
  const byX = svgEl.dataset.nearest === "x";
  let active = -1;
  const show = (i) => {
    if (marks[active]) marks[active].classList.remove("is-active");
    active = i;
    tip.hidden = i < 0;
    if (i < 0) return;
    const m = marks[i], k = svgEl.getBoundingClientRect().width / svgEl.viewBox.baseVal.width;
    m.classList.add("is-active");
    tip.innerHTML = `<strong>${esc(m.dataset.label)}</strong><span>${esc(m.dataset.value)}</span>`;
    const left = Math.min(Math.max(m.dataset.x * k - tip.offsetWidth / 2, plot.scrollLeft), plot.scrollLeft + plot.clientWidth - tip.offsetWidth);
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(0, m.dataset.y * k - tip.offsetHeight - 10)}px`;
  };
  const nearest = (event) => {
    const [x, y] = d3().pointer(event, svgEl);
    return d3().leastIndex(marks, (m) => (byX ? Math.abs(m.dataset.x - x) : Math.hypot(m.dataset.x - x, m.dataset.y - y)));
  };
  d3().select(svgEl)
    .on("pointermove pointerdown", (e) => show(nearest(e)))
    // A tap keeps its value on screen; a mouse leaving the chart clears it.
    .on("pointerleave", (e) => { if (e.pointerType === "mouse") show(-1); })
    .on("focus", () => show(Math.max(active, 0)))
    .on("blur", () => show(-1))
    .on("keydown", (e) => {
      if (e.key === "Escape") return show(-1);
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!step && e.key !== "Home" && e.key !== "End") return;
      e.preventDefault();
      show(e.key === "Home" ? 0 : e.key === "End" ? marks.length - 1 : Math.min(marks.length - 1, Math.max(0, active + step)));
    });
}

// One chart failing leaves the rest of the subject standing, with its own retry.
function chartError(el, chart, error) {
  if (reconnect(error)) return;
  console.error(`Qlik chart "${chart.title || chart.type}" failed`, error);
  el.innerHTML = card(chart, `<div class="qm-chart-error" role="alert"><p>This ${chart.type === "table" ? "table" : "chart"} could not load.</p>
    <button type="button" class="button ghost" data-qm="retry-chart">Retry</button></div>`);
}

async function mountChart(doc, chart, el, gen) {
  if (chart.type === "tabs") return mountTabs(doc, chart, el, gen);
  el.className = `qm-card qm-card--${chart.type}${chart.wide ? " qm-wide" : ""}`;
  el.innerHTML = card(chart, '<p class="qm-status" role="status">Loading…</p>');
  let obj = null;
  el.qmRetry = async () => {
    if (obj) doc.destroySessionObject(obj.id).catch(() => {});
    const fresh = await mountChart(doc, chart, el, gen);
    if (fresh && current) current.objects.push(fresh);
  };
  try {
    obj = await doc.createSessionObject(hypercubeProps(chart));
    let page = 0;
    const draw = async () => {
      if (gen !== generation) return;
      try {
        // The layout is cached by @qlik/api: read it, never write to it, or a later page leaks back.
        let hc = (await obj.getLayout()).qHyperCube;
        let paging;
        if (isPaged(chart)) {
          const w = pageWindow(hc.qSize.qcy, page, PAGE_SIZE);
          page = w.page;
          if (w.top > 0) hc = { ...hc, qDataPages: await obj.getHyperCubeData("/qHyperCubeDef", [{ qTop: w.top, qLeft: 0, qWidth: hc.qSize.qcx, qHeight: w.height }]) };
          paging = { page, total: hc.qSize.qcy };
        }
        if (gen !== generation) return;
        last = { t: toTable(hc, chart.limit), paging };
        paint();
      } catch (error) {
        if (gen === generation) chartError(el, chart, error);
      }
    };
    // The last data drawn, so a resize redraws the SVG at its new width without asking Qlik.
    let last = null, drawnWidth = 0;
    const paint = () => {
      const { t, paging } = last;
      drawnWidth = el.querySelector(".qm-body").clientWidth;
      el.innerHTML = card(chart, isEmpty(t, chart)
        ? `<p class="qm-status">${esc(chart.empty || "No data for the current selections.")}</p>`
        : RENDERERS[chart.type](t, chart, paging, Math.max(MIN_W, drawnWidth || W)));
      if (SVG_TYPES.has(chart.type)) tooltips(el);
    };
    if (SVG_TYPES.has(chart.type) && resizer) {
      el.qmResize = () => {
        const width = el.querySelector(".qm-body")?.clientWidth;
        if (last && width && width !== drawnWidth && gen === generation) paint();
      };
      resizer.observe(el);
    }
    el.qmPage = (p) => { page = p; draw(); };
    obj.on("changed", draw);
    await draw();
  } catch (error) {
    if (gen === generation) chartError(el, chart, error);
  }
  return obj;
}

// Tables answering one question share a tabbed region (docs/qlik-sheet-design.md, Detail).
async function mountTabs(doc, chart, el, gen) {
  el.className = `qm-card qm-card--tabs${chart.wide ? " qm-wide" : ""}`;
  el.innerHTML = `<h2 class="qm-title">${esc(chart.title)}</h2>${tabsMarkup(chart, `qm-tabs-${++tabIds}`)}`;
  const panels = [...el.querySelectorAll(".qm-tabpanel")];
  return Promise.all(chart.tabs.map((tab, i) =>
    mountChart(doc, { ...tab, bare: true }, panels[i].appendChild(document.createElement("div")), gen)));
}

function selectTab(tab) {
  const tabs = [...tab.closest("[role=tablist]").querySelectorAll("[role=tab]")];
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
  }
  tab.focus();
}

async function mountFilter(doc, dim, el, gen) {
  const obj = await doc.createSessionObject({
    qInfo: { qType: "paddlepoint-filter" },
    qListObjectDef: { ...dim, qShowAlternatives: true, qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: 1, qHeight: 200 }] },
  });
  const draw = async () => {
    if (gen !== generation) return;
    const lo = (await obj.getLayout()).qListObject;
    const cells = ((lo.qDataPages[0] && lo.qDataPages[0].qMatrix) || []).map((r) => r[0]);
    const label = lo.qDimensionInfo.qFallbackTitle;
    el.innerHTML = `<span class="qm-filter-label" id="qm-f-${esc(obj.id)}">${esc(label)}</span>
      <div class="qm-chips" role="group" aria-labelledby="qm-f-${esc(obj.id)}">${cells.map((c) => `
        <button type="button" class="qm-chip qm-state-${c.qState}" data-elem="${c.qElemNumber}" aria-pressed="${c.qState === "S"}"
          title="${esc(c.qText)}${c.qState === "X" ? " (excluded)" : c.qState === "A" ? " (alternative)" : ""}">${esc(c.qText)}</button>`).join("")}</div>`;
  };
  el.onclick = (e) => {
    const chip = e.target.closest("[data-elem]");
    if (chip) obj.selectListObjectValues("/qListObjectDef", [Number(chip.dataset.elem)], true);
  };
  obj.on("changed", draw);
  await draw();
  return obj;
}

// The Event filter is a single-choice dropdown, not chips. The Current Event comes from the app.
async function mountEventFilter(doc, dim, el, gen) {
  const [obj, current] = await Promise.all([
    doc.createSessionObject({
      qInfo: { qType: "paddlepoint-filter" },
      // The second column is each Event's name, so the list reads "Fall Classic" rather than an id.
      qListObjectDef: { ...dim, qShowAlternatives: true, qExpressions: [{ qExpr: "Only({1} [Event Name])" }], qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: 2, qHeight: 200 }] },
    }),
    Promise.resolve(window.getPaddlePointCurrentEvent && window.getPaddlePointCurrentEvent()).catch(() => null),
  ]);
  const draw = async () => {
    if (gen !== generation) return;
    const lo = (await obj.getLayout()).qListObject;
    const cells = ((lo.qDataPages[0] && lo.qDataPages[0].qMatrix) || []).map((r) => ({
      elem: r[0].qElemNumber, id: r[0].qText, state: r[0].qState, name: r[1] && r[1].qText !== "-" ? r[1].qText : r[0].qText,
    }));
    const { options, value } = eventOptions(cells, current);
    const hadFocus = el.contains(document.activeElement);
    el.innerHTML = `<label class="qm-filter-label" for="qm-f-${esc(obj.id)}">Event</label>
      <select class="input qm-select" id="qm-f-${esc(obj.id)}">${options.map((o) => `
        <option value="${esc(o.value)}"${o.disabled ? " disabled" : ""}${o.value === value ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`;
    if (hadFocus) el.querySelector("select").focus();
  };
  el.onchange = (e) => {
    if (e.target.value === "") obj.clearSelections("/qListObjectDef");
    else obj.selectListObjectValues("/qListObjectDef", [Number(e.target.value)], false);
  };
  obj.on("changed", draw);
  await draw();
  return obj;
}

// The Match Date filter is two native date inputs that select the Match Dates in that range.
async function mountDateFilter(doc, dim, el, gen) {
  const obj = await doc.createSessionObject({
    qInfo: { qType: "paddlepoint-filter" },
    qListObjectDef: { ...dim, qShowAlternatives: true, qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: 1, qHeight: 5000 }] },
  });
  const id = `qm-d-${esc(obj.id)}`;
  el.innerHTML = `<fieldset class="qm-daterange"><legend class="qm-filter-label">Match Date</legend>
    <label class="qm-date"><span>From</span><input class="input" type="date" id="${id}-from"></label>
    <label class="qm-date"><span>To</span><input class="input" type="date" id="${id}-to"></label>
    <p class="qm-filter-error" role="alert" hidden></p></fieldset>`;
  const [from, to] = el.querySelectorAll("input"), error = el.querySelector(".qm-filter-error");
  let cells = [];
  const say = (message) => { error.textContent = message; error.hidden = !message; };

  const draw = async () => {
    if (gen !== generation) return;
    const lo = (await obj.getLayout()).qListObject;
    cells = ((lo.qDataPages[0] && lo.qDataPages[0].qMatrix) || []).map((r) => ({ elem: r[0].qElemNumber, num: r[0].qNum, state: r[0].qState })).filter((c) => Number.isFinite(c.num));
    if (cells.length) {
      const nums = cells.map((c) => c.num);
      from.min = to.min = serialToIso(Math.min(...nums));
      from.max = to.max = serialToIso(Math.max(...nums));
    }
    const shown = dateRangeOf(cells);
    // Leave the inputs alone when they already describe this selection, so an open end stays open.
    const selected = cells.filter((c) => c.state === "S").map((c) => c.elem);
    const typed = rangeElems(cells, from.value, to.value);
    if (!shown.scattered && (from.value || to.value) && typed.length === selected.length && typed.every((e) => selected.includes(e))) return;
    from.value = shown.from || "";
    to.value = shown.to || "";
    say(shown.scattered ? "Dates that are not a single range are selected; see the selections below." : "");
  };
  el.onchange = () => {
    const message = rangeError(from.value, to.value);
    if (message) return say(message);
    if (!from.value && !to.value) { say(""); return obj.clearSelections("/qListObjectDef"); }
    const elems = rangeElems(cells, from.value, to.value);
    if (!elems.length) return say("No Matches were played in that date range.");
    say("");
    obj.selectListObjectValues("/qListObjectDef", elems, false);
  };
  obj.on("changed", draw);
  await draw();
  return obj;
}

// The Player filter is a type-ahead (WAI-ARIA combobox): typing searches Player names in Qlik, so
// it works for any number of Players. The chosen Player shows up in the selection chips.
async function mountPlayerFilter(doc, dim, el, gen) {
  const obj = await doc.createSessionObject({
    qInfo: { qType: "paddlepoint-filter" },
    qListObjectDef: { ...dim, qShowAlternatives: true, qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: 1, qHeight: 1 }] },
  });
  const id = `qm-p-${esc(obj.id)}`;
  el.innerHTML = `<label class="qm-filter-label" for="${id}">Player</label>
    <div class="qm-combo">
      <input class="input qm-select" id="${id}" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-list" autocomplete="off" placeholder="Search Players">
      <ul class="qm-listbox" id="${id}-list" role="listbox" aria-label="Players" hidden></ul>
      <p class="sr-only" role="status"></p>
    </div>`;
  const input = el.querySelector("input"), list = el.querySelector("ul"), status = el.querySelector("[role=status]");
  let cells = [], active = -1, term = "", timer = 0, seq = 0;

  const show = () => {
    const open = term !== "";
    list.hidden = !open;
    input.setAttribute("aria-expanded", String(open));
    list.innerHTML = open ? playerListbox(cells, term, active, id) : "";
    input.setAttribute("aria-activedescendant", active >= 0 ? `${id}-${active}` : "");
    status.textContent = open ? (cells.length ? `${Math.min(cells.length, PLAYER_RESULTS)}${cells.length > PLAYER_RESULTS ? "+" : ""} Players found` : "No Players match") : "";
  };
  const close = () => { term = ""; cells = []; active = -1; clearTimeout(timer); seq++; show(); obj.abortListObjectSearch("/qListObjectDef").catch(() => {}); };
  const choose = (elem) => {
    obj.selectListObjectValues("/qListObjectDef", [Number(elem)], false);
    input.value = "";
    close();
  };
  const search = async () => {
    const mine = ++seq;
    await obj.searchListObjectFor("/qListObjectDef", `*${term}*`);
    const pages = await obj.getListObjectData("/qListObjectDef", [{ qTop: 0, qLeft: 0, qWidth: 1, qHeight: PLAYER_RESULTS + 1 }]);
    if (mine !== seq || gen !== generation) return;
    cells = (pages[0] && pages[0].qMatrix || []).map((r) => r[0]);
    active = cells.length ? 0 : -1;
    show();
  };
  input.addEventListener("input", () => {
    term = input.value.trim();
    clearTimeout(timer);
    if (!term) return close();
    timer = setTimeout(() => search().catch((error) => { if (!reconnect(error)) console.error("Qlik Player search failed", error); }), 150);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if (term) { e.preventDefault(); input.value = ""; close(); } return; }
    if (e.key === "Enter") { if (active >= 0 && cells[active]) { e.preventDefault(); choose(cells[active].qElemNumber); } return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) || !term || !cells.length) return;
    e.preventDefault();
    active = moveActive(active, e.key, Math.min(cells.length, PLAYER_RESULTS));
    show();
  });
  input.addEventListener("blur", () => setTimeout(() => { if (!el.contains(document.activeElement)) { input.value = ""; close(); } }, 120));
  // mousedown keeps focus in the input, so the list stays open long enough to click.
  list.addEventListener("mousedown", (e) => e.preventDefault());
  list.addEventListener("click", (e) => { const option = e.target.closest("[data-elem]"); if (option) choose(option.dataset.elem); });
  return obj;
}

// Selections carry across every subject in the tab, including ones without a filter for
// that field, so the active selection is always spelled out. hideWhenEmpty: the dashboard.
async function mountSelections(doc, bar, hideWhenEmpty, gen) {
  const obj = await doc.createSessionObject({ qInfo: { qType: "paddlepoint-selections" }, qSelectionObjectDef: {} });
  const draw = async () => {
    if (gen !== generation) return;
    const selections = (await obj.getLayout()).qSelectionObject.qSelections;
    bar.hidden = hideWhenEmpty && selections.length === 0;
    // The chips carry the detail; the summary is what assistive tech hears, and shows only when there are none.
    const summary = bar.querySelector(".qm-selections-summary");
    summary.textContent = selectionsSummary(selections);
    summary.classList.toggle("sr-only", selections.length > 0);
    bar.querySelector(".qm-selection-chips").innerHTML = selectionChips(selections);
  };
  obj.on("changed", draw);
  await draw();
  return obj;
}

async function release() {
  if (!current) return;
  const { objects } = current;
  current = null;
  const doc = await docPromise;
  if (doc) await Promise.all(objects.filter(Boolean).map((o) => doc.destroySessionObject(o.id).catch(() => {})));
}

// Undo / redo arrows and a circled cross, so each selection button says what it does at a glance.
const ACTION_ICONS = Object.fromEntries(Object.entries({
  back: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  forward: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  clear: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
}).map(([k, d]) => [k, `<svg class="qm-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`]));

async function build(id) {
  const gen = ++generation;
  const subject = SUBJECTS[id];
  await release();
  // A re-render during release() may have started a newer build; don't wipe what it drew.
  if (gen !== generation) return;
  current = { id, objects: [] };
  if (resizer) resizer.disconnect();
  root.innerHTML = `
    ${subject.filters ? '<div class="qm-filters"></div>' : ""}
    <div class="qm-selections-bar"${subject.filters ? "" : " hidden"}>
      <div class="qm-selections">
        <p class="qm-selections-summary" role="status"></p>
        <ul class="qm-selection-chips" aria-label="Active selections"></ul>
      </div>
      <div class="qm-actions">
        <button type="button" class="button ghost" data-qm="back" title="Undo your last filter change">${ACTION_ICONS.back}Undo</button>
        <button type="button" class="button ghost" data-qm="forward" title="Redo the filter change you just undid">${ACTION_ICONS.forward}Redo</button>
        <button type="button" class="button ghost" data-qm="clear" title="Remove all filters and show everything">${ACTION_ICONS.clear}Clear all</button>
      </div>
    </div>
    <div class="qm-grid"></div>`;
  const grid = root.querySelector(".qm-grid");
  try {
    const doc = await openDoc();
    if (gen !== generation) return;
    const filterEls = (subject.filters || []).map(() => root.querySelector(".qm-filters").appendChild(Object.assign(document.createElement("div"), { className: "qm-filter" })));
    const chartEls = subject.charts.map(() => grid.appendChild(document.createElement("section")));
    const objects = (await Promise.all([
      ...(subject.filters || []).map((f, i) => (f === D.eventId ? mountEventFilter : f === D.player ? mountPlayerFilter : f === D.matchDate ? mountDateFilter : mountFilter)(doc, f, filterEls[i], gen)),
      ...subject.charts.map((c, i) => mountChart(doc, c, chartEls[i], gen)),
      mountSelections(doc, root.querySelector(".qm-selections-bar"), !subject.filters, gen),
    ])).flat().filter(Boolean);
    if (gen !== generation) return objects.forEach((o) => doc.destroySessionObject(o.id).catch(() => {}));
    current.objects = objects;
  } catch (error) {
    if (gen !== generation || reconnect(error)) return;
    console.error("Qlik mashup failed", error);
    root.innerHTML = `<div class="qm-error" role="alert">
      <p><strong>Analytics are unavailable right now.</strong> ${esc(error.status === 403 ? "Staff access is required." : "Qlik Cloud could not be reached.")}</p>
      <button type="button" class="button primary" data-qm="retry">Retry</button>
      <a class="button ghost" href="https://${HOST}/sense/app/${APP_ID}" target="_blank" rel="noopener noreferrer">Open in Qlik Cloud</a></div>`;
  }
}

function onRootClick(e) {
  const action = e.target.closest("[data-qm]")?.dataset.qm;
  if (!action) return;
  if (action === "retry") { close(); build(root.dataset.subject); return; }
  if (action === "retry-chart") { e.target.closest(".qm-card").qmRetry(); return; }
  if (action === "page") { e.target.closest(".qm-card").qmPage(Number(e.target.closest("[data-page]").dataset.page)); return; }
  if (action === "tab") { selectTab(e.target.closest("[role=tab]")); return; }
  if (action === "remove-selection") {
    const field = e.target.closest("[data-field]").dataset.field;
    if (docPromise) docPromise.then((doc) => doc.getField(field)).then((f) => f.clear());
    return;
  }
  if (docPromise) docPromise.then((doc) => (action === "clear" ? doc.clearAll() : action === "back" ? doc.back() : doc.forward()));
}

// Arrow keys, Home and End move between tabs (WAI-ARIA tabs pattern).
function onRootKeydown(e) {
  const tab = e.target.closest("[role=tab]");
  const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
  if (!tab || (!step && e.key !== "Home" && e.key !== "End")) return;
  e.preventDefault();
  const tabs = [...tab.closest("[role=tablist]").querySelectorAll("[role=tab]")];
  const i = tabs.indexOf(tab);
  selectTab(tabs[e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + step + tabs.length) % tabs.length]);
}

// Called by app.js after every render.
export function attach(container) {
  const placeholder = container.querySelector("[data-qlik-mashup]");
  if (!placeholder) {
    if (current) { generation++; release(); }
    return;
  }
  const id = placeholder.dataset.qlikMashup;
  if (!SUBJECTS[id]) return;
  if (!root) {
    root = document.createElement("div");
    root.className = "qlik-mashup";
    root.addEventListener("click", onRootClick);
    root.addEventListener("keydown", onRootKeydown);
  }
  placeholder.replaceWith(root);
  if (root.dataset.subject !== id || !current) {
    root.dataset.subject = id;
    build(id);
  }
}

if (typeof window !== "undefined") {
  window.PaddlePointQlikMashup = { attach, close, SUBJECTS };
  window.addEventListener("pagehide", close);
  // Back/forward cache restores the page without a render, so rebuild what was on screen.
  window.addEventListener("pageshow", (e) => { if (e.persisted && root && root.isConnected) build(root.dataset.subject); });
  attach(document); // app.js may have rendered before this module loaded
}
