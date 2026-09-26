<?php
declare(strict_types=1);

// Player rename handler test, no web server needed:
//   php tests/rename_player_test.php
// Database setup: see tests/test_db.php.

require_once __DIR__ . '/test_db.php';
require_once __DIR__ . '/../api/games.php';
require_once __DIR__ . '/../api/tournaments.php';
require_once __DIR__ . '/../api/qlik/matches.php';
require_once __DIR__ . '/../api/qlik/leaderboard.php';

function rename_user(string $role): array
{
    return ['id' => 3, 'username' => "{$role}_user", 'display_name' => ucfirst($role), 'role' => $role];
}

function stored_game_json(PDO $pdo, string $gameId): array
{
    $statement = $pdo->prepare("SELECT game_json FROM games WHERE id = :id");
    $statement->execute([':id' => $gameId]);
    return json_decode((string)$statement->fetchColumn(), true) ?: [];
}

function test_only_staff_can_rename_a_player(PDO $pdo): void
{
    migrate($pdo);
    $playerId = (int)find_or_create_player($pdo, 'Jomar Ebonite')['id'];

    foreach (['player', 'visitor'] as $role) {
        [$status] = rename_player($pdo, rename_user($role), $playerId, 'Jom Ebonite');
        expect_same(403, $status, "A $role cannot rename a Player");
    }
    [$status] = rename_player($pdo, null, $playerId, 'Jom Ebonite');
    expect_same(401, $status, 'A signed-out request cannot rename a Player');
    expect_same('Jomar Ebonite', find_player_by_id($pdo, $playerId)['name'], 'The refused attempts changed nothing');

    foreach (['admin', 'super_admin'] as $role) {
        [$status, $payload] = rename_player($pdo, rename_user($role), $playerId, "Renamed by $role");
        expect_same(200, $status, "An $role can rename a Player");
        expect_same("Renamed by $role", $payload['player']['name'], 'The new name is returned');
    }
}

function test_rename_refuses_a_collision_and_allows_case_or_spacing_only(PDO $pdo): void
{
    migrate($pdo);
    $ana = (int)find_or_create_player($pdo, 'Ana')['id'];
    find_or_create_player($pdo, 'Ben');

    [$status, $payload] = rename_player($pdo, rename_user('admin'), $ana, '  ben  ');
    expect_same(409, $status, 'Renaming to another Player\'s name (ignoring case and spacing) is refused');
    expect_same(true, str_contains($payload['error'], 'merge'), 'The refusal suggests a Merge: ' . $payload['error']);
    expect_same('Ana', find_player_by_id($pdo, $ana)['name'], 'The refused rename changed nothing');

    [$status, $payload] = rename_player($pdo, rename_user('admin'), $ana, 'ANA');
    expect_same(200, $status, 'A case-only change is allowed');
    expect_same('ANA', $payload['player']['name'], 'The new casing is stored');
    expect_same(2, (int)$pdo->query("SELECT COUNT(*) FROM players")->fetchColumn(), 'Still only two Players exist');

    [$status] = rename_player($pdo, rename_user('admin'), $ana, '');
    expect_same(400, $status, 'A blank name is refused');
}

