<?php
declare(strict_types=1);

require_once __DIR__ . '/accounts.php';
require_once __DIR__ . '/db.php';

handle_options();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    send_json(['ok' => false, 'error' => 'GET required'], 405);
}

$pdo = pdo_connection();
[$status, $payload] = read_user_counts($pdo, user_from_request($pdo));
send_json($payload, $status);