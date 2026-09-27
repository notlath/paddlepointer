<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/access_policy.php';

function send_json(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store, private, max-age=0, must-revalidate');
    header('Pragma: no-cache');
    header('Expires: 0');
    header('Vary: X-Session-Token');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Headers: Content-Type, X-Session-Token');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

// The exception's text can hold SQL, table names or file paths, so it goes to the server log only.
function send_server_error(Throwable $error): never
{
    error_log(sprintf('PaddlePoint %s: %s in %s:%d', $_SERVER['SCRIPT_NAME'] ?? 'cli', $error->getMessage(), $error->getFile(), $error->getLine()));
    send_json(['ok' => false, 'error' => 'Something went wrong on the server. Please try again.'], 500);
}

// Endpoints without their own try/catch still answer with JSON. The CLI (tests, cron) keeps PHP's default.
if (PHP_SAPI !== 'cli') {
    set_exception_handler('send_server_error');
}

function handle_options(): void
{
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        send_json(['ok' => true]);
    }
}

function pdo_connection(): PDO
{
    if (write_freeze_blocks($_SERVER['REQUEST_METHOD'] ?? 'GET')) {
        send_json(['ok' => false, 'error' => 'Writes are temporarily paused for migration'], 503);
    }
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ];
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', DB_HOST, DB_PORT, DB_NAME);
    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
    } catch (PDOException $error) {
        if ($error->getCode() !== 1049) { // anything but "unknown database"
            throw $error;
        }
        // First run on a fresh server: create the database, then connect to it.
        $server = new PDO(sprintf('mysql:host=%s;port=%d;charset=utf8mb4', DB_HOST, DB_PORT), DB_USER, DB_PASS, $options);
        $dbName = str_replace('`', '``', DB_NAME);
        $server->exec("CREATE DATABASE IF NOT EXISTS `$dbName` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
    }

    migrate($pdo);

    return $pdo;
}

function write_freeze_blocks(string $method): bool
{
    return getenv('PP_WRITE_FREEZE') === '1' && !in_array(strtoupper($method), ['GET', 'HEAD', 'OPTIONS'], true);
}

// The Event that scorers, the Scoreboard, the Tournament view and the Live Board use
// when none is specified. Stored in app_settings; seeded to 'open_play' by migration 008.
function current_event_id(PDO $pdo): string
{
    $value = $pdo->query("SELECT setting_value FROM app_settings WHERE setting_key = 'current_event_id'")->fetchColumn();
    return $value !== false && trim((string)$value) !== '' ? (string)$value : 'open_play';
}

// A Super Admin starting a new Event (api/tournaments.php's start_new_event) is the only writer.
function set_current_event_id(PDO $pdo, string $id): void
{
    $pdo->prepare(
        "INSERT INTO app_settings (setting_key, setting_value) VALUES ('current_event_id', :value)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)"
    )->execute([':value' => $id]);
}

function clean_username(string $value): string
{
    $value = strtolower(trim($value));
    $value = preg_replace('/[^a-z0-9._@+-]+/', '', $value) ?? '';
    return substr($value, 0, 128);
}

function clean_display_name(string $value): string
{
    $value = trim(preg_replace('/\s+/', ' ', $value) ?? '');
    return substr($value, 0, 120);
}

function public_user(array $user): array
{
    return [
        'id' => (int)$user['id'],
        'username' => (string)$user['username'],
        'displayName' => (string)$user['display_name'],
        'role' => (string)$user['role'],
        'isActive' => !empty($user['is_active']),
        'createdAt' => $user['created_at'] ?? null,
        'updatedAt' => $user['updated_at'] ?? null,
        'usingDefaultPassword' => is_super_admin($user) && ($user['password_hash'] ?? '') === DEFAULT_SUPER_ADMIN_PASSWORD_HASH,
    ];
}

// The X-Session-Token header only: a token in the URL would land in server and proxy logs.
function token_from_request(): string
{
    return trim((string)($_SERVER['HTTP_X_SESSION_TOKEN'] ?? ''));
}

function client_ip(): string
{
    $remote = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    if ($remote !== '127.0.0.1') return $remote;
    $forwarded = trim(explode(',', (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''))[0]);
    return filter_var($forwarded, FILTER_VALIDATE_IP) ? $forwarded : $remote;
}

function hit_rate_limit(PDO $pdo, string $bucket, int $max, int $windowSeconds): bool
{
    $statement = $pdo->prepare("INSERT INTO rate_limits (bucket, window_start, hits) VALUES (:bucket, NOW(), 1)
        ON DUPLICATE KEY UPDATE
            hits = IF(window_start < NOW() - INTERVAL :window1 SECOND, 1, hits + 1),
            window_start = IF(window_start < NOW() - INTERVAL :window2 SECOND, NOW(), window_start)");
    $statement->execute([':bucket' => $bucket, ':window1' => $windowSeconds, ':window2' => $windowSeconds]);
    $read = $pdo->prepare('SELECT hits FROM rate_limits WHERE bucket = :bucket');
    $read->execute([':bucket' => $bucket]);
    return (int)$read->fetchColumn() > $max;
}

function rate_limit_reached(PDO $pdo, string $bucket, int $max, int $windowSeconds): bool
{
    $statement = $pdo->prepare('SELECT hits FROM rate_limits WHERE bucket = :bucket AND window_start >= NOW() - INTERVAL :window SECOND');
    $statement->execute([':bucket' => $bucket, ':window' => $windowSeconds]);
    return (int)$statement->fetchColumn() >= $max;
}

function user_from_request(PDO $pdo): ?array
{
    $token = token_from_request();
    if ($token === '') {
        return null;
    }

    $statement = $pdo->prepare(
        "SELECT users.*, TIMESTAMPDIFF(SECOND, NOW(), user_sessions.expires_at) AS seconds_remaining
         FROM user_sessions
         INNER JOIN users ON users.id = user_sessions.user_id
         WHERE user_sessions.token_hash = :token_hash
           AND user_sessions.expires_at > NOW()
           AND users.is_active = 1
         LIMIT 1"
    );
    $statement->execute([':token_hash' => hash('sha256', $token)]);
    $user = $statement->fetch();
    if (getenv('PP_WRITE_FREEZE') !== '1' && $user && in_array($user['role'], ['admin', 'super_admin'], true) && (int)$user['seconds_remaining'] < 6 * 3600) {
        $extend = $pdo->prepare('UPDATE user_sessions SET expires_at = DATE_ADD(NOW(), INTERVAL 12 HOUR) WHERE token_hash = :token_hash');
        $extend->execute([':token_hash' => hash('sha256', $token)]);
    }
    return is_array($user) ? $user : null;
}

function parse_iso_datetime(?string $value): ?string
{
    if (!$value) {
        return null;
    }

    try {
        $date = new DateTimeImmutable($value);
        return $date->setTimezone(new DateTimeZone(date_default_timezone_get()))->format('Y-m-d H:i:s');
    } catch (Throwable $error) {
        return null;
    }
}

function duration_seconds(?string $start, ?string $end): int
{
    if (!$start || !$end) {
        return 0;
    }

    try {
        $startDate = new DateTimeImmutable($start);
        $endDate = new DateTimeImmutable($end);
        return max(0, $endDate->getTimestamp() - $startDate->getTimestamp());
    } catch (Throwable $error) {
        return 0;
    }
}
