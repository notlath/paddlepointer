<?php
declare(strict_types=1);

// Tournament save, read and clear-Games handler test, no web server needed:
//   php tests/tournament_test.php
// Database setup: see tests/test_db.php.

require_once __DIR__ . '/test_db.php';
require_once __DIR__ . '/../api/tournaments.php';
require_once __DIR__ . '/../api/games.php';

function user_with_role(string $role): array
{
    return ['id' => 1, 'username' => "{$role}_user", 'display_name' => ucfirst($role), 'role' => $role];
}

// An Open Play Tournament with one scheduled and one in-progress Match.
function stored_open_play(PDO $pdo): array
{
    migrate($pdo);
    $tournament = ['id' => 'open_play', 'name' => 'Open Play', 'courts' => 2, 'matches' => [
        ['id' => 'm1', 'court' => 1, 'status' => 'scheduled', 'scoreA' => '', 'scoreB' => ''],
        ['id' => 'm2', 'court' => 2, 'status' => 'in_progress', 'activeGameId' => 'game_1', 'scoreA' => '3', 'scoreB' => '2'],
    ]];
    [$status] = save_tournament($pdo, user_with_role('super_admin'), ['intent' => 'schedule-update', 'tournament' => $tournament]);
    expect_same(200, $status, 'The Super Admin creates the Tournament');
    return $tournament;
}

function read_stored(PDO $pdo): array
{
    [, $payload] = read_tournament($pdo, ['id' => 'open_play']);
    return $payload['tournament'] ?? [];
}

function test_admin_changes_only_match_results(PDO $pdo): void
{
    $tournament = stored_open_play($pdo);

    $submitted = $tournament;
    $submitted['name'] = 'Renamed';
    $submitted['courts'] = 9;
    $submitted['matches'][0] = ['id' => 'm1', 'court' => 5, 'status' => 'in_progress', 'activeGameId' => 'game_7', 'scoreA' => '4x'];
    $submitted['matches'][] = ['id' => 'm_new', 'status' => 'scheduled'];
    [$status] = save_tournament($pdo, user_with_role('admin'), ['intent' => 'start-match', 'tournament' => $submitted]);
    expect_same(200, $status, 'An Admin may update Match results');

    $stored = read_stored($pdo);
    expect_same(['Open Play', 2, 2], [$stored['name'], $stored['courts'], count($stored['matches'])], 'The schedule itself is unchanged');
    $m1 = $stored['matches'][0];
    expect_same([1, 'in_progress', 'game_7', '4'], [$m1['court'], $m1['status'], $m1['activeGameId'], $m1['scoreA']], 'Only result fields change, sanitized');

    $other = ['id' => 'other_cup', 'name' => 'Other Cup', 'matches' => []];
    [$status, $payload] = save_tournament($pdo, user_with_role('admin'), ['tournament' => $other]);
    expect_same([403, 'Only a Super Admin can create or update a tournament schedule'], [$status, $payload['error'] ?? null], 'An Admin may not create a Tournament');
    expect_same(false, $pdo->query("SELECT id FROM tournaments WHERE id = 'other_cup'")->fetchColumn(), 'Nothing is created');

    foreach (['player', 'visitor'] as $role) {
        [$status] = save_tournament($pdo, user_with_role($role), ['tournament' => $tournament]);
        expect_same(403, $status, "A $role may not save a Tournament");
    }
    [$status] = save_tournament($pdo, null, ['tournament' => $tournament]);
    expect_same(401, $status, 'Signed-out saves are refused');
}

function test_admin_cannot_spoof_tournament_scoring_rules(PDO $pdo): void
{
    $tournament = stored_open_play($pdo);
    $admin = user_with_role('admin');

    foreach ([
        [['scoreA' => '10', 'scoreB' => '8', 'winner' => 'A'], ['targetScore' => 1], 'Winning score must reach the target score'],
        [['scoreA' => '11', 'scoreB' => '10', 'winner' => 'A'], ['winByTwo' => false], 'Winner must lead by at least 2 points'],
    ] as [$result, $spoofedRule, $message]) {
        $submitted = array_merge($tournament, $spoofedRule);
        $submitted['matches'][1] = array_merge($submitted['matches'][1], $result, [
            'status' => 'completed',
            'gameId' => 'game_1',
        ]);
        [$status, $payload] = save_tournament($pdo, $admin, [
            'intent' => 'complete-match',
            'tournament' => $submitted,
        ]);
        expect_same([409, $message], [$status, $payload['error'] ?? null], "Bulk Match completion ignores spoofed Tournament rule: $message");
    }
}

