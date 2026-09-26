<?php
declare(strict_types=1);

// Save-game handler test, no web server needed:
//   php tests/save_game_test.php
// Database setup: see tests/test_db.php.

require_once __DIR__ . '/test_db.php';
require_once __DIR__ . '/../api/games.php';

function sample_user(string $role): array
{
    return ['id' => 7, 'username' => "{$role}_user", 'display_name' => ucfirst($role), 'role' => $role];
}

function sample_game(string $id, array $extra = []): array
{
    return ['game' => $extra + [
        'id' => $id,
        'teamA' => ['name' => 'Team A', 'score' => 11],
        'teamB' => ['name' => 'Team B', 'score' => 7],
        'winner' => 'A',
    ]];
}

function saved_scope(PDO $pdo, string $id): ?string
{
    $statement = $pdo->prepare("SELECT match_scope FROM games WHERE id = :id");
    $statement->execute([':id' => $id]);
    $scope = $statement->fetchColumn();
    return $scope === false ? null : $scope;
}

function test_visitor_game_is_saved_with_visitor_scope(PDO $pdo): void
{
    migrate($pdo);

    [$status, $payload] = save_game($pdo, sample_user('visitor'), sample_game('game_v', ['matchScope' => 'standard']));

    expect_same([200, ['ok' => true, 'id' => 'game_v']], [$status, $payload], 'Visitor save succeeds');
    expect_same('visitor', saved_scope($pdo, 'game_v'), "A Visitor's Game gets visitor scope");
}

function test_tournament_and_staff_scopes(PDO $pdo): void
{
    migrate($pdo);

    save_game($pdo, sample_user('admin'), sample_game('game_t', ['tournamentMatch' => ['matchId' => 'open_1']]));
    expect_same('tournament', saved_scope($pdo, 'game_t'), 'A Game linked to a tournament Match gets tournament scope');

    save_game($pdo, sample_user('super_admin'), sample_game('game_s', ['matchScope' => 'visitor']));
    expect_same('standard', saved_scope($pdo, 'game_s'), 'A staff Game claiming visitor scope is saved as standard');
}

function test_refused_saves(PDO $pdo): void
{
    migrate($pdo);

    [$status] = save_game($pdo, sample_user('player'), sample_game('game_p'));
    expect_same(403, $status, 'A Player may not save a Game');
    expect_same(null, saved_scope($pdo, 'game_p'), "The Player's Game is not written");

    foreach (['teamA', 'teamB'] as $team) {
        $missingTeam = sample_game('game_x');
        unset($missingTeam['game'][$team]);
        [$status] = save_game($pdo, sample_user('admin'), $missingTeam);
        expect_same(400, $status, "A Game missing $team is refused");
    }
}

function test_invalid_results_are_refused(PDO $pdo): void
{
    migrate($pdo);

    foreach ([
        ['missing_winner', ['winner' => null], 'Winner is required to complete the match'],
        ['wrong_winner', ['teamA' => ['name' => 'Team A', 'score' => 3], 'teamB' => ['name' => 'Team B', 'score' => 11], 'winner' => 'A'], 'Winner must correspond to the higher score'],
        ['below_target', ['teamA' => ['name' => 'Team A', 'score' => 10], 'teamB' => ['name' => 'Team B', 'score' => 8], 'targetScore' => 11], 'Winning score must reach the target score'],
        ['not_by_two', ['teamA' => ['name' => 'Team A', 'score' => 11], 'teamB' => ['name' => 'Team B', 'score' => 10], 'winByTwo' => true], 'Winner must lead by at least 2 points'],
    ] as [$id, $change, $message]) {
        [$status, $payload] = save_game($pdo, sample_user('admin'), sample_game("invalid_$id", $change));
        expect_same(400, $status, "$id is refused");
        expect_same($message, $payload['error'] ?? null, "$id has a readable reason");
        expect_same(null, saved_scope($pdo, "invalid_$id"), "$id is not written");
    }

    [$status] = save_game($pdo, sample_user('admin'), sample_game('valid_retirement', [
        'teamA' => ['name' => 'Team A', 'score' => 3],
        'teamB' => ['name' => 'Team B', 'score' => 7],
        'winner' => 'A',
        'endedEarly' => true,
        'endReason' => 'retirement_or_forfeit',
        'retiredTeam' => 'B',
        'targetScore' => 11,
        'winByTwo' => true,
    ]));
    expect_same(200, $status, 'Opponent wins a valid retirement below target');

    [$status, $payload] = save_game($pdo, sample_user('admin'), sample_game('spoofed_scores', [
        'teamA' => ['name' => 'Team A', 'score' => 3],
        'teamB' => ['name' => 'Team B', 'score' => 11],
        'winner' => 'A',
        'scoreA' => 11,
        'scoreB' => 3,
    ]));
    expect_same([400, 'Winner must correspond to the higher score'], [$status, $payload['error'] ?? null], 'Persisted Team scores cannot be overridden during validation');
}

