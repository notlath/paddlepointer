const test = require("node:test");
const assert = require("node:assert/strict");

const { signInErrors } = require("../session.js");

test("an Admin needs a username and a password, reported in field order", () => {
  assert.deepEqual(signInErrors("admin", { username: " ", password: "" }), {
    username: "Enter your username",
    password: "Enter your password",
  });
  assert.deepEqual(Object.keys(signInErrors("admin", { username: "", password: "" })), ["username", "password"]);
  assert.deepEqual(signInErrors("admin", { username: "court_admin", password: "" }), { password: "Enter your password" });
  assert.deepEqual(signInErrors("admin", { username: "court_admin", password: "secret" }), {});
});

test("a Player needs only a username", () => {
  assert.deepEqual(signInErrors("player", { username: "", password: "" }), { username: "Enter your username" });
  assert.deepEqual(signInErrors("player", { username: "pedro", password: "" }), {});
});

test("a Visitor needs a valid email and no password", () => {
  assert.deepEqual(signInErrors("visitor", { username: "" }), { username: "Enter your email" });
  assert.deepEqual(signInErrors("visitor", { username: "guest@example" }), {
    username: "Enter a valid email address, like you@example.com",
  });
  assert.deepEqual(signInErrors("visitor", { username: " guest@example.com " }), {});
});
