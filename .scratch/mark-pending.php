<?php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; } // a web request must never trigger a Qlik reload
require __DIR__ . '/../api/db.php'; require __DIR__ . '/../api/qlik/reload_trigger.php';
mark_qlik_reload_pending(pdo_connection());
echo fire_pending_qlik_reload(pdo_connection()) ? "Qlik reload triggered" : "not triggered";
