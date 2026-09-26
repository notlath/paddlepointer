<?php
declare(strict_types=1);

// Past Events are protected from destructive actions:
//   php tests/past_events_protected_test.php
// Database setup: see tests/test_db.php.

require_once __DIR__ . '/test_db.php';
require_once __DIR__ . '/../api/tournaments.php';
require_once __DIR__ . '/../api/games.php';

function user_with_role(string $role): array
{
    return ['id' => 1, 'username' => "{$role}_user", 'display_name' => ucfirst($role), 'role' => $role, 'is_active' => 1];
}

// Sets up a past event ('open_play') with finished and scheduled matches, then starts a new event ('fall_classic') which becomes current.
function setup_past_and_current_events(PDO $pdo): array
{
    migrate($pdo);
    $superAdmin = user_with_role('super_admin');

    // 1. Seed open_play with 2 matches (one completed, one scheduled)
    save_tournament($pdo, $superAdmin, ['intent' => 'schedule-update', 'tournament' => [
        'id' => 'open_play', 'name' => 'Open Play', 'courts' => 2, 'matches' => [
            ['id' => 'm1', 'status' => 'completed', 'scoreA' => '11', 'scoreB' => '4', 'winner' => 'A'],
            ['id' => 'm2', 'status' => 'scheduled'],
        ],
    ]]);

    // Also record a game for open_play
    save_game($pdo, $superAdmin, ['game' => [
        'id' => 'g_open_1',
        'status' => 'completed',
        'type' => 'doubles',
        'teamA' => ['name' => 'Team A', 'players' => ['Alice', 'Bob'], 'score' => 11],
        'teamB' => ['name' => 'Team B', 'players' => ['Charlie', 'Dave'], 'score' => 4],
        'winner' => 'A',
        'tournamentMatch' => ['tournamentId' => 'open_play', 'matchId' => 'm1'],
    ]]);

    // 2. Start new event via ticket 17 flow
    [, $newEvent] = start_new_event($pdo, $superAdmin, ['name' => 'Fall Classic', 'courts' => 3]);
    $currentId = $newEvent['id'];

    return [$superAdmin, 'open_play', $currentId];
}

function test_regenerate_schedule_on_past_event_is_refused(PDO $pdo): void
{
    [$superAdmin, $pastId, $currentId] = setup_past_and_current_events($pdo);
    expect_same($currentId, current_event_id($pdo), 'Fall Classic is the Current Event');

    // Attempt to regenerate schedule on open_play
    [$status, $payload] = save_tournament($pdo, $superAdmin, [
        'intent' => 'schedule-update',
        'tournament' => [
            'id' => $pastId,
            'name' => 'Open Play Wiped',
            'courts' => 4,
            'matches' => [
                ['id' => 'new_m1', 'status' => 'scheduled'],
            ],
        ],
    ]);

    expect_same(400, $status, 'Regenerating schedule on a past Event is refused with 400');
    expect_same(false, $payload['ok'] ?? null, 'Reply reports ok: false');
    expect_same(true, str_contains($payload['error'] ?? '', 'Past events are protected'), 'Error clearly explains past events are protected');

    // Verify open_play data in MySQL is unchanged
    [, $readPast] = read_tournament($pdo, ['id' => $pastId]);
    expect_same('Open Play', $readPast['tournament']['name'], 'Past Event name is unchanged');
    expect_same(2, count($readPast['tournament']['matches']), 'Past Event matches count is unchanged');
    expect_same('completed', $readPast['tournament']['matches'][0]['status'], 'Past Event completed match is untouched');
}