function test_super_admin_keeps_ongoing_match_locks_unless_reset(PDO $pdo): void
{
    $tournament = stored_open_play($pdo);
    $superAdmin = user_with_role('super_admin');

    $dropped = $tournament;
    array_pop($dropped['matches']);
    [$status, $payload] = save_tournament($pdo, $superAdmin, ['intent' => 'schedule-update', 'tournament' => $dropped]);
    expect_same([409, 'Match is already ongoing; refresh the tournament before changing the schedule'], [$status, $payload['error'] ?? null], 'Dropping an in-progress Match is refused');

    $relocked = $tournament;
    $relocked['matches'][1]['activeGameId'] = 'game_2';
    [$status, $payload] = save_tournament($pdo, $superAdmin, ['intent' => 'schedule-update', 'tournament' => $relocked]);
    expect_same([409, 'Match is already ongoing'], [$status, $payload['error'] ?? null], "Changing an in-progress Match's lock is refused");
    expect_same('game_1', read_stored($pdo)['matches'][1]['activeGameId'], 'A refused save leaves the lock in place');

    [$status] = save_tournament($pdo, $superAdmin, ['intent' => 'reset', 'tournament' => $relocked]);
    expect_same(200, $status, "A reset may change an in-progress Match's lock");
    expect_same('game_2', read_stored($pdo)['matches'][1]['activeGameId'], 'The reset lock is stored');

    [$status] = save_tournament($pdo, $superAdmin, ['intent' => 'reset', 'tournament' => $dropped]);
    expect_same(200, $status, 'A reset may drop the in-progress Match');
    expect_same(['m1'], array_column(read_stored($pdo)['matches'], 'id'), 'The reset schedule is stored');
}

function test_timing_settings_are_clamped(PDO $pdo): void
{
    $tournament = stored_open_play($pdo);

    $tournament['averageGameMinutes'] = 999;
    $tournament['transitionMinutes'] = -4;
    $tournament['bufferMinutes'] = '';
    [$status, $payload] = save_tournament($pdo, user_with_role('super_admin'), ['intent' => 'reset', 'tournament' => $tournament]);

    $expected = [60, 0, 30, 1];
    $fields = ['averageGameMinutes', 'transitionMinutes', 'bufferMinutes', 'timingVersion'];
    $stored = read_stored($pdo);
    expect_same([200, $expected], [$status, array_map(static fn($f) => $stored[$f], $fields)], 'Timing is clamped (or defaulted) when stored');
    expect_same($expected, array_map(static fn($f) => $payload['tournament'][$f], $fields), 'The reply carries the clamped timing');
}

function test_reading_tournaments(PDO $pdo): void
{
    migrate($pdo);
    expect_same([200, ['ok' => true, 'tournament' => null]], read_tournament($pdo, ['id' => 'open_play']), 'A missing Tournament reads as empty');

    stored_open_play($pdo);
    [$status, $payload] = read_tournament($pdo, ['id' => '']);
    expect_same([200, 'open_play', true], [$status, $payload['tournament']['id'] ?? null, $payload['tournament']['_shared'] ?? null], 'A blank id reads the shared Open Play Tournament');
}

function test_blank_id_reads_and_saves_the_stored_current_event(PDO $pdo): void
{
    migrate($pdo);
    $pdo->prepare("UPDATE app_settings SET setting_value = :value WHERE setting_key = 'current_event_id'")
        ->execute([':value' => 'summer_bash']);

    [$status, $payload] = save_tournament($pdo, user_with_role('super_admin'), [
        'intent' => 'schedule-update',
        'tournament' => ['name' => 'Summer Bash', 'courts' => 2, 'matches' => []],
    ]);
    expect_same(200, $status, 'Saving without an id succeeds');
    expect_same('summer_bash', $payload['tournament']['id'] ?? null, 'A save with no id is stored under the Current Event, not open_play');

    [, $readPayload] = read_tournament($pdo, ['id' => '']);
    expect_same('summer_bash', $readPayload['tournament']['id'] ?? null, 'A blank-id read returns the Current Event, not open_play');
}

