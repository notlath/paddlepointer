<?php
declare(strict_types=1);

// Tournament Match update handler test, no web server needed:
//   php tests/tournament_match_test.php
// Database setup: see tests/test_db.php.

require_once __DIR__ . '/test_db.php';
require_once __DIR__ . '/../api/tournaments.php';

const ADMIN = ['id' => 1, 'username' => 'court_admin', 'display_name' => 'Court Admin', 'role' => 'admin'];

// An Open Play Tournament holding one Match in each status.
function seed_tournament(PDO $pdo): void
{
    migrate($pdo);
    $tournament = ['id' => 'open_play', 'name' => 'Open Play', 'matches' => [
        ['id' => 'm_scheduled', 'status' => 'scheduled'],
        ['id' => 'm_live', 'status' => 'in_progress', 'activeGameId' => 'game_1', 'scoreA' => '3', 'scoreB' => '2'],
        ['id' => 'm_done', 'status' => 'completed', 'gameId' => 'game_9', 'scoreA' => '11', 'scoreB' => '4', 'winner' => 'A'],
    ]];
    save_tournament($pdo, ['id' => 999, 'username' => 'super', 'display_name' => 'Super', 'role' => 'super_admin'], ['intent' => 'schedule-update', 'tournament' => $tournament]);
}

function match_update(string $intent, array $match): array
{
    return ['intent' => $intent, 'match' => $match + ['tournamentId' => 'open_play']];
}

function stored_match(PDO $pdo, string $matchId): array
{
    $stmt = $pdo->prepare("SELECT * FROM tournament_matches WHERE tournament_id = 'open_play' AND id = :id LIMIT 1");
    $stmt->execute([':id' => $matchId]);
    $row = $stmt->fetch();
    if (!$row) {
        throw new RuntimeException("Match $matchId not stored");
    }
    return row_to_match($row);
}

function test_completed_match_only_accepts_its_own_game(PDO $pdo): void
{
    seed_tournament($pdo);

    [$status] = update_tournament_match($pdo, ADMIN, match_update('complete-match', ['matchId' => 'm_done', 'gameId' => 'game_9', 'scoreA' => '11', 'scoreB' => '4', 'winner' => 'A']));
    expect_same(200, $status, 'The same Game may complete the Match again');

    [$status, $payload] = update_tournament_match($pdo, ADMIN, match_update('complete-match', ['matchId' => 'm_done', 'gameId' => 'game_other', 'winner' => 'B']));
    expect_same([409, 'Match is already completed and locked'], [$status, $payload['error'] ?? null], 'A different Game may not complete it');

    foreach (['start-match' => [], 'score-sync' => [], 'unlock-match' => ['status' => 'scheduled']] as $intent => $extra) {
        [$status, $payload] = update_tournament_match($pdo, ADMIN, match_update($intent, $extra + ['matchId' => 'm_done', 'activeGameId' => 'game_9', 'gameId' => 'game_9', 'scoreA' => '5']));
        expect_same([409, 'Match is already completed and locked'], [$status, $payload['error'] ?? null], "A completed Match refuses $intent");
    }
    $match = stored_match($pdo, 'm_done');
    expect_same(['game_9', 'A', '11'], [$match['gameId'], $match['winner'], $match['scoreA']], 'Refused updates leave the Match untouched');
}

function test_completed_match_refuses_missing_game_id_regardless_of_intent(PDO $pdo): void
{
    seed_tournament($pdo);

    [$status, $payload] = update_tournament_match($pdo, ADMIN, match_update('score-sync', ['matchId' => 'm_done', 'status' => 'completed', 'gameId' => '', 'scoreA' => '11', 'scoreB' => '4', 'winner' => 'A']));
    expect_same([409, 'Match is already completed and locked'], [$status, $payload['error'] ?? null], 'A completion update without a Game id is refused, whatever the intent');

    $match = stored_match($pdo, 'm_done');
    expect_same('game_9', $match['gameId'], 'The stored Game link survives the refused update');
}

function test_take_over_leaves_game_link_unchanged(PDO $pdo): void
{
    seed_tournament($pdo);

    [$status] = update_tournament_match($pdo, ADMIN, match_update('start-match', ['matchId' => 'm_live', 'activeGameId' => 'game_1', 'scoreA' => '3', 'scoreB' => '2']));
    expect_same(200, $status, 'Taking over the stalled Match succeeds');
    expect_same(null, stored_match($pdo, 'm_live')['gameId'], 'The in-progress Match still has no Game link after take-over');
}

