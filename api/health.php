<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

handle_options();

try {
    pdo_connection();
    send_json(['ok' => true, 'database' => DB_NAME]);
} catch (Throwable $error) {
    send_server_error($error);
}

