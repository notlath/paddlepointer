const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Visible interface copy uses the canonical terms in CONTEXT.md. Code identifiers, stored
// data, API fields, URLs, and data-action values keep their existing names (`game`, `start-game`).

const repoRoot = path.join(__dirname, "..");
const uiModules = fs.readdirSync(repoRoot).filter((file) => file.endsWith(".js"));
const read = (file) => fs.readFileSync(path.join(repoRoot, file), "utf8");

// Text a user can see from JS string and template literals: comments are skipped, ${...}
// expressions are scanned as code, and never-shown HTML attributes are dropped.
function visibleTexts(source) {
  const out = [];
  let i = 0;
  const lineAt = (pos) => source.slice(0, pos).split("\n").length;

  function readQuoted(quote) {
    const start = i;
    i += 1;
    let text = "";
    while (i < source.length && source[i] !== quote && source[i] !== "\n") {
      if (source[i] === "\\") {
        text += source[i + 1];
        i += 2;
        continue;
      }
      text += source[i];
      i += 1;
    }
    i += 1;
    out.push({ line: lineAt(start), text });
  }

  function readTemplate() {
    const start = i;
    i += 1;
    let text = "";
    while (i < source.length && source[i] !== "`") {
      if (source[i] === "\\") {
        text += source[i + 1];
        i += 2;
        continue;
      }
      if (source[i] === "$" && source[i + 1] === "{") {
        i += 2;
        let depth = 1;
        while (i < source.length && depth > 0) {
          const c = source[i];
          if (c === '"' || c === "'") {
            readQuoted(c);
            continue;
          }
          if (c === "`") {
            readTemplate();
            continue;
          }
          if (c === "{") depth += 1;
          if (c === "}") depth -= 1;
          i += 1;
        }
        text += " ";
        continue;
      }
      text += source[i];
      i += 1;
    }
    i += 1;
    out.push({ line: lineAt(start), text });
  }

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      i = end < 0 ? source.length : end;
    } else if (ch === "/" && next === "*") {
      i = source.indexOf("*/", i + 2) + 2;
    } else if (ch === '"' || ch === "'") {
      readQuoted(ch);
    } else if (ch === "`") {
      readTemplate();
    } else {
      i += 1;
    }
  }
  return out;
}

const hiddenAttributes = /\s(class|id|data-[\w-]+|href|src|aria-controls|aria-labelledby|aria-describedby|name|type|role|for|headers|tabindex|rel|viewBox|d|fill|stroke|focusable|xmlns)="[^"]*"/g;

function visibleCopy(file) {
  return visibleTexts(read(file))
    .map(({ line, text }) => ({ line, text: text.replace(hiddenAttributes, " ") }))
    .filter(({ text }) => {
      const trimmed = text.trim();
      if (/^[a-z0-9_.:-]+$/.test(trimmed)) return false; // identifier-like literal such as "start-game"
      if (/^\/[\w./-]*\.php/.test(trimmed) || /\.php\b/.test(trimmed)) return false; // API paths
      return true;
    });
}

function visibleCopyOffenders(matchesVisibleText) {
  return uiModules.flatMap((file) =>
    visibleCopy(file)
      .filter(({ text }) => matchesVisibleText(text))
      .map(({ line, text }) => `${file}:${line}: ${text.replace(/\s+/g, " ").trim().slice(0, 120)}`)
  );
}

test("visible copy calls a scored contest a Match, never a Game", () => {
  const offenders = visibleCopyOffenders((text) => /\bgames?\b/i.test(text));
  assert.deepEqual(offenders, []);
});

test("visible copy uses plain separators", () => {
  const offenders = visibleCopyOffenders((text) => /[—–•]/.test(text));
  assert.deepEqual(offenders, []);
});

test("Start Match, Match started, Resume Match, End Match, and Match saved form the action and feedback progression", () => {
  const copy = uiModules.flatMap((file) => visibleCopy(file).map(({ text }) => text)).join("\n");
  for (const label of ["Start Match", "Match started", "Resume Match", "End Match", "Match saved"]) {
    assert.ok(copy.includes(label), `visible copy must include "${label}"`);
  }
  for (const retired of ["Resume Active Match", "Match Started", ">End<"]) {
    assert.ok(!copy.includes(retired), `"${retired}" must use the canonical progression label`);
  }
});

test("Open Play names the Tournament format, not the Tournament itself", () => {
  const copy = uiModules.flatMap((file) => visibleCopy(file).map(({ text }) => text)).join("\n");
  for (const eventUse of ["Set up Open Play", "Generate Open Play", "Open play tournament", "No open play schedule", "Reset the open play tournament", ">Open Play</button>", "<h2>Open Play</h2>"]) {
    assert.ok(!copy.includes(eventUse), `"${eventUse}" uses Open Play as the event name`);
  }
  assert.match(copy, /Open Play format/, "the Tournament workspace names Open Play as its format");
});

test("CONTEXT.md makes Match the canonical term and gives each workspace term one meaning", () => {
  const context = read("CONTEXT.md");
  for (const term of ["Match", "Tournament", "Open Play", "Schedule", "Round", "Tournament Match", "Live Board", "Scoreboard"]) {
    assert.match(context, new RegExp(`^\\*\\*${term}\\*\\*:`, "m"), `CONTEXT.md defines ${term}`);
  }
  assert.doesNotMatch(context, /^\*\*Game\*\*:/m, "Game is no longer a canonical term");
});