function test_rename_updates_game_players_and_the_stored_game_json(PDO $pdo): void
{
    migrate($pdo);
    [$status] = save_game($pdo, rename_user('admin'), ['game' => [
        'id' => 'g_doubles',
        'teamA' => ['name' => 'Jomar Ebonite / Di', 'score' => 11],
        'teamB' => ['name' => 'Cy / Bo', 'score' => 9],
        'winner' => 'A',
    ]]);
    expect_same(200, $status, 'The doubles Match is saved');
    $jomar = (int)find_or_create_player($pdo, 'Jomar Ebonite')['id'];

    [$status, $payload] = rename_player($pdo, rename_user('admin'), $jomar, 'Jom Ebonite');
    expect_same(200, $status, 'The rename succeeds');

    $playerNameStmt = $pdo->prepare("SELECT player_name FROM game_players WHERE player_id = :id");
    $playerNameStmt->execute([':id' => $jomar]);
    expect_same('Jom Ebonite', $playerNameStmt->fetchColumn(), 'game_players.player_name is updated');

    $game = stored_game_json($pdo, 'g_doubles');
    expect_same('Jom Ebonite / Di', $game['teamA']['name'] ?? null, 'The stored Game JSON team name is rewritten');

    $row = $pdo->query("SELECT team_a_name, winner_name FROM games WHERE id = 'g_doubles'")->fetch(PDO::FETCH_ASSOC);
    expect_same('Jom Ebonite / Di', $row['team_a_name'], 'team_a_name is rederived from the renamed team');
    expect_same('Jom Ebonite / Di', $row['winner_name'], 'winner_name follows the winning team\'s new name');

    [, $historyPayload] = read_history($pdo, rename_user('admin'), []);
    expect_same('Jom Ebonite / Di', $historyPayload['games'][0]['teamA']['name'] ?? null, 'History serves the renamed Game JSON');

    [$lbStatus, $lbPayload] = read_leaderboard($pdo, rename_user('admin'), []);
    expect_same(200, $lbStatus, 'Leaderboard succeeds');
    $teamNames = array_column($lbPayload['teamRows'], 'name');
    expect_same(true, in_array('Jom Ebonite / Di', $teamNames, true), 'Leaderboard teamRows reflects renamed doubles partnership');
    expect_same(false, in_array('Jomar Ebonite / Di', $teamNames, true), 'Leaderboard teamRows no longer has old partnership name');
}

function test_rename_updates_every_events_roster_and_schedule(PDO $pdo): void
{
    migrate($pdo);
    putenv('ANALYTICS_KEY=test-analytics-key');

    save_game($pdo, rename_user('admin'), ['game' => [
        'id' => 'g_seed',
        'teamA' => ['name' => 'Jomar Ebonite', 'score' => 11],
        'teamB' => ['name' => 'Someone Else', 'score' => 9],
        'winner' => 'A',
    ]]);
    $jomar = (int)find_or_create_player($pdo, 'Jomar Ebonite')['id'];

    [$status] = save_tournament($pdo, rename_user('super_admin'), ['intent' => 'schedule-update', 'tournament' => [
        'id' => 'open_play',
        'playersText' => "Jomar Ebonite, Partner One\nSomeone Else",
        'matches' => [
            ['id' => 'm1', 'court' => 1, 'status' => 'scheduled', 'teamA' => ['Jomar Ebonite', 'Partner One'], 'teamB' => ['Someone Else', 'Other']],
        ],
    ]]);
    expect_same(200, $status, 'The current Event Tournament is saved');

    // A past Event, whose Schedule Qlik still reads for its all-time analytics.
    $pdo->prepare("INSERT INTO tournaments (id, name, tournament_json) VALUES ('summer_2025', 'Summer 2025', :json)")
        ->execute([':json' => json_encode(['id' => 'summer_2025', 'playersText' => 'Jomar Ebonite'], JSON_UNESCAPED_SLASHES)]);
    $pdo->prepare("INSERT INTO tournament_matches (tournament_id, id, team_a, team_b) VALUES ('summer_2025', 'past_m1', :team_a, :team_b)")
        ->execute([':team_a' => json_encode(['Jomar Ebonite', 'Old Partner'], JSON_UNESCAPED_SLASHES), ':team_b' => json_encode(['X', 'Y'], JSON_UNESCAPED_SLASHES)]);

    [$status] = rename_player($pdo, rename_user('admin'), $jomar, 'Jom Ebonite');
    expect_same(200, $status, 'The rename succeeds');

    [, $tournamentPayload] = read_tournament($pdo, ['id' => 'open_play']);
    expect_same(true, str_contains($tournamentPayload['tournament']['playersText'], 'Jom Ebonite'), 'The current Event roster is renamed');
    expect_same(false, str_contains($tournamentPayload['tournament']['playersText'], 'Jomar Ebonite'), 'The old name no longer appears in the roster');
    $match = $tournamentPayload['tournament']['matches'][0];
    expect_same(['Jom Ebonite', 'Partner One'], $match['teamA'], 'The current Event Schedule is renamed');

    $pastRow = $pdo->query("SELECT team_a FROM tournament_matches WHERE id = 'past_m1'")->fetch(PDO::FETCH_ASSOC);
    expect_same(['Jom Ebonite', 'Old Partner'], json_decode((string)$pastRow['team_a'], true), 'A past Event\'s Schedule is renamed too, for Qlik');
    $pastTournamentJson = $pdo->query("SELECT tournament_json FROM tournaments WHERE id = 'summer_2025'")->fetchColumn();
    expect_same('Jom Ebonite', json_decode((string)$pastTournamentJson, true)['playersText'], 'A past Event\'s roster is renamed too');

    // Qlik matches endpoint returns new name for both past and current matches
    [$qlikStatus, $qlikPayload] = read_qlik_matches($pdo, 'test-analytics-key');
    expect_same(200, $qlikStatus, 'Qlik matches endpoint succeeds');
    $m1Matches = array_values(array_filter($qlikPayload['rows'], fn($r) => $r['matchId'] === 'm1'));
    expect_same(['Jom Ebonite', 'Partner One'], $m1Matches[0]['teamA'], 'Qlik matches returns renamed player for current event');
    $pastMatches = array_values(array_filter($qlikPayload['rows'], fn($r) => $r['matchId'] === 'past_m1'));
    expect_same(['Jom Ebonite', 'Old Partner'], $pastMatches[0]['teamA'], 'Qlik matches returns renamed player for past event');

    // Qlik leaderboard players endpoint
    [$qlikLbStatus, $qlikLbPayload] = read_qlik_leaderboard_players($pdo, 'test-analytics-key');
    expect_same(200, $qlikLbStatus, 'Qlik leaderboard players endpoint succeeds');
    $playerNames = array_column($qlikLbPayload['rows'], 'playerName');
    expect_same(true, in_array('Jom Ebonite', $playerNames, true), 'Qlik leaderboard players includes new name');
    expect_same(false, in_array('Jomar Ebonite', $playerNames, true), 'Qlik leaderboard players excludes old name');

    // Leaderboard playerRows reflects new name
    [$lbStatus, $lbPayload] = read_leaderboard($pdo, rename_user('admin'), []);
    expect_same(200, $lbStatus, 'Leaderboard endpoint succeeds');
    $lbPlayerNames = array_column($lbPayload['playerRows'], 'name');
    expect_same(true, in_array('Jom Ebonite', $lbPlayerNames, true), 'Leaderboard playerRows includes new name');
    expect_same(false, in_array('Jomar Ebonite', $lbPlayerNames, true), 'Leaderboard playerRows excludes old name');
}

