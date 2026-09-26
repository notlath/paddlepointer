// usage: node check-object-health.test.mjs
import assert from "node:assert/strict";
import { assess, propertyPaths, exitCodeFor, HEALTHY_PATHS, GATED } from "./check-object-health.mjs";

// The real numbers from ticket 09: a healthy barchart is 88 paths, a starved one 18.
assert.equal(assess({ paths: 18, reference: 88 }), "starved");
assert.equal(assess({ paths: 88, reference: 88 }), "healthy");
// A rebuilt object that differs by ordinary configuration is not starvation.
assert.equal(assess({ paths: 80, reference: 88 }), "healthy");
// Exactly half is the boundary and counts as healthy, so the gate never fails on a tie.
assert.equal(assess({ paths: 44, reference: 88 }), "healthy");
assert.equal(assess({ paths: 43, reference: 88 }), "starved");
// scatterplot has no healthy example in the app yet — say so rather than guess.
assert.equal(assess({ paths: 18, reference: null }), "unknown-no-reference");

assert.deepEqual(propertyPaths({ color: { auto: true }, title: "x" }), ["color.auto", "title"]);
assert.deepEqual(propertyPaths({ qDims: [1, 2] }), ["qDims"], "arrays are leaves, not walked");
assert.deepEqual(propertyPaths({}), []);

// The pins are the gate's whole baseline; a missing one silently downgrades a type to UNKNOWN.
assert.equal(HEALTHY_PATHS.barchart, 88);
assert.equal(HEALTHY_PATHS.linechart, 96);
assert.equal(HEALTHY_PATHS.table, 48);
assert.equal(HEALTHY_PATHS["sn-table"], 57, "Leaderboard is built from sn-table; leaving it ungated makes ticket 06's gate vacuous");
assert.equal(HEALTHY_PATHS.scatterplot, undefined, "no healthy scatterplot exists yet — it must report UNKNOWN, not a guess");
// kpi and filterpane vary legitimately and must stay out of the gate.
for (const t of ["kpi", "filterpane", "text-image"]) assert.equal(GATED.has(t), false, t);
for (const t of ["barchart", "linechart", "table", "sn-table", "scatterplot"]) assert.equal(GATED.has(t), true, t);

assert.equal(exitCodeFor({ starved: 0, unknown: 0 }), 0);
assert.equal(exitCodeFor({ starved: 1, unknown: 0 }), 1);
// The case the gate existed to catch: nothing starved, but an object nobody could judge.
assert.equal(exitCodeFor({ starved: 0, unknown: 1 }), 1);

console.log("ok");