function test_clearing_deletes_only_that_tournaments_games(PDO $pdo): void
{
    migrate($pdo);
    $admin = user_with_role('admin');
    $game = static fn(string $id, array $extra = []): array => ['game' => $extra + [
        'id' => $id, 'teamA' => ['name' => 'A', 'score' => 11], 'teamB' => ['name' => 'B', 'score' => 3], 'winner' => 'A',
    ]];
    save_game($pdo, $admin, $game('g_open_1', ['tournamentMatch' => ['tournamentId' => 'open_play', 'matchId' => 'm1']]));
    save_game($pdo, $admin, $game('g_open_2', ['tournamentMatch' => ['tournamentId' => 'open_play', 'matchId' => 'm2']]));
    save_game($pdo, $admin, $game('g_other', ['tournamentMatch' => ['tournamentId' => 'other_cup', 'matchId' => 'm1']]));
    save_game($pdo, $admin, $game('g_standard'));

    foreach (['admin', 'player', 'visitor'] as $role) {
        [$status] = clear_tournament_games($pdo, user_with_role($role), ['tournamentId' => 'open_play']);
        expect_same(403, $status, "A $role may not clear Games");
    }
    [$status] = clear_tournament_games($pdo, null, ['tournamentId' => 'open_play']);
    expect_same(401, $status, 'Signed-out clears are refused');

    $result = clear_tournament_games($pdo, user_with_role('super_admin'), ['tournamentId' => 'open_play']);
    expect_same([200, ['ok' => true, 'deleted' => 2, 'tournamentId' => 'open_play']], $result, 'The Super Admin clears the Tournament\'s Games');
    expect_same(['g_other', 'g_standard'], $pdo->query("SELECT id FROM games ORDER BY id")->fetchAll(PDO::FETCH_COLUMN), 'Other Games are kept');
    expect_same(['g_other', 'g_standard'], $pdo->query("SELECT DISTINCT game_id FROM game_players ORDER BY game_id")->fetchAll(PDO::FETCH_COLUMN), 'Player records for cleared Games are removed');
}

function test_clearing_with_no_tournament_id_uses_the_current_event(PDO $pdo): void
{
    migrate($pdo);
    $pdo->prepare("UPDATE app_settings SET setting_value = :value WHERE setting_key = 'current_event_id'")
        ->execute([':value' => 'summer_bash']);

    $admin = user_with_role('admin');
    save_game($pdo, $admin, ['game' => [
        'id' => 'g_summer', 'teamA' => ['name' => 'A', 'score' => 11], 'teamB' => ['name' => 'B', 'score' => 3], 'winner' => 'A',
        'tournamentMatch' => ['tournamentId' => 'summer_bash', 'matchId' => 'm1'],
    ]]);
    save_game($pdo, $admin, ['game' => [
        'id' => 'g_open', 'teamA' => ['name' => 'A', 'score' => 11], 'teamB' => ['name' => 'B', 'score' => 3], 'winner' => 'A',
        'tournamentMatch' => ['tournamentId' => 'open_play', 'matchId' => 'm1'],
    ]]);

    $result = clear_tournament_games($pdo, user_with_role('super_admin'), []);
    expect_same([200, ['ok' => true, 'deleted' => 1, 'tournamentId' => 'summer_bash']], $result, 'Omitting tournamentId clears the Current Event, not open_play');
    expect_same(['g_open'], $pdo->query("SELECT id FROM games ORDER BY id")->fetchAll(PDO::FETCH_COLUMN), 'Only the Current Event\'s Game is removed');
}

function test_unchanged_tournament_gets_tiny_reply(PDO $pdo): void
{
    stored_open_play($pdo);
    [$status, $full] = read_tournament($pdo, ['id' => 'open_play']);
    expect_same(200, $status, 'Initial read succeeds');
    $updatedAt = $full['tournament']['_updatedAt'] ?? null;
    expect_same(true, !empty($updatedAt), 'Tournament has _updatedAt timestamp');

    [$statusUnchanged, $unchangedPayload] = read_tournament($pdo, ['id' => 'open_play', 'since' => $updatedAt]);
    expect_same(200, $statusUnchanged, 'Poll for unchanged tournament succeeds');
    expect_same(['ok' => true, 'unchanged' => true], $unchangedPayload, 'A poll for an unchanged Tournament gets a small reply with no Tournament in it');
    expect_same(false, isset($unchangedPayload['tournament']), 'No tournament object in tiny reply');
}

