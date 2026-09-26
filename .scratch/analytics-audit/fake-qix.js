// Stand-in for @qlik/api's qix.js: every hypercube gets sample rows, so the real mashup renders offline.
let n = 0;
const DATE0 = 46266; // 2026-09-01
const title = (d) => (d.qDef && (d.qDef.qLabel || (d.qDef.qFieldLabels || [])[0])) || { pTjNHW: "Win %", PwUrBz: "Match Date", QALqASy: "Player", DMjJQ: "Matches", WwVAxj: "Wins", jwLsQpW: "Avg Duration" }[d.qLibraryId] || d.qLibraryId || "Value";
const names = ["Alexandria Montgomery-Reyes", "Ben Lim", "Carla dela Cruz", "Dan Ong", "Eli Santos", "Faye Tan", "Gio Ramos", "Hana Uy"];

function cube(def) {
  const dims = def.qDimensions, meas = def.qMeasures;
  const rows = Array.from({ length: def.qInitialDataFetch[0].qHeight >= 10 ? 14 : 8 }, (_, i) => [
    ...dims.map((d, j) => d.qLibraryId === "PwUrBz"
      ? { qText: new Date(Date.UTC(1899, 11, 30) + (DATE0 + i * (i % 3 ? 1 : 3)) * 864e5).toISOString().slice(0, 10), qNum: DATE0 + i * (i % 3 ? 1 : 3), qElemNumber: i, qState: "O" }
      : { qText: j === 0 && d.qLibraryId === "QALqASy" ? names[i % names.length] : `${title(d)} ${i + 1}`, qNum: NaN, qElemNumber: i, qState: "O" }),
    ...meas.map((m) => {
      const pct = m.qLibraryId === "pTjNHW";
      const v = pct ? ((i * 37) % 100) / 100 : ((i * 7) % 11) + 1;
      return { qText: pct ? `${Math.round(v * 100)}%` : String(v), qNum: v };
    }),
  ]);
  return {
    qDimensionInfo: dims.map((d) => ({ qFallbackTitle: title(d) })), qMeasureInfo: meas.map((m) => ({ qFallbackTitle: title(m) })),
    qSize: { qcx: dims.length + meas.length, qcy: rows.length }, qDataPages: [{ qMatrix: rows }],
  };
}

function object(props) {
  const layout = props.qHyperCubeDef ? { qHyperCube: cube(props.qHyperCubeDef) }
    : props.qListObjectDef ? { qListObject: { qDimensionInfo: { qFallbackTitle: "Filter" }, qDataPages: [{ qMatrix: [] }] } }
    : { qSelectionObject: { qSelections: [] } };
  return { id: `o${++n}`, on() {}, getLayout: async () => layout, getHyperCubeData: async () => layout.qHyperCube.qDataPages,
    selectListObjectValues: async () => {}, clearSelections: async () => {}, searchListObjectFor: async () => {}, getListObjectData: async () => [], abortListObjectSearch: async () => {} };
}

const doc = { on() {}, createSessionObject: async (p) => object(p), destroySessionObject: async () => {}, clearAll() {}, back() {}, forward() {}, getField: async () => ({ clear() {} }) };
export const openAppSession = () => ({ getDoc: async () => doc, close: async () => {} });
