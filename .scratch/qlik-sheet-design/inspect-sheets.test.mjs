// usage: node inspect-sheets.test.mjs
import assert from "node:assert/strict";
import { classify } from "./inspect-sheets.mjs";

assert.equal(classify({ visualization: undefined, layoutError: null }), "no-visualization");
assert.equal(classify({ visualization: "barchart", layoutError: "GetLayout: boom" }), "engine-error");
assert.equal(classify({ visualization: "barchart", layoutError: null }), "engine-ok");
// a missing visualization outranks a layout error: it is the cause, not a second finding
assert.equal(classify({ visualization: undefined, layoutError: "GetLayout: boom" }), "no-visualization");

console.log("ok");
