<?php
declare(strict_types=1);

// Qlik M2M impersonation OAuth client (ticket 11: embed test).
// Never commit real values here — production sets these via environment variables.
const QLIK_TENANT_URL = 'https://mtcmarketing.sg.qlikcloud.com';
const QLIK_M2M_CLIENT_ID = '';
const QLIK_M2M_CLIENT_SECRET = '';
const QLIK_EVENT_VIEWER_SUBJECT = '';

// Local secrets live in the gitignored .env. A real environment variable always wins.
function load_dotenv(string $path): void
{
    if (!is_readable($path)) {
        return;
    }
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
            continue;
        }
        [$name, $value] = array_map('trim', explode('=', $line, 2));
        if (getenv($name) === false) {
            putenv($name . '=' . trim($value, "\"'"));
        }
    }
}

load_dotenv(__DIR__ . '/../.env');

// The defaults suit local development. Production sets every PP_DB_* value in its .env, with a
// MySQL user limited to the app's database, never root. PP_DB_PORT / PP_DB_NAME also point the
// app at a throwaway database, e.g. for a load test.
define('DB_HOST', getenv('PP_DB_HOST') ?: '127.0.0.1');
define('DB_PORT', (int)(getenv('PP_DB_PORT') ?: 3306));
define('DB_NAME', getenv('PP_DB_NAME') ?: 'ac_pickle_score_new_app');
define('DB_USER', getenv('PP_DB_USER') ?: 'root');
define('DB_PASS', getenv('PP_DB_PASS') ?: '');
