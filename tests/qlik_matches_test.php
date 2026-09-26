<?php
declare(strict_types=1);

// Qlik matches endpoint test, no web server needed:
//   php tests/qlik_matches_test.php
// Database setup: see tests/test_db.php.

require_once __DIR__ . '/test_db.php';
require_once __DIR__ . '/../api/qlik/matches.php';
require_once __DIR__ . '/../api/tournaments.php';

const QLIK_MATCHES_TEST_KEY = 'test-analytics-key';
const MATCHES_SUPER_ADMIN = ['id' => 999, 'username' => 'super', 'display_name' => 'Super', 'role' => 'super_admin'];

function seed_matches_event(PDO $pdo, string $id, string $name, array $matches): void
{
    save_tournament($pdo, MATCHES_SUPER_ADMIN, ['intent' => 'schedule-update', 'tournament' => [
        'id' => $id,
        'name' => $name,
        'courts' => 2,
        'matches' => $matches,
    ]]);
}

function test_matches_missing_or_wrong_key_is_refused(PDO $pdo): void
{
    migrate($pdo);
    putenv('ANALYTICS_KEY=' . QLIK_MATCHES_TEST_KEY);

    [$status, $payload] = read_qlik_matches($pdo, '');
    expect_same([401, false], [$status, $payload['ok']], 'A missing key is refused');

    [$status, $payload] = read_qlik_matches($pdo, 'wrong-key');
    expect_same([401, false], [$status, $payload['ok']], 'A wrong key is refused');
}

function test_unknown_event_is_not_found(PDO $pdo): void
{
    migrate($pdo);
    putenv('ANALYTICS_KEY=' . QLIK_MATCHES_TEST_KEY);

    [$status, $payload] = read_qlik_matches($pdo, QLIK_MATCHES_TEST_KEY, ['event' => 'nope']);
    expect_same([404, false], [$status, $payload['ok']], 'An unknown Event returns 404');
}

function test_event_with_no_matches_yet_is_not_a_404(PDO $pdo): void
{
    migrate($pdo);
    putenv('ANALYTICS_KEY=' . QLIK_MATCHES_TEST_KEY);

    seed_matches_event($pdo, 'open_play', 'Open Play', []);

    [$status, $payload] = read_qlik_matches($pdo, QLIK_MATCHES_TEST_KEY, ['event' => 'open_play']);
    expect_same([200, true, 0], [$status, $payload['ok'], count($payload['rows'])], 'A known Event with zero Matches is not a 404');
}

function test_scheduled_match_has_no_scores_winner_or_dates(PDO $pdo): void
{
    migrate($pdo);
    putenv('ANALYTICS_KEY=' . QLIK_MATCHES_TEST_KEY);

    seed_matches_event($pdo, 'open_play', 'Open Play', [
        ['id' => 'm_sched', 'round' => 1, 'court' => 1, 'status' => 'scheduled',
            'teamA' => ['Ana', 'Ben'], 'teamB' => ['Cid', 'Dee']],
    ]);

    [, $payload] = read_qlik_matches($pdo, QLIK_MATCHES_TEST_KEY);
    $row = $payload['rows'][0];
    expect_same(
        ['open_play', 'm_sched', 1, 1, 'scheduled', ['Ana', 'Ben'], ['Cid', 'Dee'], null, null, null, null, null, null],
        [$row['eventId'], $row['matchId'], $row['round'], $row['court'], $row['status'], $row['teamA'], $row['teamB'],
            $row['scoreA'], $row['scoreB'], $row['winner'], $row['startedAt'], $row['completedAt'], $row['gameId']],
        'A scheduled Match has Teams but no Score, winner, dates or Game id'
    );
}