function test_take_over_retires_the_old_scoring_device(PDO $pdo): void
{
    seed_tournament($pdo);
    $base = ['matchId' => 'm_live', 'activeGameId' => 'game_1'];
    expect_same(200, update_tournament_match($pdo, ADMIN, match_update('score-sync', $base + ['scoreA' => '4']))[0], 'An old Match without a claim remains playable');
    [$status, $started] = update_tournament_match($pdo, ADMIN, match_update('start-match', $base + ['scoreA' => '4']));
    $claimA = $started['match']['scoringClaim'] ?? null;
    expect_same(true, $status === 200 && is_string($claimA) && strlen($claimA) === 16, 'Take-over creates a claim');
    [$status, $taken] = update_tournament_match($pdo, ADMIN, match_update('start-match', $base + ['scoreA' => '4']));
    $claimB = $taken['match']['scoringClaim'] ?? null;
    expect_same(true, $status === 200 && $claimB !== $claimA, 'A new take-over rotates the claim');
    [$status, $refused] = update_tournament_match($pdo, ADMIN, match_update('score-sync', $base + ['scoringClaim' => $claimA, 'scoreA' => '9']));
    expect_same([409, 'Scoring moved to another device'], [$status, $refused['error'] ?? null], 'Old device cannot overwrite the Match');
    expect_same('4', stored_match($pdo, 'm_live')['scoreA'], 'Old device changed nothing');
    expect_same(200, update_tournament_match($pdo, ADMIN, match_update('score-sync', $base + ['scoringClaim' => $claimB, 'scoreA' => '5']))[0], 'New device can score');
    foreach (['complete-match' => ['gameId' => 'game_1', 'scoreA' => '11', 'scoreB' => '4', 'winner' => 'A'], 'unlock-match' => ['status' => 'scheduled']] as $intent => $extra) {
        expect_same(409, update_tournament_match($pdo, ADMIN, match_update($intent, $base + ['scoringClaim' => $claimA] + $extra))[0], "Old device cannot $intent");
    }
    expect_same(200, update_tournament_match($pdo, ADMIN, match_update('complete-match', $base + ['scoringClaim' => $claimB, 'gameId' => 'game_1', 'scoreA' => '11', 'scoreB' => '4', 'winner' => 'A']))[0], 'New device can complete');
    expect_same(false, array_key_exists('scoringClaim', read_tournament($pdo, ['id' => 'open_play'])[1]['tournament']['matches'][1]), 'Public Tournament read hides the claim');
}

function test_in_progress_match_refuses_another_scoreboard(PDO $pdo): void
{
    seed_tournament($pdo);

    foreach (['start-match', 'score-sync', 'complete-match', 'unlock-match'] as $intent) {
        $update = ['matchId' => 'm_live', 'activeGameId' => 'game_2', 'gameId' => 'game_2', 'scoreA' => '11', 'scoreB' => '0'];
        if ($intent === 'unlock-match') {
            $update['status'] = 'scheduled';
        }
        [$status, $payload] = update_tournament_match($pdo, ADMIN, match_update($intent, $update));
        expect_same([409, 'Match is already ongoing on another scoreboard'], [$status, $payload['error'] ?? null], "$intent from another Game is refused");
    }

    [$status] = update_tournament_match($pdo, ADMIN, match_update('score-sync', ['matchId' => 'm_live', 'activeGameId' => 'game_1', 'scoreA' => '4']));
    expect_same(200, $status, 'The owning Game may keep syncing');
    expect_same('4', stored_match($pdo, 'm_live')['scoreA'], 'The synced score is stored');
}

