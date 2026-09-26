<?php
declare(strict_types=1);

// Leaderboard handler test: totals across all completed games per role.
//   php tests/leaderboard_test.php
// Database setup: see tests/test_db.php.

require_once __DIR__ . '/test_db.php';
require_once __DIR__ . '/../api/games.php';

const STAFF = ['id' => 1, 'username' => 'court_admin', 'display_name' => 'Court Admin', 'role' => 'admin'];
const PLAYER_A = ['id' => 42, 'username' => 'pedro', 'display_name' => 'Pedro Reyes', 'role' => 'player'];
const PLAYER_B = ['id' => 43, 'username' => 'maria', 'display_name' => 'Maria Santos', 'role' => 'player'];
const VISITOR = ['id' => 77, 'username' => 'guest@example.com', 'display_name' => 'Guest', 'role' => 'visitor'];

function save_completed_game(PDO $pdo, array $user, string $id, array $extra = []): void
{
    [$status] = save_game($pdo, $user, ['game' => $extra + [
        'id' => $id,
        'status' => 'completed',
        'type' => 'doubles',
        'teamA' => ['name' => 'Team A', 'score' => 11],
        'teamB' => ['name' => 'Team B', 'score' => 7],
        'winner' => 'A',
        'startedAt' => '2026-09-13T09:00:00Z',
        'endedAt' => '2026-09-13T09:20:00Z',
    ]]);
    expect_same(200, $status, "Game $id saved");
}

function test_250_completed_games_counts_oldest_game(PDO $pdo): void
{
    migrate($pdo);

    // Oldest game: Veteran wins game 1
    save_completed_game($pdo, STAFF, 'g_001_oldest', [
        'teamA' => ['name' => 'Old Guard', 'players' => ['Veteran', 'Partner'], 'score' => 11],
        'teamB' => ['name' => 'Challengers', 'players' => ['Rookie 1', 'Rookie 2'], 'score' => 2],
        'winner' => 'A',
        'startedAt' => '2026-01-01T08:00:00Z',
        'endedAt' => '2026-01-01T08:15:00Z',
    ]);

    // Games 2 to 250: played between other teams
    for ($i = 2; $i <= 250; $i++) {
        save_completed_game($pdo, STAFF, sprintf('g_%03d', $i), [
            'teamA' => ['name' => 'Club Alpha', 'score' => 11],
            'teamB' => ['name' => 'Club Beta', 'score' => 8],
            'winner' => 'A',
            'startedAt' => sprintf('2026-02-01T09:%02d:00Z', $i % 60),
            'endedAt' => sprintf('2026-02-01T09:%02d:00Z', ($i % 60) + 15),
        ]);
    }

    // Verify history caps at 200 and does NOT include the oldest game
    [$hStatus, $hPayload] = read_history($pdo, STAFF, ['limit' => '200']);
    expect_same(200, $hStatus, 'History returns 200 status');
    expect_same(200, count($hPayload['games']), 'History returns at most 200 games');
    $historyIds = array_column($hPayload['games'], 'id');
    expect_same(false, in_array('g_001_oldest', $historyIds, true), 'Oldest game is pushed out of history list');

    // Verify leaderboard counts ALL 250 games and includes the oldest game's players/teams
    [$status, $payload] = read_leaderboard($pdo, STAFF);
    expect_same(200, $status, 'Leaderboard status ok');
    expect_same(true, $payload['ok'], 'Leaderboard ok payload');
    expect_same(250, $payload['gamesCount'], 'Every single one of the 250 games is counted');

    $playerNames = array_column($payload['playerRows'], 'name');
    expect_same(true, in_array('Veteran', $playerNames, true), 'Oldest game player is counted in standings');

    $teamNames = array_column($payload['teamRows'], 'name');
    expect_same(true, in_array('Old Guard', $teamNames, true), 'Oldest game team is counted in standings');
}