function test_reset_tournament_on_past_event_is_refused(PDO $pdo): void
{
    [$superAdmin, $pastId, $currentId] = setup_past_and_current_events($pdo);
    expect_same($currentId, current_event_id($pdo), 'Fall Classic is the Current Event');

    // Attempt to reset open_play
    [$status, $payload] = save_tournament($pdo, $superAdmin, [
        'intent' => 'reset',
        'tournament' => [
            'id' => $pastId,
            'name' => 'Open Play Reset',
            'courts' => 2,
            'matches' => [],
        ],
    ]);

    expect_same(400, $status, 'Resetting a past Event is refused with 400');
    expect_same(false, $payload['ok'] ?? null, 'Reply reports ok: false');
    expect_same(true, str_contains($payload['error'] ?? '', 'Past events are protected'), 'Error clearly explains past events are protected');

    // Verify open_play data in MySQL is unchanged
    [, $readPast] = read_tournament($pdo, ['id' => $pastId]);
    expect_same('Open Play', $readPast['tournament']['name'], 'Past Event name is unchanged');
    expect_same(2, count($readPast['tournament']['matches']), 'Past Event matches count is unchanged');
    expect_same('completed', $readPast['tournament']['matches'][0]['status'], 'Past Event completed match is untouched');
}

function test_clear_results_on_past_event_is_refused(PDO $pdo): void
{
    [$superAdmin, $pastId, $currentId] = setup_past_and_current_events($pdo);
    expect_same($currentId, current_event_id($pdo), 'Fall Classic is the Current Event');

    // Attempt to clear results on open_play
    [$status, $payload] = save_tournament($pdo, $superAdmin, [
        'intent' => 'clear-results',
        'tournament' => [
            'id' => $pastId,
            'name' => 'Open Play',
            'courts' => 2,
            'matches' => [
                ['id' => 'm1', 'status' => 'scheduled', 'scoreA' => '', 'scoreB' => ''],
                ['id' => 'm2', 'status' => 'scheduled', 'scoreA' => '', 'scoreB' => ''],
            ],
        ],
    ]);

    expect_same(400, $status, 'Clearing results on a past Event is refused with 400');
    expect_same(false, $payload['ok'] ?? null, 'Reply reports ok: false');
    expect_same(true, str_contains($payload['error'] ?? '', 'Past events are protected'), 'Error clearly explains past events are protected');

    // Verify open_play match scores and status are unchanged
    [, $readPast] = read_tournament($pdo, ['id' => $pastId]);
    $m1 = $readPast['tournament']['matches'][0];
    expect_same('completed', $m1['status'], 'Past match status is still completed');
    expect_same('11', $m1['scoreA'], 'Past match scoreA is unchanged');
    expect_same('4', $m1['scoreB'], 'Past match scoreB is unchanged');
}

function test_clear_games_on_past_event_is_refused(PDO $pdo): void
{
    [$superAdmin, $pastId, $currentId] = setup_past_and_current_events($pdo);
    expect_same($currentId, current_event_id($pdo), 'Fall Classic is the Current Event');

    // Attempt to clear games for open_play
    [$status, $payload] = clear_tournament_games($pdo, $superAdmin, ['tournamentId' => $pastId]);

    expect_same(400, $status, 'Clearing games for a past Event is refused with 400');
    expect_same(false, $payload['ok'] ?? null, 'Reply reports ok: false');
    expect_same(true, str_contains($payload['error'] ?? '', 'Past events are protected'), 'Error clearly explains past events are protected');

    // Verify open_play game and player records are still in the database
    $gameExists = $pdo->query("SELECT id FROM games WHERE tournament_id = 'open_play'")->fetchAll(PDO::FETCH_COLUMN);
    expect_same(['g_open_1'], $gameExists, 'Past Event games are not deleted');

    $playersExist = $pdo->query("SELECT player_name FROM game_players WHERE game_id = 'g_open_1' ORDER BY player_name")->fetchAll(PDO::FETCH_COLUMN);
    expect_same(['Alice', 'Bob', 'Charlie', 'Dave'], $playersExist, 'Past Event game players are not deleted');
}

