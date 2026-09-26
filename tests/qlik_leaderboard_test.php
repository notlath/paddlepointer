<?php
declare(strict_types=1);

// Qlik leaderboard endpoint test, no web server needed:
//   php tests/qlik_leaderboard_test.php
// Database setup: see tests/test_db.php.

require_once __DIR__ . '/test_db.php';
require_once __DIR__ . '/../api/qlik/leaderboard.php';
require_once __DIR__ . '/../api/games.php';
require_once __DIR__ . '/../api/tournaments.php';

const QLIK_LEADERBOARD_TEST_KEY = 'test-analytics-key';
const QLIK_LEADERBOARD_ADMIN = ['id' => 999, 'username' => 'super', 'display_name' => 'Super', 'role' => 'super_admin'];
const QLIK_LEADERBOARD_VISITOR = ['id' => 77, 'username' => 'guest@example.com', 'display_name' => 'Guest', 'role' => 'visitor'];

function seed_leaderboard_event(PDO $pdo, string $id, array $matches = [], int $courts = 1): void
{
    save_tournament($pdo, QLIK_LEADERBOARD_ADMIN, ['intent' => 'schedule-update', 'tournament' => [
        'id' => $id,
        'name' => $id,
        'courts' => $courts,
        'matches' => $matches,
    ]]);
}

function save_leaderboard_game(PDO $pdo, array $user, string $id, array $extra = []): void
{
    [$status] = save_game($pdo, $user, ['game' => $extra + [
        'id' => $id,
        'status' => 'completed',
        'type' => 'doubles',
        'teamA' => ['name' => 'Team A', 'players' => ['Ana'], 'score' => 11],
        'teamB' => ['name' => 'Team B', 'players' => ['Ben'], 'score' => 7],
        'winner' => 'A',
        'targetScore' => 11,
    ]]);
    expect_same(200, $status, "Game $id saved");
}

function test_results_return_finished_non_visitor_matches_with_optional_event_filter(PDO $pdo): void
{
    migrate($pdo);
    putenv('ANALYTICS_KEY=' . QLIK_LEADERBOARD_TEST_KEY);
    seed_leaderboard_event($pdo, 'spring', [['id' => 'match_1', 'round' => 2, 'court' => 3, 'status' => 'scheduled']], 3);
    seed_leaderboard_event($pdo, 'summer');

    save_leaderboard_game($pdo, QLIK_LEADERBOARD_ADMIN, 'game_spring', [
        'teamA' => ['name' => 'Spring A', 'players' => ['Ana'], 'score' => 15],
        'teamB' => ['name' => 'Spring B', 'players' => ['Ben'], 'score' => 13],
        'tournamentMatch' => ['tournamentId' => 'spring', 'matchId' => 'match_1'],
        'startedAt' => '2026-09-16T09:00:00Z',
        'endedAt' => '2026-09-16T09:22:00Z',
        'targetScore' => 11,
    ]);
    save_leaderboard_game($pdo, QLIK_LEADERBOARD_ADMIN, 'game_summer', [
        'teamA' => ['name' => 'Summer A', 'players' => ['Cid'], 'score' => 11],
        'teamB' => ['name' => 'Summer B', 'players' => ['Dee'], 'score' => 4],
        'tournamentMatch' => ['tournamentId' => 'summer', 'matchId' => 'match_1'],
    ]);
    save_leaderboard_game($pdo, QLIK_LEADERBOARD_ADMIN, 'game_standalone', [
        'teamA' => ['name' => 'Open A', 'players' => ['Eli'], 'score' => 11],
        'teamB' => ['name' => 'Open B', 'players' => ['Fay'], 'score' => 8],
    ]);
    save_leaderboard_game($pdo, QLIK_LEADERBOARD_VISITOR, 'game_visitor');

    [$status, $payload] = read_qlik_leaderboard_results($pdo, QLIK_LEADERBOARD_TEST_KEY);
    expect_same([200, true], [$status, $payload['ok']], 'The all-Events results list succeeds');
    expect_same(
        [
            ['game_spring', 'spring', 'A', 15, 13, 11, 1320, 2, 3],
            ['game_standalone', null, 'A', 11, 8, 11, null, null, null],
            ['game_summer', 'summer', 'A', 11, 4, 11, null, null, null],
        ],
        array_map(static fn (array $row): array => [
            $row['matchId'], $row['eventId'], $row['winner'], $row['teamAScore'], $row['teamBScore'], $row['targetScore'], $row['durationSeconds'], $row['round'], $row['court'],
        ], $payload['rows']),
        'Only finished non-Visitor Tournament and standalone Matches are returned, without a default duration'
    );
    expect_same('2026-09-16T09:22:00.000Z', $payload['rows'][0]['completedAt'] ?? null, 'A finished Match exposes its completion time for the Date filter');

    [$status, $payload] = read_qlik_leaderboard_results($pdo, QLIK_LEADERBOARD_TEST_KEY, ['event' => 'spring']);
    expect_same([200, ['game_spring']], [$status, array_column($payload['rows'], 'matchId')], 'An Event filter returns only that Event\'s Matches');
}

