<?php
declare(strict_types=1);

// Player merge handler test, no web server needed:
//   php tests/merge_players_test.php
// Database setup: see tests/test_db.php.

require_once __DIR__ . '/test_db.php';
require_once __DIR__ . '/../api/players.php';
require_once __DIR__ . '/../api/games.php';
require_once __DIR__ . '/../api/tournaments.php';
require_once __DIR__ . '/../api/qlik/matches.php';
require_once __DIR__ . '/../api/qlik/leaderboard.php';

function merge_test_user(string $role): array
{
    return ['id' => 3, 'username' => "{$role}_user", 'display_name' => ucfirst($role), 'role' => $role];
}

function test_only_staff_can_merge_players(PDO $pdo): void
{
    migrate($pdo);
    $p1 = (int)find_or_create_player($pdo, 'Jomar E.')['id'];
    $p2 = (int)find_or_create_player($pdo, 'Jomar Ebonite')['id'];

    foreach (['player', 'visitor'] as $role) {
        [$status] = merge_players($pdo, merge_test_user($role), $p2, $p1);
        expect_same(403, $status, "A $role cannot merge Players");
    }

    [$status] = merge_players($pdo, null, $p2, $p1);
    expect_same(401, $status, 'A signed-out request cannot merge Players');

    [$status] = merge_players($pdo, merge_test_user('admin'), 99999, $p1);
    expect_same(404, $status, 'Non-existent survivor returns 404');

    [$status] = merge_players($pdo, merge_test_user('admin'), $p2, 99999);
    expect_same(404, $status, 'Non-existent absorbed returns 404');

    [$status] = merge_players($pdo, merge_test_user('admin'), $p2, $p2);
    expect_same(400, $status, 'Merging a Player into themselves returns 400');

    foreach (['admin', 'super_admin'] as $role) {
        $sub1 = (int)find_or_create_player($pdo, "Sub 1 $role")['id'];
        $sub2 = (int)find_or_create_player($pdo, "Sub 2 $role")['id'];
        [$status, $payload] = merge_players($pdo, merge_test_user($role), $sub2, $sub1);
        expect_same(200, $status, "A $role can merge Players");
        expect_same(true, $payload['ok'], "Payload reports ok: true");
    }
}

function test_merge_refusals_accounts_and_same_match(PDO $pdo): void
{
    migrate($pdo);
    $admin = merge_test_user('admin');

    // 1. Refusal when both Players have linked accounts
    $p1 = (int)find_or_create_player($pdo, 'Player One')['id'];
    $p2 = (int)find_or_create_player($pdo, 'Player Two')['id'];

    $pdo->prepare("INSERT INTO users (username, display_name, role, password_hash, player_id) VALUES ('u1', 'Player One', 'player', 'hash', :p1)")
        ->execute([':p1' => $p1]);
    $pdo->prepare("INSERT INTO users (username, display_name, role, password_hash, player_id) VALUES ('u2', 'Player Two', 'player', 'hash', :p2)")
        ->execute([':p2' => $p2]);

    [$status, $payload] = merge_players($pdo, $admin, $p1, $p2);
    expect_same(400, $status, 'Merging two Players who both have linked accounts is refused');
    expect_same(true, str_contains(strtolower($payload['error'] ?? ''), 'unlink one first'), 'Refusal mentions to unlink one first: ' . ($payload['error'] ?? ''));

    // Unlink one account: should no longer be refused for account reasons
    $pdo->prepare("UPDATE users SET player_id = NULL WHERE username = 'u2'")->execute();

    // 2. Refusal when both Players appear in the same Match in games
    save_game($pdo, $admin, ['game' => [
        'id' => 'g_rivals',
        'teamA' => ['name' => 'Player One', 'score' => 11],
        'teamB' => ['name' => 'Player Two', 'score' => 7],
        'winner' => 'A',
    ]]);

    [$status, $payload] = merge_players($pdo, $admin, $p1, $p2);
    expect_same(400, $status, 'Merging two Players who appear in the same Match (games) is refused');
    expect_same(true, str_contains(strtolower($payload['error'] ?? ''), 'same match'), 'Refusal mentions same Match: ' . ($payload['error'] ?? ''));

    // 3. Refusal when both Players appear in the same Match in tournament_matches (even if not yet in games)
    $t1 = (int)find_or_create_player($pdo, 'Tourney Alpha')['id'];
    $t2 = (int)find_or_create_player($pdo, 'Tourney Beta')['id'];

    $pdo->prepare("INSERT INTO tournaments (id, name, tournament_json) VALUES ('tourney_test', 'Test Tourney', '{}')")->execute();
    $pdo->prepare("INSERT INTO tournament_matches (tournament_id, id, team_a, team_b) VALUES ('tourney_test', 'tm_1', :team_a, :team_b)")
        ->execute([
            ':team_a' => json_encode(['Tourney Alpha', 'Partner'], JSON_UNESCAPED_SLASHES),
            ':team_b' => json_encode(['Tourney Beta', 'Opponent'], JSON_UNESCAPED_SLASHES),
        ]);

    [$status, $payload] = merge_players($pdo, $admin, $t1, $t2);
    expect_same(400, $status, 'Merging two Players who appear in the same tournament match is refused');
    expect_same(true, str_contains(strtolower($payload['error'] ?? ''), 'same match'), 'Refusal mentions same match: ' . ($payload['error'] ?? ''));
}

