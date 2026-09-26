<?php
declare(strict_types=1);

require_once __DIR__ . '/players.php';

handle_options();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    send_json(['ok' => false, 'error' => 'POST required'], 405);
}

$raw = file_get_contents('php://input') ?: '';
$data = json_decode($raw, true);
if (!is_array($data)) {
    send_json(['ok' => false, 'error' => 'Invalid JSON body'], 400);
}

try {
    $pdo = pdo_connection();
    $playerId = (int)($data['id'] ?? 0);
    $skillLevel = array_key_exists('skillLevel', $data) && $data['skillLevel'] !== null
        ? (string)$data['skillLevel']
        : null;
    [$status, $payload] = set_player_skill($pdo, user_from_request($pdo), $playerId, $skillLevel);
} catch (Throwable $error) {
    send_server_error($error);
}

send_json($payload, $status);