function test_players_include_finished_and_unfinished_tournament_matches(PDO $pdo): void
{
    migrate($pdo);
    putenv('ANALYTICS_KEY=' . QLIK_LEADERBOARD_TEST_KEY);
    seed_leaderboard_event($pdo, 'schedule', [
        ['id' => 'finished_match', 'status' => 'completed', 'gameId' => 'finished_game', 'teamA' => ['Stale Ana'], 'teamB' => ['Stale Ben'], 'scoreA' => '11', 'scoreB' => '9', 'winner' => 'A'],
        ['id' => 'scheduled_match', 'status' => 'scheduled', 'teamA' => ['Cid', ' Dee '], 'teamB' => ['Eli', 'Fay']],
        ['id' => 'live_match', 'status' => 'in_progress', 'activeGameId' => 'live_game', 'teamA' => ['Gia'], 'teamB' => ['Hal']],
    ]);
    save_leaderboard_game($pdo, QLIK_LEADERBOARD_ADMIN, 'finished_game', [
        'teamA' => ['name' => 'Finished A', 'players' => [' Ana '], 'score' => 11],
        'teamB' => ['name' => 'Finished B', 'players' => ['Ben'], 'score' => 9],
        'tournamentMatch' => ['tournamentId' => 'schedule', 'matchId' => 'finished_match'],
    ]);

    [$status, $payload] = read_qlik_leaderboard_players($pdo, QLIK_LEADERBOARD_TEST_KEY, ['event' => 'schedule']);
    expect_same([200, true], [$status, $payload['ok']], 'The Event Players list succeeds');
    expect_same(
        [
            ['finished_game', 'schedule', 'A', 'Ana'],
            ['finished_game', 'schedule', 'B', 'Ben'],
            ['scheduled_match', 'schedule', 'A', 'Cid'],
            ['scheduled_match', 'schedule', 'A', 'Dee'],
            ['scheduled_match', 'schedule', 'B', 'Eli'],
            ['scheduled_match', 'schedule', 'B', 'Fay'],
            ['live_match', 'schedule', 'A', 'Gia'],
            ['live_match', 'schedule', 'B', 'Hal'],
        ],
        array_map(static fn (array $row): array => [$row['matchId'], $row['eventId'], $row['team'], $row['playerName']], $payload['rows']),
        'Finished Matches use recorded Game Players, while scheduled and in-progress Matches use their scheduled Players'
    );
}