function test_next_match_moves_to_a_free_court(PDO $pdo): void
{
    migrate($pdo);
    save_tournament($pdo, ['id' => 999, 'username' => 'super', 'display_name' => 'Super', 'role' => 'super_admin'], [
        'intent' => 'schedule-update',
        'tournament' => ['id' => 'open_play', 'name' => 'Open Play', 'courts' => 2, 'matches' => [
            ['id' => 'finished', 'court' => 1, 'status' => 'completed', 'scoreA' => '11', 'scoreB' => '4', 'winner' => 'A'],
            ['id' => 'playing', 'court' => 2, 'status' => 'in_progress', 'activeGameId' => 'game_playing', 'teamA' => ['Ada', 'Bea'], 'teamB' => ['Cora', 'Dina']],
            ['id' => 'next', 'round' => 2, 'court' => 2, 'status' => 'scheduled', 'teamA' => ['Eva', 'Fay'], 'teamB' => ['Gia', 'Hal']],
            ['id' => 'later', 'round' => 3, 'court' => 2, 'status' => 'scheduled', 'teamA' => ['Ivy', 'Jay'], 'teamB' => ['Kay', 'Leo']],
        ]],
    ]);

    [$blocked, $reason] = update_tournament_match($pdo, ADMIN, match_update('start-match', [
        'matchId' => 'next', 'activeGameId' => 'game_next', 'court' => 2,
    ]));
    expect_same([409, 'Court 2 is already playing a Match'], [$blocked, $reason['error'] ?? null], 'A busy court refuses another Match');

    [$status, $payload] = update_tournament_match($pdo, ADMIN, match_update('start-match', [
        'matchId' => 'next', 'activeGameId' => 'game_next', 'court' => 1,
    ]));
    expect_same([200, 1], [$status, $payload['match']['court'] ?? null], 'The next Match starts on the free court');
    expect_same(1, stored_match($pdo, 'next')['court'], 'The new court is persisted');
}

function test_a_player_cannot_be_in_two_live_matches(PDO $pdo): void
{
    migrate($pdo);
    save_tournament($pdo, ['id' => 999, 'username' => 'super', 'display_name' => 'Super', 'role' => 'super_admin'], ['intent' => 'schedule-update', 'tournament' => [
        'id' => 'open_play', 'name' => 'Open Play', 'matches' => [
            ['id' => 'm_live', 'status' => 'in_progress', 'court' => 2, 'activeGameId' => 'game_1', 'teamA' => ['Alice', 'Amy'], 'teamB' => ['Bob', 'Bill']],
            ['id' => 'm_shares', 'status' => 'scheduled', 'court' => 1, 'teamA' => ['Amy', 'Gia'], 'teamB' => ['Ivy', 'Jo']],
            ['id' => 'm_free', 'status' => 'scheduled', 'court' => 3, 'teamA' => ['Cid', 'Dee'], 'teamB' => ['Eli', 'Fay']],
        ],
    ]]);

    [$status, $payload] = update_tournament_match($pdo, ADMIN, match_update('start-match', ['matchId' => 'm_shares', 'activeGameId' => 'game_2']));
    expect_same([409, 'Amy is already playing on Court 2'], [$status, $payload['error'] ?? null], 'Starting a Match whose Player is on another court is refused');
    expect_same('scheduled', stored_match($pdo, 'm_shares')['status'], 'The refused Match is left alone');

    [$status] = update_tournament_match($pdo, ADMIN, match_update('start-match', ['matchId' => 'm_free', 'activeGameId' => 'game_3']));
    expect_same(200, $status, 'A Match whose Players are all free still starts');

    [$status] = update_tournament_match($pdo, ADMIN, match_update('complete-match', ['matchId' => 'm_live', 'gameId' => 'game_1', 'scoreA' => '11', 'scoreB' => '4', 'winner' => 'A']));
    expect_same(200, $status, 'The ongoing Match is completed');

    [$status] = update_tournament_match($pdo, ADMIN, match_update('start-match', ['matchId' => 'm_shares', 'activeGameId' => 'game_4']));
    expect_same(200, $status, 'Once the other Match is finished, the shared Player may start');
    expect_same('in_progress', stored_match($pdo, 'm_shares')['status'], 'The Match is now ongoing');
}

function test_taking_over_is_not_blocked_by_its_own_players(PDO $pdo): void
{
    migrate($pdo);
    save_tournament($pdo, ['id' => 999, 'username' => 'super', 'display_name' => 'Super', 'role' => 'super_admin'], ['intent' => 'schedule-update', 'tournament' => [
        'id' => 'open_play', 'name' => 'Open Play', 'matches' => [
            ['id' => 'm_live', 'status' => 'in_progress', 'court' => 2, 'activeGameId' => 'game_1', 'teamA' => ['Alice', 'Amy'], 'teamB' => ['Bob', 'Bill']],
        ],
    ]]);

    [$status] = update_tournament_match($pdo, ADMIN, match_update('score-sync', ['matchId' => 'm_live', 'activeGameId' => 'game_1', 'scoreA' => '5']));
    expect_same(200, $status, 'The owning scoreboard keeps syncing its own Match');

    [$status] = update_tournament_match($pdo, ADMIN, match_update('take-over-match', ['matchId' => 'm_live', 'activeGameId' => 'game_1', 'scoreA' => '6']));
    expect_same(200, $status, 'Taking over the same Match is not blocked by its own Players');
}