// A Match still being played has no winner yet, and the Rally-log rules only apply once it is finished.
function test_a_match_still_being_played_is_saved(PDO $pdo): void
{
    migrate($pdo);

    foreach ([
        ['live_active', 'active'],
        ['live_in_progress', 'in_progress'],
    ] as [$id, $status]) {
        [$code, $payload] = save_game($pdo, sample_user('admin'), sample_game($id, [
            'status' => $status,
            'winner' => null,
            'teamA' => ['name' => 'Team A', 'score' => 4],
            'teamB' => ['name' => 'Team B', 'score' => 2],
            'targetScore' => 11,
            'winByTwo' => true,
        ]));
        expect_same(200, $code, "A $status Match is saved: " . ($payload['error'] ?? ''));
        expect_same('standard', saved_scope($pdo, $id), "A $status Match is written");
    }
}

function test_game_records_tournament_match_and_players(PDO $pdo): void
{
    migrate($pdo);

    $game = sample_game('game_tourney_1', [
        'tournamentMatch' => ['tournamentId' => 'cup_2026', 'matchId' => 'm_final'],
        'teamA' => ['name' => 'Alice / Bob', 'players' => [' Alice ', 'Bob '], 'score' => 11],
        'teamB' => ['name' => 'Charlie / Diana', 'players' => ['Charlie', ' Diana '], 'score' => 9],
    ]);
    [$status] = save_game($pdo, sample_user('admin'), $game);
    expect_same(200, $status, 'Tournament game save succeeds');

    $stmt = $pdo->prepare("SELECT tournament_id, tournament_match_id FROM games WHERE id = 'game_tourney_1'");
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    expect_same(['cup_2026', 'm_final'], [$row['tournament_id'], $row['tournament_match_id']], 'Tournament ID and Match ID are stored');

    $stmt = $pdo->prepare("SELECT team, player_name FROM game_players WHERE game_id = 'game_tourney_1' ORDER BY id");
    $stmt->execute();
    $players = $stmt->fetchAll(PDO::FETCH_ASSOC);
    expect_same([
        ['team' => 'A', 'player_name' => 'Alice'],
        ['team' => 'A', 'player_name' => 'Bob'],
        ['team' => 'B', 'player_name' => 'Charlie'],
        ['team' => 'B', 'player_name' => 'Diana'],
    ], $players, 'Trimmed player entries are recorded for both teams');
}

function test_missing_tournament_id_falls_back_to_the_current_event(PDO $pdo): void
{
    migrate($pdo);
    $pdo->prepare("UPDATE app_settings SET setting_value = :value WHERE setting_key = 'current_event_id'")
        ->execute([':value' => 'summer_bash']);

    save_game($pdo, sample_user('admin'), sample_game('game_no_id', ['tournamentMatch' => ['matchId' => 'm1']]));

    $stmt = $pdo->prepare("SELECT tournament_id FROM games WHERE id = 'game_no_id'");
    $stmt->execute();
    expect_same('summer_bash', $stmt->fetchColumn(), 'A tournamentMatch with no tournamentId is attributed to the Current Event, not open_play');
}