function test_players_include_an_unfinished_standalone_match(PDO $pdo): void
{
    migrate($pdo);
    putenv('ANALYTICS_KEY=' . QLIK_LEADERBOARD_TEST_KEY);
    save_leaderboard_game($pdo, QLIK_LEADERBOARD_ADMIN, 'live_standalone', [
        'status' => 'in_progress',
        'winner' => null,
        'teamA' => ['name' => 'Live A', 'players' => ['Ana'], 'score' => 6],
        'teamB' => ['name' => 'Live B', 'players' => ['Ben'], 'score' => 4],
    ]);

    [, $payload] = read_qlik_leaderboard_players($pdo, QLIK_LEADERBOARD_TEST_KEY);
    expect_same(
        [['live_standalone', null, 'A', 'Ana'], ['live_standalone', null, 'B', 'Ben']],
        array_map(static fn (array $row): array => [$row['matchId'], $row['eventId'], $row['team'], $row['playerName']], $payload['rows']),
        'Recorded Players from an unfinished standalone Match are included'
    );
}

function test_endpoint_rows_match_the_app_leaderboard_totals(PDO $pdo): void
{
    migrate($pdo);
    putenv('ANALYTICS_KEY=' . QLIK_LEADERBOARD_TEST_KEY);
    seed_leaderboard_event($pdo, 'autumn');
    save_leaderboard_game($pdo, QLIK_LEADERBOARD_ADMIN, 'autumn_game', [
        'teamA' => ['name' => 'Autumn A', 'players' => [' Ana '], 'score' => 11],
        'teamB' => ['name' => 'Autumn B', 'players' => ['Ben'], 'score' => 7],
        'tournamentMatch' => ['tournamentId' => 'autumn', 'matchId' => 'autumn_match'],
    ]);
    save_leaderboard_game($pdo, QLIK_LEADERBOARD_ADMIN, 'open_game', [
        'teamA' => ['name' => 'Open A', 'players' => ['Cid'], 'score' => 8],
        'teamB' => ['name' => 'Open B', 'players' => ['ana'], 'score' => 11],
        'winner' => 'B',
    ]);
    save_leaderboard_game($pdo, QLIK_LEADERBOARD_VISITOR, 'ignored_visitor');

    [$resultStatus, $results] = read_qlik_leaderboard_results($pdo, QLIK_LEADERBOARD_TEST_KEY);
    [$playerStatus, $players] = read_qlik_leaderboard_players($pdo, QLIK_LEADERBOARD_TEST_KEY);
    [, $leaderboard] = read_leaderboard($pdo, null);
    expect_same([200, 200], [$resultStatus, $playerStatus], 'Both analytics reads succeed');

    $resultsByMatch = [];
    foreach ($results['rows'] as $result) {
        $resultsByMatch[$result['matchId']] = $result;
    }
    $fromAnalytics = [];
    foreach ($players['rows'] as $player) {
        $result = $resultsByMatch[$player['matchId']] ?? null;
        if ($result === null) {
            continue;
        }
        $key = mb_strtolower(trim($player['playerName']));
        $won = $player['team'] === $result['winner'];
        $pointsFor = $player['team'] === 'A' ? $result['teamAScore'] : $result['teamBScore'];
        $pointsAgainst = $player['team'] === 'A' ? $result['teamBScore'] : $result['teamAScore'];
        $fromAnalytics[$key] ??= ['wins' => 0, 'losses' => 0, 'pointsFor' => 0, 'pointsAgainst' => 0];
        $fromAnalytics[$key][$won ? 'wins' : 'losses']++;
        $fromAnalytics[$key]['pointsFor'] += $pointsFor;
        $fromAnalytics[$key]['pointsAgainst'] += $pointsAgainst;
    }
    $fromApp = [];
    foreach ($leaderboard['playerRows'] as $player) {
        $fromApp[mb_strtolower(trim($player['name']))] = array_intersect_key($player, array_flip(['wins', 'losses', 'pointsFor', 'pointsAgainst']));
    }
    ksort($fromAnalytics);
    ksort($fromApp);
    expect_same($fromApp, $fromAnalytics, 'Analytics rows add up to the app leaderboard across the whole database');

    [$status] = read_qlik_leaderboard_results($pdo, 'wrong-key');
    expect_same(401, $status, 'A wrong key is refused');
    [$status] = read_qlik_leaderboard_players($pdo, QLIK_LEADERBOARD_TEST_KEY, ['event' => 'missing']);
    expect_same(404, $status, 'An unknown Event is not found');
}

