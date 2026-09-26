<?php
declare(strict_types=1);

// Seeds the throwaway load-test database: one Super Admin session and 8 in-progress Tournament Matches.
// Run with PP_DB_NAME set (e.g. paddlepoint_loadtest). Prints the session token for run.mjs.

if (PHP_SAPI !== 'cli' || !getenv('PP_DB_NAME')) {
    fwrite(STDERR, "Run from the CLI with PP_DB_NAME set to a throwaway database\n");
    exit(1);
}

require_once __DIR__ . '/../../api/sign_in.php';
require_once __DIR__ . '/../../api/tournaments.php';

$pdo = pdo_connection();
// The migration seeds a Super Admin into every fresh database; mint a session for it directly.
$user = find_user_by_username($pdo, 'superadmin_ac');

$courts = 8;
$matches = [];
for ($court = 1; $court <= $courts; $court++) {
    $matches[] = ['id' => "lt_m$court", 'court' => $court, 'round' => 1, 'status' => 'in_progress',
        'activeGameId' => "lt_game_$court", 'scoreA' => '0', 'scoreB' => '0'];
}
$eventId = current_event_id($pdo);
[$status, $payload] = save_tournament($pdo, $user, ['intent' => 'schedule-update', 'tournament' => [
    'id' => $eventId, 'name' => 'Load Test', 'courts' => $courts, 'matches' => $matches,
]]);
if ($status !== 200) {
    fwrite(STDERR, "Seeding failed: " . json_encode($payload) . "\n");
    exit(1);
}

echo json_encode(['token' => create_session($pdo, (int)$user['id']), 'eventId' => $eventId, 'courts' => $courts]), "\n";
