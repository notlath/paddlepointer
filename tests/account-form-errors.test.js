const test = require("node:test");
const assert = require("node:assert/strict");

const { newUserErrors, profileErrors } = require("../session.js");

test("account creation requires a valid username format of at least 3 characters", () => {
  assert.deepEqual(newUserErrors({ username: "" }), { username: "Enter a username" });
  assert.deepEqual(newUserErrors({ username: "  " }), { username: "Enter a username" });
  assert.deepEqual(newUserErrors({ username: "ab" }), { username: "Username must be at least 3 characters" });
  assert.deepEqual(newUserErrors({ username: "  ab  " }), { username: "Username must be at least 3 characters" });
  assert.deepEqual(newUserErrors({ username: "?? " }), {
    username: "Username can only contain letters, numbers, and . _ @ + -",
  });
  assert.deepEqual(newUserErrors({ username: "john doe" }), {
    username: "Username can only contain letters, numbers, and . _ @ + -",
  });
  assert.deepEqual(newUserErrors({ username: "pedro", role: "player" }), {});
});

test("creating an Admin requires a password of at least 6 characters, reported in field order", () => {
  assert.deepEqual(newUserErrors({ username: "", password: "", role: "admin" }), {
    username: "Enter a username",
    password: "Enter a password",
  });
  assert.deepEqual(Object.keys(newUserErrors({ username: "", password: "", role: "admin" })), ["username", "password"]);
  assert.deepEqual(newUserErrors({ username: "court_admin", password: "", role: "admin" }), {
    password: "Enter a password",
  });
  assert.deepEqual(newUserErrors({ username: "court_admin", password: "123", role: "admin" }), {
    password: "Password must be at least 6 characters",
  });
  assert.deepEqual(newUserErrors({ username: "court_admin", password: "secret", role: "admin" }), {});
});

test("creating a Player requires no password even if one is passed", () => {
  assert.deepEqual(newUserErrors({ username: "pedro", password: "", role: "player" }), {});
  assert.deepEqual(newUserErrors({ username: "pedro", password: "123", role: "player" }), {});
});

test("profile editing requires a display name", () => {
  assert.deepEqual(profileErrors({ displayName: "" }), { displayName: "Enter a display name" });
  assert.deepEqual(profileErrors({ displayName: "   " }), { displayName: "Enter a display name" });
  assert.deepEqual(profileErrors({ displayName: "Coach AC" }), {});
});

test("profile password change requires at least 6 characters, or blank to keep current", () => {
  assert.deepEqual(profileErrors({ displayName: "Coach AC", password: "" }), {});
  assert.deepEqual(profileErrors({ displayName: "Coach AC", password: "123" }), {
    password: "Password must be at least 6 characters",
  });
  assert.deepEqual(profileErrors({ displayName: "Coach AC", password: "changed1" }), {});
});

test("profile reports errors in DOM field order", () => {
  assert.deepEqual(profileErrors({ displayName: "", password: "123" }), {
    displayName: "Enter a display name",
    password: "Password must be at least 6 characters",
  });
  assert.deepEqual(Object.keys(profileErrors({ displayName: "", password: "123" })), ["displayName", "password"]);
});

test("profile refuses a password if the user cannot have one", () => {
  assert.deepEqual(profileErrors({ displayName: "Pedro", password: "secret" }, { canHavePassword: false }), {
    password: "Players and Visitors don't use a password",
  });
  assert.deepEqual(profileErrors({ displayName: "Pedro", password: "" }, { canHavePassword: false }), {});
});
