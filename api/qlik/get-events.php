<?php
declare(strict_types=1);

require_once __DIR__ . '/events.php';
require_once __DIR__ . '/../db.php';

handle_options();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    send_json(['ok' => false, 'error' => 'GET required'], 405);
}

try {
    [$status, $payload] = read_qlik_events(pdo_connection(), analytics_key_from_request(), $_GET);
} catch (Throwable $error) {
    send_server_error($error);
}

send_json($payload, $status);