function test_unstarted_match_cannot_be_completed(PDO $pdo): void
{
    seed_tournament($pdo);

    [$status, $payload] = update_tournament_match($pdo, ADMIN, match_update('complete-match', ['matchId' => 'm_scheduled', 'gameId' => 'game_3', 'scoreA' => '11', 'scoreB' => '5', 'winner' => 'A']));
    expect_same([409, 'Match must be started before it can be completed'], [$status, $payload['error'] ?? null], 'Completing a never-started Match is refused');
}

function test_completion_enforces_scoring_rules(PDO $pdo): void
{
    seed_tournament($pdo);

    foreach ([
        [['scoreA' => '7', 'scoreB' => '11'], 'Winner is required to complete the match'],
        [['scoreA' => '3', 'scoreB' => '11', 'winner' => 'A'], 'Winner must correspond to the higher score'],
        [['scoreA' => '10', 'scoreB' => '8', 'winner' => 'A', 'targetScore' => 1], 'Winning score must reach the target score'],
        [['scoreA' => '11', 'scoreB' => '10', 'winner' => 'A', 'winByTwo' => false], 'Winner must lead by at least 2 points'],
    ] as [$result, $message]) {
        [$status, $payload] = update_tournament_match($pdo, ADMIN, match_update('complete-match', $result + [
            'matchId' => 'm_live',
            'activeGameId' => 'game_1',
            'gameId' => 'game_1',
            'targetScore' => 11,
            'winByTwo' => true,
        ]));
        expect_same([409, $message], [$status, $payload['error'] ?? null], $message);
    }

    [$status] = update_tournament_match($pdo, ADMIN, match_update('complete-match', [
        'matchId' => 'm_live', 'activeGameId' => 'game_1', 'gameId' => 'game_1',
        'scoreA' => '7', 'scoreB' => '11', 'winner' => 'B', 'targetScore' => 11, 'winByTwo' => true,
    ]));
    expect_same(200, $status, 'A valid completed result succeeds');
    $match = stored_match($pdo, 'm_live');
    expect_same(['completed', 'B'], [$match['status'], $match['winner']], 'The explicit winner is stored');
}

function test_not_found_and_access(PDO $pdo): void
{
    seed_tournament($pdo);

    [$status] = update_tournament_match($pdo, ADMIN, ['match' => ['tournamentId' => 'nope', 'matchId' => 'm_live']]);
    expect_same(404, $status, 'An unknown Tournament returns 404');
    [$status] = update_tournament_match($pdo, ADMIN, match_update('score-sync', ['matchId' => 'nope']));
    expect_same(404, $status, 'An unknown Match returns 404');

    $update = match_update('score-sync', ['matchId' => 'm_live', 'activeGameId' => 'game_1']);
    [$status] = update_tournament_match($pdo, null, $update);
    expect_same(401, $status, 'Signed-out requests are refused');
    foreach (['player', 'visitor'] as $role) {
        [$status] = update_tournament_match($pdo, ['role' => $role] + ADMIN, $update);
        expect_same(403, $status, "A $role is refused");
    }
    [$status] = update_tournament_match($pdo, ['role' => 'super_admin'] + ADMIN, $update);
    expect_same(200, $status, 'A Super Admin is staff');
}