function test_merge_moves_matches_skill_and_account_to_survivor(PDO $pdo): void
{
    migrate($pdo);
    $admin = merge_test_user('admin');

    // Case 1: Unrated survivor takes absorbed Player's skill level; matches move; linked account moves
    $absorbed = (int)find_or_create_player($pdo, 'Jomar E.')['id'];
    $survivor = (int)find_or_create_player($pdo, 'Jomar Ebonite')['id'];

    // Absorbed has intermediate skill; survivor is unrated (null)
    $pdo->prepare("UPDATE players SET skill_level = 'intermediate' WHERE id = :id")->execute([':id' => $absorbed]);

    // Absorbed has a linked account; survivor does not
    $pdo->prepare("INSERT INTO users (username, display_name, role, password_hash, player_id) VALUES ('jomar_acc', 'Jomar E.', 'player', 'hash', :id)")
        ->execute([':id' => $absorbed]);

    // Absorbed played in g_absorbed; survivor played in g_survivor
    save_game($pdo, $admin, ['game' => [
        'id' => 'g_absorbed',
        'teamA' => ['name' => 'Jomar E.', 'score' => 11],
        'teamB' => ['name' => 'Other Guy', 'score' => 5],
        'winner' => 'A',
    ]]);
    save_game($pdo, $admin, ['game' => [
        'id' => 'g_survivor',
        'teamA' => ['name' => 'Jomar Ebonite', 'score' => 11],
        'teamB' => ['name' => 'Third Guy', 'score' => 8],
        'winner' => 'A',
    ]]);

    [$status, $payload] = merge_players($pdo, $admin, $survivor, $absorbed);
    expect_same(200, $status, 'Merge succeeds');
    expect_same(true, $payload['ok'], 'Payload indicates success');
    expect_same('Jomar Ebonite', $payload['survivor']['name'], 'Survivor name returned');
    expect_same('intermediate', $payload['survivor']['skillLevel'], 'Unrated survivor takes absorbed skill level');

    // Absorbed player record is deleted
    expect_same(null, find_player_by_id($pdo, $absorbed), 'Absorbed Player is deleted from players table');

    // Survivor kept in players table with updated skill level
    $survivorDb = find_player_by_id($pdo, $survivor);
    expect_same('intermediate', $survivorDb['skill_level'], 'Survivor skill level is stored as intermediate in DB');

    // game_players for g_absorbed points to survivor
    $gpStmt = $pdo->prepare("SELECT player_id, player_name FROM game_players WHERE game_id = 'g_absorbed' AND team = 'A'");
    $gpStmt->execute();
    $gpRow = $gpStmt->fetch(PDO::FETCH_ASSOC);
    expect_same($survivor, (int)$gpRow['player_id'], 'g_absorbed game_players.player_id now points to survivor');
    expect_same('Jomar Ebonite', $gpRow['player_name'], 'g_absorbed game_players.player_name updated to survivor name');

    // Linked user account moved to survivor
    $userPlayerId = $pdo->query("SELECT player_id FROM users WHERE username = 'jomar_acc'")->fetchColumn();
    expect_same($survivor, (int)$userPlayerId, 'User account now linked to survivor player_id');

    // list_players verifies survivor has combined matches and account, absorbed is absent
    [$listStatus, $listPayload] = list_players($pdo, $admin);
    expect_same(200, $listStatus, 'list_players succeeds');
    $playerListMap = array_column($listPayload['players'], null, 'id');
    expect_same(false, isset($playerListMap[$absorbed]), 'Absorbed player not in list_players');
    expect_same(true, isset($playerListMap[$survivor]), 'Survivor in list_players');
    expect_same(2, $playerListMap[$survivor]['matchCount'], 'Survivor matchCount combines both matches');
    expect_same(true, $playerListMap[$survivor]['hasAccount'], 'Survivor hasAccount is true from moved account');
    expect_same('intermediate', $playerListMap[$survivor]['skillLevel'], 'Survivor skillLevel in list_players is intermediate');

    // Case 2: Survivor with skill level keeps their own level
    $ratedSurvivor = (int)find_or_create_player($pdo, 'Rated Survivor')['id'];
    $otherAbsorbed = (int)find_or_create_player($pdo, 'Other Absorbed')['id'];
    $pdo->prepare("UPDATE players SET skill_level = 'advanced' WHERE id = :id")->execute([':id' => $ratedSurvivor]);
    $pdo->prepare("UPDATE players SET skill_level = 'beginner' WHERE id = :id")->execute([':id' => $otherAbsorbed]);

    [$status2, $payload2] = merge_players($pdo, $admin, $ratedSurvivor, $otherAbsorbed);
    expect_same(200, $status2, 'Merge with rated survivor succeeds');
    expect_same('advanced', $payload2['survivor']['skillLevel'], 'Survivor keeps their own skill level');
    $survivorDb2 = find_player_by_id($pdo, $ratedSurvivor);
    expect_same('advanced', $survivorDb2['skill_level'], 'Survivor maintains advanced skill level in DB');
}