function test_destructive_actions_work_normally_on_current_event(PDO $pdo): void
{
    [$superAdmin, $pastId, $currentId] = setup_past_and_current_events($pdo);

    // 1. Regenerate schedule on Current Event works
    [$statusRegen, $payloadRegen] = save_tournament($pdo, $superAdmin, [
        'intent' => 'schedule-update',
        'tournament' => [
            'id' => $currentId,
            'name' => 'Fall Classic',
            'courts' => 3,
            'matches' => [
                ['id' => 'fc_m1', 'status' => 'completed', 'scoreA' => '11', 'scoreB' => '9', 'winner' => 'A'],
                ['id' => 'fc_m2', 'status' => 'scheduled'],
            ],
        ],
    ]);
    expect_same(200, $statusRegen, 'Regenerate schedule on Current Event succeeds with 200');
    expect_same(true, $payloadRegen['ok'], 'Reply reports ok: true');

    // Also record a game for current event
    save_game($pdo, $superAdmin, ['game' => [
        'id' => 'g_fall_1',
        'status' => 'completed',
        'type' => 'doubles',
        'teamA' => ['name' => 'Team A', 'players' => ['Eve'], 'score' => 11],
        'teamB' => ['name' => 'Team B', 'players' => ['Frank'], 'score' => 9],
        'winner' => 'A',
        'tournamentMatch' => ['tournamentId' => $currentId, 'matchId' => 'fc_m1'],
    ]]);

    // 2. Clear results on Current Event works
    [$statusClear, $payloadClear] = save_tournament($pdo, $superAdmin, [
        'intent' => 'clear-results',
        'tournament' => [
            'id' => $currentId,
            'name' => 'Fall Classic',
            'courts' => 3,
            'matches' => [
                ['id' => 'fc_m1', 'status' => 'scheduled', 'scoreA' => '', 'scoreB' => ''],
                ['id' => 'fc_m2', 'status' => 'scheduled', 'scoreA' => '', 'scoreB' => ''],
            ],
        ],
    ]);
    expect_same(200, $statusClear, 'Clear results on Current Event succeeds with 200');
    expect_same(true, $payloadClear['ok'], 'Clear results reports ok: true');

    // 3. Reset Tournament on Current Event works
    [$statusReset, $payloadReset] = save_tournament($pdo, $superAdmin, [
        'intent' => 'reset',
        'tournament' => [
            'id' => $currentId,
            'name' => 'Fall Classic',
            'courts' => 3,
            'matches' => [],
        ],
    ]);
    expect_same(200, $statusReset, 'Reset Tournament on Current Event succeeds with 200');
    expect_same(true, $payloadReset['ok'], 'Reset Tournament reports ok: true');

    // 4. Clear games on Current Event works
    [$statusClearGames, $payloadClearGames] = clear_tournament_games($pdo, $superAdmin, ['tournamentId' => $currentId]);
    expect_same(200, $statusClearGames, 'Clear games on Current Event succeeds with 200');
    expect_same(1, $payloadClearGames['deleted'], 'One game deleted from Current Event');

    // Verify past Event data is still completely untouched after all Current Event operations
    [, $readPast] = read_tournament($pdo, ['id' => $pastId]);
    expect_same(2, count($readPast['tournament']['matches']), 'Past Event still has its 2 matches');
    expect_same('completed', $readPast['tournament']['matches'][0]['status'], 'Past Event match 1 is still completed');
    $pastGames = $pdo->query("SELECT id FROM games WHERE tournament_id = 'open_play'")->fetchAll(PDO::FETCH_COLUMN);
    expect_same(['g_open_1'], $pastGames, 'Past Event still has its games');
}

run_db_tests([
    'test_regenerate_schedule_on_past_event_is_refused',
    'test_reset_tournament_on_past_event_is_refused',
    'test_clear_results_on_past_event_is_refused',
    'test_clear_games_on_past_event_is_refused',
    'test_destructive_actions_work_normally_on_current_event',
]);