function test_standings_ordering(PDO $pdo): void
{
    migrate($pdo);

    // 1. P_Wins has 3 wins
    for ($i = 1; $i <= 3; $i++) {
        save_completed_game($pdo, STAFF, "g_w_$i", [
            'teamA' => ['name' => 'Team W', 'players' => ['P_Wins'], 'score' => 11],
            'teamB' => ['name' => 'Team Other', 'players' => ['Other_1'], 'score' => 0],
            'winner' => 'A',
        ]);
    }

    // 2. P_Rate100 has 2 wins, 0 losses (100% win rate)
    for ($i = 1; $i <= 2; $i++) {
        save_completed_game($pdo, STAFF, "g_r100_$i", [
            'teamA' => ['name' => 'Team R100', 'players' => ['P_Rate100'], 'score' => 11],
            'teamB' => ['name' => 'Team Other', 'players' => ['Other_2'], 'score' => 0],
            'winner' => 'A',
        ]);
    }

    // 3. P_Rate50 has 2 wins, 2 losses (50% win rate, diff +10)
    save_completed_game($pdo, STAFF, 'g_r50_w1', ['teamA' => ['name' => 'R50', 'players' => ['P_Rate50'], 'score' => 11], 'teamB' => ['name' => 'X', 'players' => ['Other_3'], 'score' => 0], 'winner' => 'A']);
    save_completed_game($pdo, STAFF, 'g_r50_w2', ['teamA' => ['name' => 'R50', 'players' => ['P_Rate50'], 'score' => 11], 'teamB' => ['name' => 'X', 'players' => ['Other_3'], 'score' => 0], 'winner' => 'A']);
    save_completed_game($pdo, STAFF, 'g_r50_l1', ['teamA' => ['name' => 'R50', 'players' => ['P_Rate50'], 'score' => 5], 'teamB' => ['name' => 'X', 'players' => ['Other_3'], 'score' => 11], 'winner' => 'B']);
    save_completed_game($pdo, STAFF, 'g_r50_l2', ['teamA' => ['name' => 'R50', 'players' => ['P_Rate50'], 'score' => 5], 'teamB' => ['name' => 'X', 'players' => ['Other_3'], 'score' => 11], 'winner' => 'B']);

    // 4. P_DiffHigh has 1 win, 0 loss, diff +10 (11-1)
    save_completed_game($pdo, STAFF, 'g_dh', ['teamA' => ['name' => 'DH', 'players' => ['P_DiffHigh'], 'score' => 11], 'teamB' => ['name' => 'X', 'players' => ['Other_4'], 'score' => 1], 'winner' => 'A']);

    // 5. P_DiffLow has 1 win, 0 loss, diff +5 (11-6)
    save_completed_game($pdo, STAFF, 'g_dl', ['teamA' => ['name' => 'DL', 'players' => ['P_DiffLow'], 'score' => 11], 'teamB' => ['name' => 'X', 'players' => ['Other_5'], 'score' => 6], 'winner' => 'A']);

    // 6. P_MinHigh has 1 win, 0 loss, diff +2 (11-9), 40 min
    save_completed_game($pdo, STAFF, 'g_mh', [
        'teamA' => ['name' => 'MH', 'players' => ['P_MinHigh'], 'score' => 11],
        'teamB' => ['name' => 'X', 'players' => ['Other_6'], 'score' => 9],
        'winner' => 'A',
        'startedAt' => '2026-09-13T09:00:00Z',
        'endedAt' => '2026-09-13T09:40:00Z',
    ]);

    // 7. P_MinLow has 1 win, 0 loss, diff +2 (11-9), 10 min
    save_completed_game($pdo, STAFF, 'g_ml', [
        'teamA' => ['name' => 'ML', 'players' => ['P_MinLow'], 'score' => 11],
        'teamB' => ['name' => 'X', 'players' => ['Other_7'], 'score' => 9],
        'winner' => 'A',
        'startedAt' => '2026-09-13T09:00:00Z',
        'endedAt' => '2026-09-13T09:10:00Z',
    ]);

    // 8. P_PtsHigh has 1 win, 1 loss, diff 0, 30 min, points scored = 25 (15-13 win, 10-12 loss)
    save_completed_game($pdo, STAFF, 'g_ph_w', ['teamA' => ['name' => 'PH', 'players' => ['P_PtsHigh'], 'score' => 15], 'teamB' => ['name' => 'X', 'players' => ['Other_8'], 'score' => 13], 'winner' => 'A', 'startedAt' => '2026-09-13T09:00:00Z', 'endedAt' => '2026-09-13T09:15:00Z']);
    save_completed_game($pdo, STAFF, 'g_ph_l', ['teamA' => ['name' => 'PH', 'players' => ['P_PtsHigh'], 'score' => 10], 'teamB' => ['name' => 'X', 'players' => ['Other_8'], 'score' => 12], 'winner' => 'B', 'startedAt' => '2026-09-13T09:00:00Z', 'endedAt' => '2026-09-13T09:15:00Z']);

    // 9. P_PtsLow has 1 win, 1 loss, diff 0, 30 min, points scored = 20 (11-9 win, 9-11 loss)
    save_completed_game($pdo, STAFF, 'g_pl_w', ['teamA' => ['name' => 'PL', 'players' => ['P_PtsLow'], 'score' => 11], 'teamB' => ['name' => 'X', 'players' => ['Other_9'], 'score' => 9], 'winner' => 'A', 'startedAt' => '2026-09-13T09:00:00Z', 'endedAt' => '2026-09-13T09:15:00Z']);
    save_completed_game($pdo, STAFF, 'g_pl_l', ['teamA' => ['name' => 'PL', 'players' => ['P_PtsLow'], 'score' => 9], 'teamB' => ['name' => 'X', 'players' => ['Other_9'], 'score' => 11], 'winner' => 'B', 'startedAt' => '2026-09-13T09:00:00Z', 'endedAt' => '2026-09-13T09:15:00Z']);

    // 10. Tie on everything: Alphabetical tie-break ("Aaron" vs "Zack")
    save_completed_game($pdo, STAFF, 'g_aaron', ['teamA' => ['name' => 'AA', 'players' => ['Aaron'], 'score' => 11], 'teamB' => ['name' => 'X', 'players' => ['Other_10'], 'score' => 3], 'winner' => 'A', 'startedAt' => '2026-09-13T09:00:00Z', 'endedAt' => '2026-09-13T09:20:00Z']);
    save_completed_game($pdo, STAFF, 'g_zack', ['teamA' => ['name' => 'ZZ', 'players' => ['Zack'], 'score' => 11], 'teamB' => ['name' => 'X', 'players' => ['Other_11'], 'score' => 3], 'winner' => 'A', 'startedAt' => '2026-09-13T09:00:00Z', 'endedAt' => '2026-09-13T09:20:00Z']);

    [, $payload] = read_leaderboard($pdo, STAFF);
    $players = $payload['playerRows'];
    $rankOf = static function (string $name) use ($players): int {
        foreach ($players as $idx => $row) {
            if ($row['name'] === $name) {
                return $idx;
            }
        }
        return -1;
    };

    // 1. Most wins
    expect_same(true, $rankOf('P_Wins') < $rankOf('P_Rate100'), 'P_Wins (3 wins) ranks above P_Rate100 (2 wins)');
    // 2. Win rate
    expect_same(true, $rankOf('P_Rate100') < $rankOf('P_Rate50'), 'P_Rate100 (100% win rate) ranks above P_Rate50 (50% win rate)');
    // 3. Point difference
    expect_same(true, $rankOf('P_DiffHigh') < $rankOf('P_DiffLow'), 'P_DiffHigh (+10 diff) ranks above P_DiffLow (+5 diff)');
    // 4. Minutes played
    expect_same(true, $rankOf('P_MinHigh') < $rankOf('P_MinLow'), 'P_MinHigh (40 min) ranks above P_MinLow (10 min)');
    // 5. Points scored
    expect_same(true, $rankOf('P_PtsHigh') < $rankOf('P_PtsLow'), 'P_PtsHigh (25 pts) ranks above P_PtsLow (20 pts)');
    // 6. Name alphabetical
    expect_same(true, $rankOf('Aaron') < $rankOf('Zack'), 'Aaron ranks before Zack alphabetically on exact tie');
}

