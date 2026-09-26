<?php
declare(strict_types=1);

// Player skill level test, no web server needed:
//   php tests/player_skill_level_test.php
// Database setup: see tests/test_db.php.

require_once __DIR__ . '/test_db.php';
require_once __DIR__ . '/../api/games.php';
require_once __DIR__ . '/../api/tournaments.php';
require_once __DIR__ . '/../api/players.php';
require_once __DIR__ . '/../api/sign_in.php';

function skill_test_user(string $role): array
{
    return ['id' => 12, 'username' => "{$role}_user", 'display_name' => ucfirst($role), 'role' => $role];
}

function test_every_player_starts_unrated(PDO $pdo): void
{
    migrate($pdo);

    $player = find_or_create_player($pdo, 'Jomar Ebonite');
    $row = find_player_by_id($pdo, (int)$player['id']);
    expect_same(null, $row['skill_level'] ?? null, 'A newly created Player starts with skill_level NULL (Unrated)');

    [$status, $payload] = list_players($pdo, skill_test_user('admin'));
    expect_same(200, $status, 'Admin can list players');
    $listed = array_values(array_filter($payload['players'], static fn($p) => $p['name'] === 'Jomar Ebonite'))[0] ?? null;
    expect_same(true, $listed !== null, 'Player is found in list');
    expect_same(null, $listed['skillLevel'], 'Player starts Unrated in staff list');
}

function test_staff_can_set_and_clear_skill_level(PDO $pdo): void
{
    migrate($pdo);

    $player = find_or_create_player($pdo, 'Maria Santos');
    $playerId = (int)$player['id'];

    foreach (['admin', 'super_admin'] as $role) {
        $user = skill_test_user($role);

        // Set to beginner
        [$status, $payload] = set_player_skill($pdo, $user, $playerId, 'beginner');
        expect_same(200, $status, "$role can set skill to beginner");
        expect_same('beginner', $payload['player']['skillLevel'], 'Payload returns beginner');
        expect_same('beginner', find_player_by_id($pdo, $playerId)['skill_level'], 'DB stored beginner');

        // Set to intermediate (case-insensitive)
        [$status, $payload] = set_player_skill($pdo, $user, $playerId, 'Intermediate');
        expect_same(200, $status, "$role can set skill to Intermediate");
        expect_same('intermediate', $payload['player']['skillLevel'], 'Payload returns intermediate');
        expect_same('intermediate', find_player_by_id($pdo, $playerId)['skill_level'], 'DB stored intermediate');

        // Set to advanced
        [$status, $payload] = set_player_skill($pdo, $user, $playerId, 'advanced');
        expect_same(200, $status, "$role can set skill to advanced");
        expect_same('advanced', $payload['player']['skillLevel'], 'Payload returns advanced');
        expect_same('advanced', find_player_by_id($pdo, $playerId)['skill_level'], 'DB stored advanced');

        // Clear with null
        [$status, $payload] = set_player_skill($pdo, $user, $playerId, null);
        expect_same(200, $status, "$role can clear skill with null");
        expect_same(null, $payload['player']['skillLevel'], 'Payload returns null');
        expect_same(null, find_player_by_id($pdo, $playerId)['skill_level'], 'DB stored null');

        // Clear with 'unrated'
        set_player_skill($pdo, $user, $playerId, 'beginner');
        [$status, $payload] = set_player_skill($pdo, $user, $playerId, 'unrated');
        expect_same(200, $status, "$role can clear skill with 'unrated'");
        expect_same(null, $payload['player']['skillLevel'], 'Payload returns null when cleared with unrated');
        expect_same(null, find_player_by_id($pdo, $playerId)['skill_level'], 'DB stored null');

        // Clear with empty string
        set_player_skill($pdo, $user, $playerId, 'advanced');
        [$status, $payload] = set_player_skill($pdo, $user, $playerId, '  ');
        expect_same(200, $status, "$role can clear skill with empty string");
        expect_same(null, $payload['player']['skillLevel'], 'Payload returns null when cleared with whitespace');
        expect_same(null, find_player_by_id($pdo, $playerId)['skill_level'], 'DB stored null');
    }
}

function test_non_staff_and_signed_out_are_refused(PDO $pdo): void
{
    migrate($pdo);

    $player = find_or_create_player($pdo, 'Carlos Gomez');
    $playerId = (int)$player['id'];

    foreach (['player', 'visitor'] as $role) {
        [$status, $payload] = set_player_skill($pdo, skill_test_user($role), $playerId, 'advanced');
        expect_same(403, $status, "A $role cannot set player skill");
        expect_same(false, $payload['ok'], 'Refusal reports ok: false');
        expect_same(null, find_player_by_id($pdo, $playerId)['skill_level'], 'DB was not modified');
    }

    [$status, $payload] = set_player_skill($pdo, null, $playerId, 'advanced');
    expect_same(401, $status, 'Signed-out request cannot set player skill');
    expect_same(false, $payload['ok'], 'Refusal reports ok: false');
    expect_same(null, find_player_by_id($pdo, $playerId)['skill_level'], 'DB was not modified');
}

function test_invalid_skill_level_rejected(PDO $pdo): void
{
    migrate($pdo);

    $player = find_or_create_player($pdo, 'Elena Cruz');
    $playerId = (int)$player['id'];
    $admin = skill_test_user('admin');

    foreach (['pro', 'expert', 'master', '123', 'invalid'] as $badValue) {
        [$status, $payload] = set_player_skill($pdo, $admin, $playerId, $badValue);
        expect_same(400, $status, "Invalid skill level '$badValue' is rejected with 400");
        expect_same(false, $payload['ok'], 'Error payload ok is false');
    }

    // Non-existent player ID
    [$status, $payload] = set_player_skill($pdo, $admin, 999999, 'beginner');
    expect_same(404, $status, 'Non-existent player id is rejected with 404');
    expect_same(false, $payload['ok'], 'Error payload ok is false');
}

