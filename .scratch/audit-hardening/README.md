# Handoff: production-audit hardening (F5–F10)

A production-readiness audit of PaddlePoint on 2026-09-25 found 24 issues, numbered F1–F24. The code-only ones that needed no decision are already fixed and committed (`811d728`). This track holds the four the user then decided on, as five tickets. The user approved the recommended approach for each; the tickets spell that approach out, so you don't need the audit report (it was a temp file).

| Ticket | Finding | Blocked by |
|---|---|---|
| [01](issues/01-default-super-admin-password-reminder.md) | F5 · Default Super Admin credentials | none |
| [02](issues/02-rate-limits-and-body-cap.md) | F6 · Rate limits and request size | none |
| [03](issues/03-security-headers-and-shorter-staff-sessions.md) | F9 · CSP, security headers, shorter staff sessions | none |
| [04](issues/04-a-finished-game-is-final.md) | F10 · A finished Game can't be rewritten | none |
| [05](issues/05-one-scoring-device-per-match.md) | F10 · One scoring device per Tournament Match | none |

All five are independent. Only 02 needs a schema migration, and it takes `012`; if another one lands first, use the next free number.

## Read first

- `CONTEXT.md`: domain terms (Match, Tournament Match, Scoreboard, Live Board, Event, Visitor…). Use them in code, tests and messages.
- `docs/adr/`: decisions not to re-open. Especially: 0002 (every Event is kept), 0005 (Players are separate from accounts), 0006 (**proposed and parked**: Visitors stay passwordless for now; do not build email verification).
- `CLAUDE.md`: surgical changes, test-first, run `graphify update .` after code changes.

## What is already done (commit 811d728), so you don't redo it

- `save_game` (`api/games.php`): only the account that first saved a Game can save it again, otherwise 409. Type, scores and side-outs are stored as plain values.
- History and the Match summary escape the stored type, scores and side-outs; History omits `createdBy.username`.
- `api/config.php`: DB login from `PP_DB_HOST/NAME/USER/PASS`. `ANALYTICS_KEY` comes only from the environment and fails closed.
- `send_server_error()` in `api/db.php` handles every 500: logs the detail, returns a generic message. A web-only `set_exception_handler` covers endpoints without try/catch.
- Sessions: the token is read only from `$_SERVER['HTTP_X_SESSION_TOKEN']`. `create_session` purges expired rows. `update_account` ends an account's sessions when its password hash changes.
- `network-info.php` hides LAN IPs from internet callers; the Live Board skips polling in hidden tabs.

## Codebase shape

- `api/*.php` are endpoint files; the logic lives in handler functions with the interface `(PDO $pdo, ?array $currentUser, array $data) → [int $status, array $payload]`, e.g. `save_game()` in `api/games.php` and `update_tournament_match()` in `api/tournaments.php`. Endpoints call `pdo_connection()`, `user_from_request()`, the handler, then `send_json()`.
- `api/access_policy.php` `can($user, $action)` is the only place roles are compared.
- `api/schema.php` `migrate()` runs on each request's first DB connection. Append migrations; never edit shipped ones; each must be safe to re-run.
- Browser: `app.js` (large; one `render()` builds HTML strings, always through `escapeHtml`/`escapeAttr`), `session.js` (sign-in, per-portal storage, headers), `shared-store.js` (server round-trips), `rally-engine.js`, `tournament-match.js`.

## Running the tests (Windows, this machine)

- Use the **PowerShell** tool; PHP is Laravel Herd's `php.bat`, which Git Bash can't run.
- MySQL runs in DBngin on port 3306. If a connection is refused, ask the user to start DBngin; don't install a server.
- Whole suite: `$env:PP_TEST_DB_PORT = '3306'; .\run-tests.ps1`. It was all green at 811d728: 486 node tests and 25 PHP suites.
- One suite: `php tests/<name>_test.php` or `node --test tests/<name>.test.js`.
- PHP tests: `tests/test_db.php` `run_db_tests([...])` gives each test a fresh database; assertions use `expect_same(expected, actual, message)`. To act as a signed-in request in a test, set `$_SERVER['HTTP_X_SESSION_TOKEN']`.
- Node tests often check `app.js` source with regexes (see `tests/stored-game-escaping.test.js`).
- Writing a PHP file from PowerShell: use UTF-8 **without BOM** (`[IO.File]::WriteAllText(path, text, (New-Object Text.UTF8Encoding($false)))`), or `declare(strict_types=1)` fails.
- In PowerShell 5.1, JSON bodies passed to `curl.exe -d` lose their quotes; write the body to a file and use `--data-binary @file`.
- Local site: `https://paddlepoint.test` (Herd, nginx, so `.htaccess` is ignored locally). For signed-in UI checks without a login, use `plans/tools/preview-harness.js` (instructions at its top) with the `paddlepoint` launch config (`php -S 127.0.0.1:8000`).

## Working-tree warning

The user has uncommitted work of their own: the `players-table` class hunk in `app.js`, plus `styles.css`, `tests/players-table-actions.test.js` and `assets/paddlepoint-logo-w-2.webp`. Don't revert, reformat or commit it. When you commit `app.js`, stage only your own hunks: build a patch without theirs and use `git apply --cached --unidiff-zero`, since interactive `git add -p` isn't available.

## Commits

Plain-sentence subject in the imperative, e.g. "Close the security gaps the production audit found in code". Write the message to a file and use `git commit -F <file>`. End it with the co-author trailer the session gives you. One commit per ticket. Commit only when the user asks.

## Still open after this track (not in scope)

F11 (Leaderboard and Qlik feeds read every Game's full JSON), F14 (endpoint boilerplate → one Endpoint module), F15 (CORS `*`), F16 (audit log for Super Admin corrections), F17 (Rename/Merge lock every Tournament row), F18 (`app.js` size, dead `styles-old.css`), F21 (migrations inside requests; kept by design), F22 (no CI, monitoring or backups), F23 (Qlik token not cached). Human deploy steps are in `.scratch/fresh-leaderboard-and-production/issues/08-deploy-to-production.md`.