function test_game_players_trimming_and_case_insensitive_matching(PDO $pdo): void
{
    migrate($pdo);

    // Test slash-separated team name in singles/doubles fallback, and whitespace trimming
    $game = sample_game('game_slash', [
        'status' => 'in_progress',
        'winner' => null,
        'teamA' => ['name' => '  Mtc Ace  /  Top Spin  ', 'score' => 11],
        'teamB' => ['name' => '  Solo Player  ', 'score' => 4],
    ]);
    save_game($pdo, sample_user('admin'), $game);

    $stmt = $pdo->prepare("SELECT team, player_name FROM game_players WHERE game_id = 'game_slash' ORDER BY id");
    $stmt->execute();
    $players = $stmt->fetchAll(PDO::FETCH_ASSOC);
    expect_same([
        ['team' => 'A', 'player_name' => 'Mtc Ace'],
        ['team' => 'A', 'player_name' => 'Top Spin'],
        ['team' => 'B', 'player_name' => 'Solo Player'],
    ], $players, 'Slash-separated names are split and trimmed');

    // Case-insensitive matching verification
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM game_players WHERE player_name = 'mtc ace'");
    $stmt->execute();
    expect_same(1, (int)$stmt->fetchColumn(), 'Player names match without regard to case');

    $stmt = $pdo->prepare("SELECT COUNT(*) FROM game_players WHERE player_name = 'SOLO PLAYER'");
    $stmt->execute();
    expect_same(1, (int)$stmt->fetchColumn(), 'Player names match uppercase search');

    // Finishing an in-progress Match replaces game_players rows without duplicates.
    $updatedGame = sample_game('game_slash', [
        'teamA' => ['name' => 'Solo A', 'score' => 11],
        'teamB' => ['name' => 'Solo B', 'score' => 8],
    ]);
    save_game($pdo, sample_user('admin'), $updatedGame);

    $stmt = $pdo->prepare("SELECT team, player_name FROM game_players WHERE game_id = 'game_slash' ORDER BY id");
    $stmt->execute();
    $players = $stmt->fetchAll(PDO::FETCH_ASSOC);
    expect_same([
        ['team' => 'A', 'player_name' => 'Solo A'],
        ['team' => 'B', 'player_name' => 'Solo B'],
    ], $players, 'Updating a game replaces game_players cleanly');
}

// A Game id is chosen by the browser and shown in public History, so only the account that first
// saved it may save it again (a retry); anyone else would be overwriting or hiding a result.
function test_only_the_account_that_saved_a_game_can_save_it_again(PDO $pdo): void
{
    migrate($pdo);

    $owner = sample_user('admin');
    save_game($pdo, $owner, sample_game('game_owned'));

    foreach ([['visitor', 8], ['admin', 9], ['super_admin', 10]] as [$role, $id]) {
        [$status, $payload] = save_game($pdo, ['id' => $id] + sample_user($role), sample_game('game_owned', [
            'teamA' => ['name' => 'Hijack A', 'score' => 0],
            'teamB' => ['name' => 'Hijack B', 'score' => 11],
            'winner' => 'B',
        ]));
        expect_same([409, 'This Match was already saved by another account'], [$status, $payload['error'] ?? null], "A $role cannot resave someone else's Game");
    }
    expect_same('standard', saved_scope($pdo, 'game_owned'), 'The Game keeps its scope');
    $row = $pdo->query("SELECT team_a_name, created_by_user_id FROM games WHERE id = 'game_owned'")->fetch();
    expect_same(['team_a_name' => 'Team A', 'created_by_user_id' => 7], $row, 'The Game keeps its result and owner');

    [$status] = save_game($pdo, $owner, sample_game('game_owned'));
    expect_same(200, $status, 'The account that saved the Game can save it again');
}