function test_no_response_to_player_visitor_or_live_board_includes_skill_level(PDO $pdo): void
{
    migrate($pdo);

    $admin = skill_test_user('admin');
    $playerA = find_or_create_player($pdo, 'Rated Alice');
    $playerB = find_or_create_player($pdo, 'Rated Bob');
    set_player_skill($pdo, $admin, (int)$playerA['id'], 'advanced');
    set_player_skill($pdo, $admin, (int)$playerB['id'], 'beginner');

    // 1. Save game with these players
    save_game($pdo, $admin, ['game' => [
        'id' => 'g_rated',
        'type' => 'singles',
        'teamA' => ['name' => 'Rated Alice', 'score' => 11, 'players' => ['Rated Alice']],
        'teamB' => ['name' => 'Rated Bob', 'score' => 7, 'players' => ['Rated Bob']],
        'winner' => 'A',
    ]]);

    // 2. Save tournament
    save_tournament($pdo, skill_test_user('super_admin'), ['tournament' => [
        'id' => 'open_play',
        'playersText' => "Rated Alice\nRated Bob",
        'matches' => [],
    ]]);

    // Check read_tournament (Live Board / public endpoint)
    [$tStatus, $tPayload] = read_tournament($pdo, ['id' => 'open_play']);
    expect_same(200, $tStatus, 'read_tournament succeeds');
    $tJson = json_encode($tPayload);
    expect_same(false, str_contains($tJson, 'skill_level'), 'read_tournament does not contain skill_level');
    expect_same(false, str_contains($tJson, 'skillLevel'), 'read_tournament does not contain skillLevel');
    expect_same(false, str_contains($tJson, 'advanced'), 'read_tournament does not leak skill rating text');

    // Check read_history for player
    $playerUser = ['id' => 20, 'username' => 'alice', 'display_name' => 'Rated Alice', 'role' => 'player', 'is_active' => 1, 'player_id' => (int)$playerA['id']];
    [$hStatus, $hPayload] = read_history($pdo, $playerUser, []);
    expect_same(200, $hStatus, 'read_history for player succeeds');
    $hJson = json_encode($hPayload);
    expect_same(false, str_contains($hJson, 'skill_level'), 'read_history does not contain skill_level');
    expect_same(false, str_contains($hJson, 'skillLevel'), 'read_history does not contain skillLevel');

    // Check read_history for visitor
    $visitorUser = skill_test_user('visitor');
    [$vhStatus, $vhPayload] = read_history($pdo, $visitorUser, []);
    $vhJson = json_encode($vhPayload);
    expect_same(false, str_contains($vhJson, 'skill_level'), 'read_history for visitor does not contain skill_level');
    expect_same(false, str_contains($vhJson, 'skillLevel'), 'read_history for visitor does not contain skillLevel');

    // Check read_history for public (signed out)
    [$phStatus, $phPayload] = read_history($pdo, null, []);
    $phJson = json_encode($phPayload);
    expect_same(false, str_contains($phJson, 'skill_level'), 'read_history for public does not contain skill_level');
    expect_same(false, str_contains($phJson, 'skillLevel'), 'read_history for public does not contain skillLevel');

    // Check read_leaderboard (public)
    [$lStatus, $lPayload] = read_leaderboard($pdo, []);
    expect_same(200, $lStatus, 'read_leaderboard succeeds');
    $lJson = json_encode($lPayload);
    expect_same(false, str_contains($lJson, 'skill_level'), 'read_leaderboard does not contain skill_level');
    expect_same(false, str_contains($lJson, 'skillLevel'), 'read_leaderboard does not contain skillLevel');

    // Check read_game (public)
    [$gStatus, $gPayload] = read_game($pdo, null, 'g_rated');
    expect_same(200, $gStatus, 'read_game succeeds');
    $gJson = json_encode($gPayload);
    expect_same(false, str_contains($gJson, 'skill_level'), 'read_game does not contain skill_level');
    expect_same(false, str_contains($gJson, 'skillLevel'), 'read_game does not contain skillLevel');

    // Check who_am_i
    [$wStatus, $wPayload] = who_am_i($pdo, $playerUser);
    expect_same(200, $wStatus, 'who_am_i succeeds');
    $wJson = json_encode($wPayload);
    expect_same(false, str_contains($wJson, 'skill_level'), 'who_am_i does not contain skill_level');
    expect_same(false, str_contains($wJson, 'skillLevel'), 'who_am_i does not contain skillLevel');

    // Check list_players refuses player and visitor
    [$lpPlayerStatus] = list_players($pdo, $playerUser);
    expect_same(403, $lpPlayerStatus, 'list_players refused for player');

    [$lpVisitorStatus] = list_players($pdo, $visitorUser);
    expect_same(403, $lpVisitorStatus, 'list_players refused for visitor');

    [$lpSignedOutStatus] = list_players($pdo, null);
    expect_same(401, $lpSignedOutStatus, 'list_players refused for signed out');
}

run_db_tests([
    'test_every_player_starts_unrated',
    'test_staff_can_set_and_clear_skill_level',
    'test_non_staff_and_signed_out_are_refused',
    'test_invalid_skill_level_rejected',
    'test_no_response_to_player_visitor_or_live_board_includes_skill_level',
]);
