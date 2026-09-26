const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");

test("leaderboards disclose scrollable statistics without losing rank or identity", () => {
  assert.match(appCode, /leaderboard-scroll-hint/, "mobile users receive a visible scroll cue");
  assert.match(appCode, /role="region"[^>]*aria-describedby/, "the scrollable table is named and described for assistive technology");
  assert.match(appCode, /<th[^>]*scope="row"[^>]*class="leaderboard-identity"/, "identity is the row header");
  assert.match(appCode, /Positive differential|Negative differential/, "differentials remain meaningful without color");
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*?\.leaderboard-table[^}]*min-width:[^}]*[\s\S]*?position: sticky/, "phone layouts keep the table compact while pinning its leading columns");
  assert.match(styles, /\.leaderboard-table \{\s*width: 100%;\s*min-width: 720px;/, "desktop table density remains unchanged");
});
