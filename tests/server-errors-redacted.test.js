const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// A 500's exception text can hold SQL, table names or file paths; it goes to the server log, never
// to the browser. Rule messages (400/409, e.g. "Court 2 is already playing a Match") are meant for users.
const apiDir = path.join(__dirname, "../api");
const phpFiles = fs.readdirSync(apiDir, { recursive: true }).filter((file) => file.endsWith(".php"));

test("No endpoint sends an exception's message with a 500", () => {
  for (const file of phpFiles) {
    const source = fs.readFileSync(path.join(apiDir, file), "utf8");
    assert.doesNotMatch(source, /getMessage\(\)\]\s*,\s*500\)/, `${file} sends raw exception text with a 500`);
  }
});

test("Uncaught exceptions in web requests are logged and answered with a generic 500", () => {
  const db = fs.readFileSync(path.join(apiDir, "db.php"), "utf8");
  assert.match(db, /set_exception_handler\('send_server_error'\)/);
});