function test_results_include_rally_stats_with_a_run_broken_by_a_side_out(PDO $pdo): void
{
    migrate($pdo);
    putenv('ANALYTICS_KEY=' . QLIK_LEADERBOARD_TEST_KEY);
    save_leaderboard_game($pdo, QLIK_LEADERBOARD_ADMIN, 'game_rallies', [
        'teamA' => ['name' => 'Team A', 'players' => ['Ana'], 'score' => 6],
        'teamB' => ['name' => 'Team B', 'players' => ['Ben'], 'score' => 1],
        'winner' => 'A',
        'targetScore' => 6,
        'events' => [
            ['action' => 'point', 'rallyWinner' => 'A'],
            ['action' => 'point', 'rallyWinner' => 'A'],
            ['action' => 'side-out', 'rallyWinner' => 'B'],
            ['action' => 'point', 'rallyWinner' => 'B'],
            ['action' => 'side-out', 'rallyWinner' => 'A'],
            ['action' => 'correction', 'rallyWinner' => null],
            ['action' => 'timeout', 'team' => 'B', 'rallyWinner' => null],
            ['action' => 'point', 'rallyWinner' => 'A'],
            ['action' => 'point', 'rallyWinner' => 'A'],
            ['action' => 'point', 'rallyWinner' => 'A'],
        ],
    ]);

    [$status, $payload] = read_qlik_leaderboard_results($pdo, QLIK_LEADERBOARD_TEST_KEY);
    expect_same(200, $status, 'Results with a Rally log succeed');
    $row = $payload['rows'][0];
    expect_same(
        ['sideOuts' => 2, 'rallyCount' => 8, 'teamALongestRun' => 3, 'teamBLongestRun' => 1],
        [
            'sideOuts' => $row['sideOuts'],
            'rallyCount' => $row['rallyCount'],
            'teamALongestRun' => $row['teamALongestRun'],
            'teamBLongestRun' => $row['teamBLongestRun'],
        ],
        "Team A's first run of 2 is broken by a side-out; its later run of 3 becomes the longest, and neither the serve correction nor the timeout is counted as a Rally"
    );
}

function test_results_rally_stats_default_to_zero_without_a_rally_log(PDO $pdo): void
{
    migrate($pdo);
    putenv('ANALYTICS_KEY=' . QLIK_LEADERBOARD_TEST_KEY);
    save_leaderboard_game($pdo, QLIK_LEADERBOARD_ADMIN, 'game_no_rallies');

    [, $payload] = read_qlik_leaderboard_results($pdo, QLIK_LEADERBOARD_TEST_KEY);
    $row = $payload['rows'][0];
    expect_same(
        ['sideOuts' => 0, 'rallyCount' => 0, 'teamALongestRun' => 0, 'teamBLongestRun' => 0],
        [
            'sideOuts' => $row['sideOuts'],
            'rallyCount' => $row['rallyCount'],
            'teamALongestRun' => $row['teamALongestRun'],
            'teamBLongestRun' => $row['teamBLongestRun'],
        ],
        'A Match with no Rally log recorded reports zero for every Rally stat'
    );
}

run_db_tests([
    'test_results_return_finished_non_visitor_matches_with_optional_event_filter',
    'test_players_include_finished_and_unfinished_tournament_matches',
    'test_players_include_an_unfinished_standalone_match',
    'test_endpoint_rows_match_the_app_leaderboard_totals',
    'test_results_include_rally_stats_with_a_run_broken_by_a_side_out',
    'test_results_rally_stats_default_to_zero_without_a_rally_log',
]);