function test_concurrent_court_score_updates_do_not_block_each_other(PDO $pdo): void
{
    migrate($pdo);
    $tournament = ['id' => 'open_play', 'name' => 'Open Play', 'courts' => 2, 'matches' => [
        ['id' => 'm_c1', 'court' => 1, 'status' => 'in_progress', 'activeGameId' => 'game_c1', 'scoreA' => '3', 'scoreB' => '2'],
        ['id' => 'm_c2', 'court' => 2, 'status' => 'in_progress', 'activeGameId' => 'game_c2', 'scoreA' => '4', 'scoreB' => '1'],
    ]];
    save_tournament($pdo, ['id' => 999, 'username' => 'super', 'display_name' => 'Super', 'role' => 'super_admin'], ['intent' => 'schedule-update', 'tournament' => $tournament]);

    $dbName = $pdo->query("SELECT DATABASE()")->fetchColumn();
    $host = getenv('PP_TEST_DB_HOST') ?: '127.0.0.1';
    $port = (int)(getenv('PP_TEST_DB_PORT') ?: 3307);
    $user = getenv('PP_TEST_DB_USER') ?: 'root';
    $pass = getenv('PP_TEST_DB_PASS') ?: '';
    $pdo2 = new PDO("mysql:host=$host;port=$port;dbname=$dbName;charset=utf8mb4", $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    // Court 1 transaction holds an exclusive row lock on Match 1
    $pdo->beginTransaction();
    $c1Row = $pdo->query(
        "SELECT * FROM tournament_matches WHERE tournament_id = 'open_play' AND id = 'm_c1' FOR UPDATE"
    )->fetch();
    expect_same('m_c1', $c1Row['id'], 'Court 1 holds exclusive lock on m_c1');

    // Court 2 updates Match 2 from another connection concurrently
    // Short lock wait timeout guarantees Court 2 fails if it waits on Court 1
    $pdo2->exec("SET SESSION innodb_lock_wait_timeout = 1");
    [$status, $payload] = update_tournament_match(
        $pdo2,
        ADMIN,
        match_update('score-sync', ['matchId' => 'm_c2', 'activeGameId' => 'game_c2', 'scoreA' => '5'])
    );

    expect_same(200, $status, 'Court 2 score update completes immediately without waiting on Court 1');
    expect_same('5', $payload['match']['scoreA'] ?? null, 'Court 2 score update is reflected in reply');
    expect_same('5', stored_match($pdo2, 'm_c2')['scoreA'], 'Court 2 score update is persisted in its own row');

    // Conversely, attempting to update Match 1 from connection 2 while connection 1 holds its lock must wait/timeout
    $timedOut = false;
    try {
        update_tournament_match(
            $pdo2,
            ADMIN,
            match_update('score-sync', ['matchId' => 'm_c1', 'activeGameId' => 'game_c1', 'scoreA' => '9'])
        );
    } catch (PDOException $error) {
        if ($error->getCode() === 'HY000' || str_contains($error->getMessage(), '1205') || str_contains($error->getMessage(), 'timeout')) {
            $timedOut = true;
        } else {
            throw $error;
        }
    }
    expect_same(true, $timedOut, 'Updating Court 1 match from another connection waits on Court 1 lock');

    // Court 1 commits
    $pdo->commit();
}

function test_missing_tournament_id_uses_the_current_event(PDO $pdo): void
{
    migrate($pdo);
    $pdo->prepare("UPDATE app_settings SET setting_value = :value WHERE setting_key = 'current_event_id'")
        ->execute([':value' => 'summer_bash']);
    save_tournament($pdo, ['id' => 999, 'username' => 'super', 'display_name' => 'Super', 'role' => 'super_admin'], [
        'intent' => 'schedule-update',
        'tournament' => ['id' => 'summer_bash', 'name' => 'Summer Bash', 'matches' => [
            ['id' => 'm1', 'status' => 'scheduled'],
        ]],
    ]);

    [$status] = update_tournament_match($pdo, ADMIN, ['intent' => 'start-match', 'match' => [
        'matchId' => 'm1', 'activeGameId' => 'game_1', 'scoreA' => '0', 'scoreB' => '0',
    ]]);
    expect_same(200, $status, 'An update with no tournamentId is applied to the Current Event, not open_play');
}

run_db_tests([
    'test_completed_match_only_accepts_its_own_game',
    'test_missing_tournament_id_uses_the_current_event',
    'test_completed_match_refuses_missing_game_id_regardless_of_intent',
    'test_take_over_leaves_game_link_unchanged',
    'test_take_over_retires_the_old_scoring_device',
    'test_in_progress_match_refuses_another_scoreboard',
    'test_next_match_moves_to_a_free_court',
    'test_a_player_cannot_be_in_two_live_matches',
    'test_taking_over_is_not_blocked_by_its_own_players',
    'test_unstarted_match_cannot_be_completed',
    'test_completion_enforces_scoring_rules',
    'test_not_found_and_access',
    'test_concurrent_court_score_updates_do_not_block_each_other',
]);
