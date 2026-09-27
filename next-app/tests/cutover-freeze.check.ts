import { strict as assert } from "node:assert";
import { writeFrozen } from "../src/cutover-freeze";
import { NextRequest } from "next/server";
import { middleware } from "../src/middleware";

for (const method of ["POST", "PUT", "PATCH", "DELETE"]) assert.equal(writeFrozen(method, true), true);
for (const method of ["GET", "HEAD", "OPTIONS"]) assert.equal(writeFrozen(method, true), false);
assert.equal(writeFrozen("POST", false), false);
process.env.PP_WRITE_FREEZE = "1";
const blocked = middleware(new NextRequest("http://localhost/api/events", { method: "POST" }));
assert.equal(blocked.status, 503);
assert.equal((await blocked.json()).error, "Writes are temporarily paused for migration");
assert.equal(middleware(new NextRequest("http://localhost/api/live-board")).status, 200);
delete process.env.PP_WRITE_FREEZE;
console.log("Next.js cutover freeze checks passed");