function test_an_in_progress_match_keeps_its_player_link_through_a_rename(PDO $pdo): void
{
    migrate($pdo);
    $game = ['game' => [
        'id' => 'g_live',
        'status' => 'in_progress',
        'teamA' => ['name' => 'Jomar Ebonite / Di', 'score' => 4],
        'teamB' => ['name' => 'Cy / Bo', 'score' => 2],
        'winner' => null,
        'targetScore' => 11,
    ]];
    [$status] = save_game($pdo, rename_user('admin'), $game);
    expect_same(200, $status, 'The in-progress Match is first saved');
    $jomar = (int)find_or_create_player($pdo, 'Jomar Ebonite')['id'];

    [$status] = rename_player($pdo, rename_user('admin'), $jomar, 'Jom Ebonite');
    expect_same(200, $status, 'Jomar Ebonite is renamed mid-Match');

    // The Scoreboard hasn't refreshed: it resaves the same Match with the score updated, still
    // typing the old, now-unmatched name.
    $game['game']['teamA']['score'] = 6;
    [$status] = save_game($pdo, rename_user('admin'), $game);
    expect_same(200, $status, 'The Match saves again under the old, now-stale name');

    $playerCount = (int)$pdo->query("SELECT COUNT(*) FROM players WHERE normalized_name = 'jomar ebonite'")->fetchColumn();
    expect_same(0, $playerCount, 'No phantom Player is created for the stale name');

    $linkedPlayerId = $pdo->prepare("SELECT player_id FROM game_players WHERE game_id = 'g_live' AND player_name = 'Jomar Ebonite'");
    $linkedPlayerId->execute();
    expect_same($jomar, (int)$linkedPlayerId->fetchColumn(), 'The Match keeps its link to the renamed Player');
}

run_db_tests([
    'test_only_staff_can_rename_a_player',
    'test_rename_refuses_a_collision_and_allows_case_or_spacing_only',
    'test_rename_updates_game_players_and_the_stored_game_json',
    'test_rename_updates_every_events_roster_and_schedule',
    'test_an_in_progress_match_keeps_its_player_link_through_a_rename',
]);
