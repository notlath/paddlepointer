<?php
declare(strict_types=1);

require_once __DIR__ . '/games.php';

handle_options();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    send_json(['ok' => false, 'error' => 'GET required'], 405);
}

try {
    $pdo = pdo_connection();
    [$status, $payload] = read_leaderboard($pdo, user_from_request($pdo), $_GET);
} catch (Throwable $error) {
    send_server_error($error);
}

send_json($payload, $status);