function test_any_change_in_same_second_returns_full_tournament(PDO $pdo): void
{
    stored_open_play($pdo);
    [, $read1] = read_tournament($pdo, ['id' => 'open_play']);
    $t1 = $read1['tournament']['_updatedAt'];

    // 1. Score update in the same second
    [$statusMatch] = update_tournament_match($pdo, user_with_role('admin'), [
        'intent' => 'score-sync',
        'match' => ['tournamentId' => 'open_play', 'matchId' => 'm2', 'activeGameId' => 'game_1', 'scoreA' => '7', 'scoreB' => '5'],
    ]);
    expect_same(200, $statusMatch, 'Score update succeeds');

    [$statusAfterScore, $readAfterScore] = read_tournament($pdo, ['id' => 'open_play', 'since' => $t1]);
    expect_same(200, $statusAfterScore, 'Read after score update succeeds');
    expect_same(true, isset($readAfterScore['tournament']), 'Full tournament returned after score update');
    expect_same('7', $readAfterScore['tournament']['matches'][1]['scoreA'] ?? '', 'Updated score present');
    $t2 = $readAfterScore['tournament']['_updatedAt'];
    expect_same(true, $t2 > $t1, 'Timestamp advanced after score update even within same second');

    // Poll with t2 is unchanged
    [, $pollAfterScore] = read_tournament($pdo, ['id' => 'open_play', 'since' => $t2]);
    expect_same(['ok' => true, 'unchanged' => true], $pollAfterScore, 'Poll with latest timestamp is unchanged');

    // 2. Schedule save in the same second
    $updatedSchedule = $readAfterScore['tournament'];
    $updatedSchedule['name'] = 'Open Play Updated';
    [$statusSchedule] = save_tournament($pdo, user_with_role('super_admin'), [
        'intent' => 'schedule-update',
        'tournament' => $updatedSchedule,
    ]);
    expect_same(200, $statusSchedule, 'Schedule update succeeds');

    [$statusAfterSchedule, $readAfterSchedule] = read_tournament($pdo, ['id' => 'open_play', 'since' => $t2]);
    expect_same(200, $statusAfterSchedule, 'Read after schedule update succeeds');
    expect_same('Open Play Updated', $readAfterSchedule['tournament']['name'] ?? '', 'Updated name present');
    $t3 = $readAfterSchedule['tournament']['_updatedAt'];
    expect_same(true, $t3 > $t2, 'Timestamp advanced after schedule update even within same second');

    // Poll with t3 is unchanged
    [, $pollAfterSchedule] = read_tournament($pdo, ['id' => 'open_play', 'since' => $t3]);
    expect_same(['ok' => true, 'unchanged' => true], $pollAfterSchedule, 'Poll with latest schedule timestamp is unchanged');

    // 3. Reset in the same second
    [$statusReset] = save_tournament($pdo, user_with_role('super_admin'), [
        'intent' => 'reset',
        'tournament' => ['id' => 'open_play', 'name' => 'Open Play Reset', 'matches' => []],
    ]);
    expect_same(200, $statusReset, 'Reset succeeds');

    [$statusAfterReset, $readAfterReset] = read_tournament($pdo, ['id' => 'open_play', 'since' => $t3]);
    expect_same(200, $statusAfterReset, 'Read after reset succeeds');
    expect_same('Open Play Reset', $readAfterReset['tournament']['name'] ?? '', 'Reset tournament returned');
    $t4 = $readAfterReset['tournament']['_updatedAt'];
    expect_same(true, $t4 > $t3, 'Timestamp advanced after reset even within same second');

    // Poll with t4 is unchanged
    [, $pollAfterReset] = read_tournament($pdo, ['id' => 'open_play', 'since' => $t4]);
    expect_same(['ok' => true, 'unchanged' => true], $pollAfterReset, 'Poll with reset timestamp is unchanged');
}

run_db_tests([
    'test_admin_changes_only_match_results',
    'test_admin_cannot_spoof_tournament_scoring_rules',
    'test_super_admin_keeps_ongoing_match_locks_unless_reset',
    'test_timing_settings_are_clamped',
    'test_reading_tournaments',
    'test_blank_id_reads_and_saves_the_stored_current_event',
    'test_clearing_deletes_only_that_tournaments_games',
    'test_clearing_with_no_tournament_id_uses_the_current_event',
    'test_unchanged_tournament_gets_tiny_reply',
    'test_any_change_in_same_second_returns_full_tournament',
]);