function test_merge_propagates_to_games_tournaments_leaderboard_and_qlik(PDO $pdo): void
{
    migrate($pdo);
    putenv('ANALYTICS_KEY=test-analytics-key');
    $admin = merge_test_user('admin');

    $absorbed = (int)find_or_create_player($pdo, 'Jomar E.')['id'];
    $survivor = (int)find_or_create_player($pdo, 'Jomar Ebonite')['id'];
    find_or_create_player($pdo, 'Di');
    find_or_create_player($pdo, 'Cy');
    find_or_create_player($pdo, 'Bo');

    // 1. Two matches with Di as partner
    save_game($pdo, $admin, ['game' => [
        'id' => 'g_match_1',
        'teamA' => ['name' => 'Jomar E. / Di', 'score' => 11],
        'teamB' => ['name' => 'Cy / Bo', 'score' => 7],
        'winner' => 'A',
    ]]);
    save_game($pdo, $admin, ['game' => [
        'id' => 'g_match_2',
        'teamA' => ['name' => 'Jomar Ebonite / Di', 'score' => 11],
        'teamB' => ['name' => 'Cy / Bo', 'score' => 9],
        'winner' => 'A',
    ]]);

    // 2. Tournament with roster and schedule
    save_tournament($pdo, merge_test_user('super_admin'), ['intent' => 'schedule-update', 'tournament' => [
        'id' => 'open_play',
        'playersText' => "Jomar E., Jomar Ebonite\nDi\nCy\nBo",
        'matches' => [
            ['id' => 'm_live', 'court' => 1, 'status' => 'scheduled', 'teamA' => ['Jomar E.', 'Di'], 'teamB' => ['Cy', 'Bo']],
        ],
    ]]);

    // Past tournament
    $pdo->prepare("INSERT INTO tournaments (id, name, tournament_json) VALUES ('past_event', 'Past Event', :json)")
        ->execute([':json' => json_encode(['id' => 'past_event', 'playersText' => 'Jomar E.'], JSON_UNESCAPED_SLASHES)]);
    $pdo->prepare("INSERT INTO tournament_matches (tournament_id, id, team_a, team_b) VALUES ('past_event', 'past_m', :team_a, :team_b)")
        ->execute([
            ':team_a' => json_encode(['Jomar E.', 'Old Partner'], JSON_UNESCAPED_SLASHES),
            ':team_b' => json_encode(['X', 'Y'], JSON_UNESCAPED_SLASHES),
        ]);

    // An Event naming only the survivor keeps its roster exactly as typed, even its own duplicates
    $pdo->prepare("INSERT INTO tournaments (id, name, tournament_json) VALUES ('other_event', 'Other Event', :json)")
        ->execute([':json' => json_encode(['id' => 'other_event', 'playersText' => 'Jomar Ebonite, Cy, Cy'], JSON_UNESCAPED_SLASHES)]);

    // Perform Merge
    [$status] = merge_players($pdo, $admin, $survivor, $absorbed);
    expect_same(200, $status, 'Merge succeeds');

    $otherRoster = json_decode((string)$pdo->query("SELECT tournament_json FROM tournaments WHERE id = 'other_event'")->fetchColumn(), true)['playersText'];
    expect_same('Jomar Ebonite, Cy, Cy', $otherRoster, 'Merge leaves unrelated rosters untouched');

    // History check: both matches now have survivor's name
    [, $historyPayload] = read_history($pdo, $admin, []);
    foreach ($historyPayload['games'] as $g) {
        expect_same('Jomar Ebonite / Di', $g['teamA']['name'], 'History shows survivor in teamA');
        expect_same(false, str_contains(json_encode($g), 'Jomar E.'), 'Absorbed name absent from History');
    }

    // Leaderboard check: Player rows and Partnerships (Team rows)
    [, $lbPayload] = read_leaderboard($pdo, $admin, []);

    // Player row: survivor should have 2 wins/matches
    $playerRowMap = [];
    foreach ($lbPayload['playerRows'] as $row) {
        $playerRowMap[$row['name']] = $row;
    }
    expect_same(true, isset($playerRowMap['Jomar Ebonite']), 'Survivor appears in Leaderboard player rows');
    expect_same(false, isset($playerRowMap['Jomar E.']), 'Absorbed player does not appear in Leaderboard player rows');
    expect_same(2, (int)$playerRowMap['Jomar Ebonite']['games'], 'Survivor has 2 total matches in Leaderboard');
    expect_same(2, (int)$playerRowMap['Jomar Ebonite']['wins'], 'Survivor has 2 total wins in Leaderboard');

    // Team row (Partnerships): 'Jomar Ebonite / Di' should have 2 wins/matches
    $teamRowMap = [];
    foreach ($lbPayload['teamRows'] as $row) {
        $teamRowMap[$row['name']] = $row;
    }
    expect_same(true, isset($teamRowMap['Jomar Ebonite / Di']), 'Survivor partnership appears in Leaderboard team rows');
    expect_same(false, isset($teamRowMap['Jomar E. / Di']), 'Absorbed partnership does not appear in Leaderboard team rows');
    expect_same(2, (int)$teamRowMap['Jomar Ebonite / Di']['games'], 'Partnership includes absorbed Player matches (2 total)');

    // Tournament check: current event roster and schedule
    [, $tourneyPayload] = read_tournament($pdo, ['id' => 'open_play']);
    $roster = $tourneyPayload['tournament']['playersText'];
    expect_same("Jomar Ebonite\nDi\nCy\nBo", $roster, 'Survivor listed once in the roster, the rest as typed');
    $scheduledMatch = $tourneyPayload['tournament']['matches'][0];
    expect_same(['Jomar Ebonite', 'Di'], $scheduledMatch['teamA'], 'Current event schedule has survivor');

    // Past tournament check
    $pastMatchRow = $pdo->query("SELECT team_a FROM tournament_matches WHERE id = 'past_m'")->fetch(PDO::FETCH_ASSOC);
    expect_same(['Jomar Ebonite', 'Old Partner'], json_decode((string)$pastMatchRow['team_a'], true), 'Past tournament match has survivor');

    // Qlik matches endpoint
    [$qlikStatus, $qlikPayload] = read_qlik_matches($pdo, 'test-analytics-key');
    expect_same(200, $qlikStatus, 'Qlik matches endpoint succeeds');
    foreach ($qlikPayload['rows'] as $qRow) {
        if ($qRow['matchId'] === 'm_live') {
            expect_same(['Jomar Ebonite', 'Di'], $qRow['teamA'], 'Qlik matches has survivor for current tournament match');
        }
        if ($qRow['matchId'] === 'past_m') {
            expect_same(['Jomar Ebonite', 'Old Partner'], $qRow['teamA'], 'Qlik matches has survivor for past tournament match');
        }
    }

    // Qlik leaderboard players endpoint
    [$qlikLbStatus, $qlikLbPayload] = read_qlik_leaderboard_players($pdo, 'test-analytics-key');
    expect_same(200, $qlikLbStatus, 'Qlik leaderboard players endpoint succeeds');
    $qlikPlayerNames = array_column($qlikLbPayload['rows'], 'playerName');
    expect_same(true, in_array('Jomar Ebonite', $qlikPlayerNames, true), 'Qlik leaderboard includes survivor');
    expect_same(false, in_array('Jomar E.', $qlikPlayerNames, true), 'Qlik leaderboard excludes absorbed player');
}