function test_in_progress_and_completed_match_shapes(PDO $pdo): void
{
    migrate($pdo);
    putenv('ANALYTICS_KEY=' . QLIK_MATCHES_TEST_KEY);

    seed_matches_event($pdo, 'open_play', 'Open Play', [
        ['id' => 'm_live', 'round' => 1, 'court' => 1, 'status' => 'in_progress', 'activeGameId' => 'game_1',
            'teamA' => ['Ana', 'Ben'], 'teamB' => ['Cid', 'Dee'], 'scoreA' => '5', 'scoreB' => '3',
            'startedAt' => '2026-09-13T09:00:00.000Z'],
        ['id' => 'm_done', 'round' => 1, 'court' => 2, 'status' => 'completed', 'gameId' => 'game_9',
            'teamA' => ['Eve', 'Fay'], 'teamB' => ['Gus', 'Hal'], 'scoreA' => '11', 'scoreB' => '7', 'winner' => 'A',
            'startedAt' => '2026-09-13T09:00:00.000Z', 'completedAt' => '2026-09-13T09:20:00.000Z'],
    ]);

    [, $payload] = read_qlik_matches($pdo, QLIK_MATCHES_TEST_KEY);
    $byId = [];
    foreach ($payload['rows'] as $row) {
        $byId[$row['matchId']] = $row;
    }

    expect_same(
        [5, 3, null, null, '2026-09-13T09:00:00.000Z'],
        [$byId['m_live']['scoreA'], $byId['m_live']['scoreB'], $byId['m_live']['winner'], $byId['m_live']['completedAt'], $byId['m_live']['startedAt']],
        'An in-progress Match has whole-number Scores but no winner or completion time'
    );
    expect_same(
        [11, 7, 'A', 'game_9', '2026-09-13T09:20:00.000Z'],
        [$byId['m_done']['scoreA'], $byId['m_done']['scoreB'], $byId['m_done']['winner'], $byId['m_done']['gameId'], $byId['m_done']['completedAt']],
        'A completed Match has its winner, Game id and completion time'
    );
}

function test_non_iso_stored_timestamp_is_normalized_to_utc(PDO $pdo): void
{
    migrate($pdo);
    putenv('ANALYTICS_KEY=' . QLIK_MATCHES_TEST_KEY);

    seed_matches_event($pdo, 'open_play', 'Open Play', [
        ['id' => 'm1', 'round' => 1, 'court' => 1, 'status' => 'completed', 'gameId' => 'g1',
            'teamA' => ['Ana', 'Ben'], 'teamB' => ['Cid', 'Dee'], 'scoreA' => '11', 'scoreB' => '4', 'winner' => 'A',
            'startedAt' => '2026-09-13 09:00:00', 'completedAt' => '2026-09-13 09:20:00'],
    ]);

    [, $payload] = read_qlik_matches($pdo, QLIK_MATCHES_TEST_KEY);
    $row = $payload['rows'][0];
    expect_same(
        ['2026-09-13T09:00:00.000Z', '2026-09-13T09:20:00.000Z'],
        [$row['startedAt'], $row['completedAt']],
        'A non-ISO stored timestamp is normalized to strict ISO 8601 UTC'
    );
}

function test_all_events_vs_single_event_filter(PDO $pdo): void
{
    migrate($pdo);
    putenv('ANALYTICS_KEY=' . QLIK_MATCHES_TEST_KEY);

    seed_matches_event($pdo, 'open_play', 'Open Play', [
        ['id' => 'm1', 'round' => 1, 'court' => 1, 'status' => 'scheduled', 'teamA' => ['A', 'B'], 'teamB' => ['C', 'D']],
    ]);
    seed_matches_event($pdo, 'summer_bash', 'Summer Bash', [
        ['id' => 'm2', 'round' => 1, 'court' => 1, 'status' => 'scheduled', 'teamA' => ['E', 'F'], 'teamB' => ['G', 'H']],
    ]);

    [, $allPayload] = read_qlik_matches($pdo, QLIK_MATCHES_TEST_KEY);
    expect_same(2, count($allPayload['rows']), 'Omitting ?event= returns every Tournament Match across every Event');

    [, $onePayload] = read_qlik_matches($pdo, QLIK_MATCHES_TEST_KEY, ['event' => 'summer_bash']);
    expect_same(['summer_bash', 1], [$onePayload['rows'][0]['eventId'], count($onePayload['rows'])], '?event= filters to just that Event');
}

run_db_tests([
    'test_matches_missing_or_wrong_key_is_refused',
    'test_unknown_event_is_not_found',
    'test_event_with_no_matches_yet_is_not_a_404',
    'test_scheduled_match_has_no_scores_winner_or_dates',
    'test_in_progress_and_completed_match_shapes',
    'test_non_iso_stored_timestamp_is_normalized_to_utc',
    'test_all_events_vs_single_event_filter',
]);
