<?php
declare(strict_types=1);

require_once __DIR__ . '/players.php';

handle_options();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    send_json(['ok' => false, 'error' => 'GET required'], 405);
}

$pdo = pdo_connection();
[$status, $payload] = list_players($pdo, user_from_request($pdo));
send_json($payload, $status);