function test_merge_handles_accented_names_in_events(PDO $pdo): void
{
    migrate($pdo);
    $admin = merge_test_user('admin');

    $absorbed = (int)find_or_create_player($pdo, 'Peñaflor')['id'];
    $survivor = (int)find_or_create_player($pdo, 'Ana Peñaflor')['id'];
    save_tournament($pdo, merge_test_user('super_admin'), ['intent' => 'schedule-update', 'tournament' => [
        'id' => 'open_play',
        'playersText' => "Peñaflor\nDi\nCy\nBo",
        'matches' => [
            ['id' => 'm_1', 'court' => 1, 'status' => 'scheduled', 'teamA' => ['Peñaflor', 'Di'], 'teamB' => ['Cy', 'Bo']],
        ],
    ]]);

    [$status] = merge_players($pdo, $admin, $survivor, $absorbed);
    expect_same(200, $status, 'Merge of accented names succeeds');

    [, $tourneyPayload] = read_tournament($pdo, ['id' => 'open_play']);
    expect_same("Ana Peñaflor\nDi\nCy\nBo", $tourneyPayload['tournament']['playersText'], 'Accented absorbed name replaced in roster');
    expect_same(['Ana Peñaflor', 'Di'], $tourneyPayload['tournament']['matches'][0]['teamA'], 'Accented absorbed name replaced in Schedule');

    // Two accented Players scheduled in the same Match cannot be merged
    $x = (int)find_or_create_player($pdo, 'Niño')['id'];
    $y = (int)find_or_create_player($pdo, 'Niño S.')['id'];
    save_tournament($pdo, merge_test_user('super_admin'), ['intent' => 'schedule-update', 'tournament' => [
        'id' => 'open_play',
        'playersText' => "Niño\nNiño S.\nCy\nBo",
        'matches' => [
            ['id' => 'm_2', 'court' => 1, 'status' => 'scheduled', 'teamA' => ['Niño', 'Cy'], 'teamB' => ['Niño S.', 'Bo']],
        ],
    ]]);
    [$status] = merge_players($pdo, $admin, $x, $y);
    expect_same(400, $status, 'Accented Players in the same scheduled Match cannot be merged');
}

run_db_tests([
    'test_merge_handles_accented_names_in_events',
    'test_only_staff_can_merge_players',
    'test_merge_refusals_accounts_and_same_match',
    'test_merge_moves_matches_skill_and_account_to_survivor',
    'test_merge_propagates_to_games_tournaments_leaderboard_and_qlik',
]);


