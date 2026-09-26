<?php
declare(strict_types=1);

require_once __DIR__ . '/tournaments.php';
require_once __DIR__ . '/qlik/reload_trigger.php';

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
    [$status, $payload] = correct_tournament_match($pdo, user_from_request($pdo), $data);
} catch (Throwable $error) {
    send_server_error($error);
}

reload_qlik_after_response($status);
send_json($payload, $status);
