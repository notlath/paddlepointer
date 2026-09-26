<?php
declare(strict_types=1);

require_once __DIR__ . '/games.php';
require_once __DIR__ . '/qlik/reload_trigger.php';

handle_options();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    send_json(['ok' => false, 'error' => 'POST required'], 405);
}

const MAX_GAME_BODY_BYTES = 512 * 1024;
const GAME_SAVES_PER_MINUTE = 30;
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > MAX_GAME_BODY_BYTES) {
    send_json(['ok' => false, 'error' => 'Match payload is too large'], 413);
}

$raw = file_get_contents('php://input', false, null, 0, MAX_GAME_BODY_BYTES + 1) ?: '';
if (strlen($raw) > MAX_GAME_BODY_BYTES) {
    send_json(['ok' => false, 'error' => 'Match payload is too large'], 413);
}
$data = json_decode($raw, true);
if (!is_array($data)) {
    send_json(['ok' => false, 'error' => 'Invalid JSON body'], 400);
}

try {
    $pdo = pdo_connection();
    $user = user_from_request($pdo);
    if ($user && can($user, 'save_game') && hit_rate_limit($pdo, 'save-game:' . $user['id'], GAME_SAVES_PER_MINUTE, 60)) {
        header('Retry-After: 60');
        send_json(['ok' => false, 'error' => 'Too many saves. Try again in a minute.'], 429);
    }
    [$status, $payload] = save_game($pdo, $user, $data);
} catch (Throwable $error) {
    send_server_error($error);
}

reload_qlik_after_response($status);
send_json($payload, $status);