function test_each_viewer_leaderboard_counts_permitted_games(PDO $pdo): void
{
    migrate($pdo);

    // 1. Visitor game
    save_completed_game($pdo, VISITOR, 'g_vis_1', [
        'teamA' => ['name' => 'V1', 'players' => ['Vis Player 1'], 'score' => 11],
        'teamB' => ['name' => 'V2', 'players' => ['Vis Player 2'], 'score' => 5],
        'winner' => 'A',
    ]);
    save_completed_game($pdo, VISITOR, 'g_vis_2', [
        'teamA' => ['name' => 'V1', 'players' => ['Vis Player 1'], 'score' => 11],
        'teamB' => ['name' => 'V3', 'players' => ['Vis Player 3'], 'score' => 8],
        'winner' => 'A',
    ]);

    // 2. Player A game
    save_completed_game($pdo, STAFF, 'g_player_a', [
        'teamA' => ['name' => 'Pedro Team', 'players' => ['Pedro Reyes', 'Di'], 'score' => 11],
        'teamB' => ['name' => 'Other', 'players' => ['Other 1', 'Other 2'], 'score' => 4],
        'winner' => 'A',
    ]);

    // 3. Player B game
    save_completed_game($pdo, STAFF, 'g_player_b', [
        'teamA' => ['name' => 'Maria Team', 'players' => ['Maria Santos', 'Di'], 'score' => 11],
        'teamB' => ['name' => 'Other', 'players' => ['Other 1', 'Other 2'], 'score' => 6],
        'winner' => 'A',
    ]);

    // 4. Staff-only game
    save_completed_game($pdo, STAFF, 'g_staff_only', [
        'teamA' => ['name' => 'Admin Team', 'players' => ['Court Admin'], 'score' => 11],
        'teamB' => ['name' => 'Other Team', 'players' => ['Other 3'], 'score' => 9],
        'winner' => 'A',
    ]);

    // Visitor sees only visitor games (2 games)
    [, $vPayload] = read_leaderboard($pdo, VISITOR);
    expect_same(2, $vPayload['gamesCount'], 'Visitor leaderboard counts visitor games only');
    expect_same(['Vis Player 1', 'Vis Player 3', 'Vis Player 2'], array_column($vPayload['playerRows'], 'name'), 'Visitor standings include only visitor players');

    // Player A sees only their games (1 game)
    $playerA = PLAYER_A + ['player_id' => (int)find_or_create_player($pdo, 'Pedro Reyes')['id']];
    [, $paPayload] = read_leaderboard($pdo, $playerA);
    expect_same(1, $paPayload['gamesCount'], 'Player A leaderboard counts their games only');
    expect_same(['Di', 'Pedro Reyes', 'Other 1', 'Other 2'], array_column($paPayload['playerRows'], 'name'), 'Player A standings include only participants of their games');

    // Player B sees only their games (1 game)
    $playerB = PLAYER_B + ['player_id' => (int)find_or_create_player($pdo, 'Maria Santos')['id']];
    [, $pbPayload] = read_leaderboard($pdo, $playerB);
    expect_same(1, $pbPayload['gamesCount'], 'Player B leaderboard counts their games only');

    // Staff sees all 3 non-visitor games
    [, $sPayload] = read_leaderboard($pdo, STAFF);
    expect_same(3, $sPayload['gamesCount'], 'Staff leaderboard counts all non-visitor games');

    // Signed-out sees all 3 non-visitor games
    [, $anonPayload] = read_leaderboard($pdo, null);
    expect_same(3, $anonPayload['gamesCount'], 'Signed-out leaderboard counts all non-visitor games');
}