function test_a_finished_match_is_final_for_its_owner(PDO $pdo): void
{
    migrate($pdo);
    $owner = sample_user('admin');
    save_game($pdo, $owner, sample_game('final_game'));
    $before = $pdo->query("SELECT game_json FROM games WHERE id = 'final_game'")->fetchColumn();
    expect_same(200, save_game($pdo, $owner, sample_game('final_game'))[0], 'A matching retry succeeds');
    foreach ([['teamB' => ['name' => 'Team B', 'score' => 8]], ['winner' => 'B'], ['winner' => 'B', 'teamA' => ['name' => 'Team A', 'score' => 7], 'teamB' => ['name' => 'Team B', 'score' => 11]]] as $change) {
        [$status, $payload] = save_game($pdo, $owner, sample_game('final_game', $change));
        expect_same([409, 'This Match is already finished. A Super Admin can change the result with Correct Match.'], [$status, $payload['error'] ?? null], 'A changed result is refused');
    }
    expect_same($before, $pdo->query("SELECT game_json FROM games WHERE id = 'final_game'")->fetchColumn(), 'A retry leaves the saved Match unchanged');

    save_game($pdo, $owner, sample_game('ongoing_game', ['status' => 'in_progress', 'winner' => null]));
    expect_same(200, save_game($pdo, $owner, sample_game('ongoing_game'))[0], 'An in-progress Match may finish');
}

function test_rally_event_cap(PDO $pdo): void
{
    migrate($pdo);
    [$status, $payload] = save_game($pdo, sample_user('admin'), sample_game('oversized_events', ['events' => array_fill(0, 5001, [])]));
    expect_same([400, 'Too many Rally events'], [$status, $payload['error'] ?? null], 'An oversized Rally log is refused');
    expect_same(null, saved_scope($pdo, 'oversized_events'), 'No Game is stored');
}

// app.js renders these fields as HTML, so a stored Game must not be able to carry markup in them.
function test_fields_rendered_as_html_are_stored_as_plain_values(PDO $pdo): void
{
    migrate($pdo);

    $markup = '<img src=x onerror=alert(1)>';
    [$status] = save_game($pdo, sample_user('admin'), sample_game('game_markup', [
        'status' => 'in_progress',
        'winner' => null,
        'type' => $markup,
        'teamA' => ['name' => 'Team A', 'score' => $markup],
        'teamB' => ['name' => 'Team B', 'score' => '5'],
        'sideOuts' => $markup,
    ]));
    expect_same(200, $status, 'The Game is saved');

    $game = json_decode((string)$pdo->query("SELECT game_json FROM games WHERE id = 'game_markup'")->fetchColumn(), true);
    expect_same(
        ['doubles', 0, 5, 0],
        [$game['type'], $game['teamA']['score'], $game['teamB']['score'], $game['sideOuts']],
        'Type is doubles or singles, and scores and side-outs are integers'
    );

    save_game($pdo, sample_user('admin'), sample_game('game_singles', ['type' => 'singles']));
    $type = json_decode((string)$pdo->query("SELECT game_json FROM games WHERE id = 'game_singles'")->fetchColumn(), true)['type'];
    expect_same('singles', $type, 'Singles stays singles');
}

run_db_tests([
    'test_only_the_account_that_saved_a_game_can_save_it_again',
    'test_a_finished_match_is_final_for_its_owner',
    'test_rally_event_cap',
    'test_fields_rendered_as_html_are_stored_as_plain_values',
    'test_visitor_game_is_saved_with_visitor_scope',
    'test_tournament_and_staff_scopes',
    'test_refused_saves',
    'test_invalid_results_are_refused',
    'test_a_match_still_being_played_is_saved',
    'test_game_records_tournament_match_and_players',
    'test_missing_tournament_id_falls_back_to_the_current_event',
    'test_game_players_trimming_and_case_insensitive_matching',
]);
