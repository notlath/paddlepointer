<?php
declare(strict_types=1);

require_once __DIR__ . '/games.php';

handle_options();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    send_json(['ok' => false, 'error' => 'GET required'], 405);
}

$id = isset($_GET['id']) ? trim((string)$_GET['id']) : '';
if ($id === '') {
    send_json(['ok' => false, 'error' => 'Game id required'], 400);
}

try {
    $pdo = pdo_connection();
    [$status, $payload] = read_game($pdo, user_from_request($pdo), $id);
} catch (Throwable $error) {
    send_server_error($error);
}

send_json($payload, $status);