function test_event_scope_counts_only_that_events_tournament_matches(PDO $pdo): void
{
    migrate($pdo);
    require_once __DIR__ . '/../api/tournaments.php';
    foreach (['summer' => 'Summer Open', 'fall' => 'Fall Classic'] as $id => $name) {
        save_tournament($pdo, ['id' => 999, 'username' => 'super', 'display_name' => 'Super', 'role' => 'super_admin'], ['intent' => 'schedule-update', 'tournament' => [
            'id' => $id, 'name' => $name, 'courts' => 1, 'matches' => [['id' => 'm1', 'round' => 1, 'court' => 1, 'status' => 'scheduled']],
        ]]);
    }
    set_current_event_id($pdo, 'fall');

    save_completed_game($pdo, STAFF, 'g_summer', ['teamA' => ['name' => 'S', 'players' => ['Sam'], 'score' => 11], 'tournamentMatch' => ['tournamentId' => 'summer', 'matchId' => 'm1']]);
    save_completed_game($pdo, STAFF, 'g_fall', ['teamA' => ['name' => 'F', 'players' => ['Fay'], 'score' => 11], 'tournamentMatch' => ['tournamentId' => 'fall', 'matchId' => 'm1']]);
    save_completed_game($pdo, STAFF, 'g_standard', ['teamA' => ['name' => 'Std', 'players' => ['Stan'], 'score' => 11]]);

    [, $all] = read_leaderboard($pdo, STAFF);
    expect_same(3, $all['gamesCount'], 'Without an Event scope every finished Match counts');
    expect_same(false, array_key_exists('event', $all), 'Unscoped response names no Event');

    [, $current] = read_leaderboard($pdo, STAFF, ['event' => 'current']);
    expect_same(1, $current['gamesCount'], 'event=current counts only the Current Event Matches');
    expect_same(['id' => 'fall', 'name' => 'Fall Classic'], $current['event'], 'Scoped response names the Event');
    expect_same(true, in_array('Fay', array_column($current['playerRows'], 'name'), true), 'Current Event standings include its Players');
    expect_same(false, in_array('Stan', array_column($current['playerRows'], 'name'), true), 'Standard Matches are excluded from an Event scope');

    [, $summer] = read_leaderboard($pdo, STAFF, ['event' => 'summer']);
    expect_same(['Sam'], array_values(array_intersect(array_column($summer['playerRows'], 'name'), ['Sam', 'Fay'])), 'An explicit Event id scopes to that Event');

    $fay = ['id' => 44, 'username' => 'fay', 'display_name' => 'Fay', 'role' => 'player', 'player_id' => (int)find_or_create_player($pdo, 'Fay')['id']];
    [, $own] = read_leaderboard($pdo, $fay, ['event' => 'current']);
    expect_same(1, $own['gamesCount'], 'A Player still sees only their own Matches within the Event');
    [, $ownSummer] = read_leaderboard($pdo, $fay, ['event' => 'summer']);
    expect_same(0, $ownSummer['gamesCount'], 'A Player sees none of another Event\'s Matches they were not in');
}

run_db_tests([
    'test_250_completed_games_counts_oldest_game',
    'test_standings_ordering',
    'test_each_viewer_leaderboard_counts_permitted_games',
    'test_event_scope_counts_only_that_events_tournament_matches',
]);
