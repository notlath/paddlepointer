import assert from "node:assert/strict";
import { reloadWasSent } from "../src/server/qlik-reload";

assert.equal(reloadWasSent(202, false, true), true);
assert.equal(reloadWasSent(503, false, true), false);
assert.equal(reloadWasSent(0, false, false), false);
assert.equal(reloadWasSent(0, true, false), false);
assert.equal(reloadWasSent(0, true, true), true);
console.log("Qlik reload response contract passed");
