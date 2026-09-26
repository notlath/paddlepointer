<?php
declare(strict_types=1);

// Fires the Qlik reload once if a write has marked one pending. Run every minute by cron:
//   * * * * * php /path/to/api/qlik/run-pending-reload.php
// CLI only; the web server answers 404.

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/reload_trigger.php';

echo fire_pending_qlik_reload(pdo_connection()) ? "Qlik reload triggered\n" : "No reload pending\n";
