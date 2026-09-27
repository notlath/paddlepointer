<?php
declare(strict_types=1);

require_once __DIR__ . '/../api/db.php';
putenv('PP_WRITE_FREEZE=1');
foreach (['POST', 'PUT', 'PATCH', 'DELETE'] as $method) {
    if (!write_freeze_blocks($method)) throw new RuntimeException("$method was not blocked");
}
foreach (['GET', 'HEAD', 'OPTIONS'] as $method) {
    if (write_freeze_blocks($method)) throw new RuntimeException("$method was blocked");
}
putenv('PP_WRITE_FREEZE=0');
if (write_freeze_blocks('POST')) throw new RuntimeException('Writes remained blocked after unfreeze');
echo "PASS cutover write freeze\n";
