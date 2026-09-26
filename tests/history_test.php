<?php
declare(strict_types=1);

// History handler test: which Games each viewer sees. No web server needed:
//   php tests/history_test.php
// Database setup: see tests/test_db.php.

require_once __DIR__ . '/test_db.php';
require_once __DIR__ . '/../api/games.php';

const STAFF = ['id' => 1, 'username' => 'court_admin', 'display_name' => 'Court Admin', 'role' => 'admin'];
const PLAYER = ['id' => 42, 'username' => 'pedro', 'display_name' => 'Pedro Reyes', 'role' => 'player'];
const VISITOR = ['id' => 77, 'username' => 'guest@example.com', 'display_name' => 'Guest', 'role' => 'visitor'];

// Saves a Game ending $minute minutes past 09:00, so higher minutes are newer.
function save_history_game(PDO $pdo, array $scorer, string $id, int $minute, array $extra = []): void
{
    [$status] = save_game($pdo, $scorer, ['game' => $extra + [
        'id' => $id,
        'scorerName' => 'Court 1',
        'teamA' => ['name' => 'Ana / Ben', 'score' => 11],
        'teamB' => ['name' => 'Cy / Di', 'score' => 6],
        'winner' => 'A',
        'endedAt' => sprintf('2026-09-13T09:%02d:00', $minute),
    ]]);
    expect_same(200, $status, "Game $id is saved");
}

function seed_history(PDO $pdo): void
{
    migrate($pdo);
    save_history_game($pdo, STAFF, 'g_other', 1);
    save_history_game($pdo, STAFF, 'g_named', 2, ['teamB' => ['name' => 'Pedro Reyes / Di', 'score' => 6]]);
    save_history_game($pdo, STAFF, 'g_scored_by_username', 3, ['scorerName' => 'pedro']);
    // Players can't save Games, so a staff account carrying the Player's id stands in for "created by the Player";
    // its username, display name and scorer never mention the Player, so only created_by_user_id can match.
    save_history_game($pdo, ['id' => PLAYER['id']] + STAFF, 'g_created_by_player_id', 4, ['scorerName' => 'Court 2']);
    save_history_game($pdo, VISITOR, 'g_visitor', 5);
    save_history_game($pdo, VISITOR, 'g_visitor_naming_player', 6, ['teamA' => ['name' => 'Pedro Reyes / Guest', 'score' => 11]]);
}

// The id of the Player named $name, created by whichever Game already recorded it (find_or_create_player
// is idempotent, so this never creates a second Player).
function player_id_for(PDO $pdo, string $name): int
{
    return (int)find_or_create_player($pdo, $name)['id'];
}

function history_ids(array $result): array
{
    [$status, $payload] = $result;
    expect_same([200, true, count($payload['games'])], [$status, $payload['ok'], $payload['count']], 'History replies ok with a matching count');
    foreach ($payload['games'] as $game) {
        expect_same(true, $game['_shared'], 'Every Game is marked shared');
    }
    return array_column($payload['games'], 'id');
}

function test_visitor_sees_visitor_games_only(PDO $pdo): void
{
    seed_history($pdo);

    expect_same(['g_visitor_naming_player', 'g_visitor'], history_ids(read_history($pdo, VISITOR, ['player' => 'Pedro Reyes'])), 'A Visitor sees only visitor Games, whatever the filter');
}

function test_player_sees_own_games_never_visitor_games(PDO $pdo): void
{
    seed_history($pdo);
    $player = PLAYER + ['player_id' => player_id_for($pdo, 'Pedro Reyes')];

    expect_same(
        ['g_created_by_player_id', 'g_scored_by_username', 'g_named'],
        history_ids(read_history($pdo, $player, ['scorer' => 'Court 1'])),
        'A Player sees Games they created, scored or their linked Player is named in, ignoring filters'
    );
}

// ADR 0005: History follows the account's linked Player, not the account's current name, so renaming
// the account (or the Player) never drops a Player's own History.
function test_renaming_the_account_does_not_lose_the_linked_players_history(PDO $pdo): void
{
    migrate($pdo);
    save_history_game($pdo, STAFF, 'g_pedro', 1, ['teamA' => ['name' => 'Pedro Reyes / Di', 'score' => 11]]);
    $player = ['id' => 55, 'username' => 'pedro2', 'display_name' => 'Pedro Reyes', 'role' => 'player', 'player_id' => player_id_for($pdo, 'Pedro Reyes')];

    expect_same(['g_pedro'], history_ids(read_history($pdo, $player, [])), 'The Player sees their Game');

    $renamedAccount = ['display_name' => 'Pedro R.'] + $player;
    expect_same(['g_pedro'], history_ids(read_history($pdo, $renamedAccount, [])), 'Renaming the account keeps the linked Player\'s History visible');

    $unlinkedAccount = ['player_id' => null] + $player;
    expect_same([], history_ids(read_history($pdo, $unlinkedAccount, [])), 'An account with no linked Player sees none of that Player\'s Matches by name alone');
}

function test_staff_and_signed_out_see_non_visitor_games_with_filters(PDO $pdo): void
{
    seed_history($pdo);

    $all = ['g_created_by_player_id', 'g_scored_by_username', 'g_named', 'g_other'];
    foreach (['staff' => STAFF, 'super admin' => ['role' => 'super_admin'] + STAFF, 'signed out' => null] as $viewer => $user) {
        expect_same($all, history_ids(read_history($pdo, $user, [])), "$viewer sees every non-visitor Game");
        expect_same(['g_named'], history_ids(read_history($pdo, $user, ['player' => 'Pedro Reyes'])), "$viewer filters by player name");
        expect_same(['g_created_by_player_id'], history_ids(read_history($pdo, $user, ['scorer' => ' Court 2 '])), "$viewer filters by scorer");
    }
    // The player filter matches recorded player names (or scorer) without regard to case,
    // but not as a substring: "pedro" does not find "Pedro Reyes".
    expect_same(['g_scored_by_username'], history_ids(read_history($pdo, null, ['player' => 'pedro', 'scorer' => 'Court 1'])), 'The player filter matches exact names and wins over the scorer filter');
}

function test_limit_is_clamped_and_newest_first(PDO $pdo): void
{
    seed_history($pdo);

    expect_same(['g_created_by_player_id'], history_ids(read_history($pdo, null, ['limit' => '0'])), 'A limit below 1 returns the newest Game only');
    expect_same(['g_created_by_player_id', 'g_scored_by_username'], history_ids(read_history($pdo, null, ['limit' => '2'])), 'The limit caps the newest Games');

    for ($i = 0; $i < 200; $i++) {
        save_history_game($pdo, STAFF, "g_bulk_$i", 0);
    }
    expect_same(100, count(history_ids(read_history($pdo, null, []))), 'The default limit is 100');
    expect_same(200, count(history_ids(read_history($pdo, null, ['limit' => '999']))), 'A limit above 200 returns 200 Games');
}

function test_player_al_does_not_see_alice(PDO $pdo): void
{
    migrate($pdo);
    save_history_game($pdo, STAFF, 'g_alice', 1, ['teamA' => ['name' => 'Alice / Bob', 'score' => 11]]);
    save_history_game($pdo, STAFF, 'g_al', 2, ['teamA' => ['name' => 'Al / Charlie', 'score' => 11]]);

    $alUser = ['id' => 99, 'username' => 'al', 'display_name' => 'Al', 'role' => 'player', 'player_id' => player_id_for($pdo, 'Al')];
    expect_same(['g_al'], history_ids(read_history($pdo, $alUser, [])), 'Player Al sees their own game but not Alice\'s game');

    $aliceUser = ['id' => 100, 'username' => 'alice', 'display_name' => 'Alice', 'role' => 'player', 'player_id' => player_id_for($pdo, 'Alice')];
    expect_same(['g_alice'], history_ids(read_history($pdo, $aliceUser, [])), 'Player Alice sees their own game but not Al\'s game');

    // Signed-out / staff query filters also match exact player names, not substrings
    expect_same(['g_al'], history_ids(read_history($pdo, null, ['player' => 'Al'])), 'Filtering by "Al" does not match "Alice"');
    expect_same(['g_alice'], history_ids(read_history($pdo, null, ['player' => 'Alice'])), 'Filtering by "Alice" does not match "Al"');
    // Case-insensitivity check
    expect_same(['g_al'], history_ids(read_history($pdo, null, ['player' => 'al'])), 'Filtering by lowercase "al" matches "Al"');
}

function test_history_lists_send_summaries_without_rallies(PDO $pdo): void
{
    migrate($pdo);
    $rallies = [
        ['id' => 'e1', 'rallyWinner' => 'A', 'newScore' => '1-0-1'],
        ['id' => 'e2', 'rallyWinner' => 'B', 'newScore' => '1-1-1'],
    ];
    save_history_game($pdo, STAFF, 'g_with_events', 1, ['events' => $rallies]);

    [, $payload] = read_history($pdo, STAFF, []);
    $found = null;
    foreach ($payload['games'] as $game) {
        expect_same(false, array_key_exists('events', $game), "Game {$game['id']} does not include Rally log");
        if ($game['id'] === 'g_with_events') {
            $found = $game;
        }
    }

    expect_same(true, $found !== null, 'g_with_events is in history list');
    expect_same('Ana / Ben', $found['teamA']['name'] ?? null, 'Team A name is preserved in summary');
    expect_same(11, $found['teamA']['score'] ?? null, 'Team A score is preserved in summary');
    expect_same('A', $found['winner'] ?? null, 'Winner is preserved in summary');
    expect_same('Court 1', $found['scorerName'] ?? null, 'Scorer is preserved in summary');
    expect_same(true, $found['_shared'] ?? null, 'Shared flag is preserved in summary');
}

function test_read_game_loads_full_rally_log_with_visibility(PDO $pdo): void
{
    migrate($pdo);
    $rallies = [
        ['id' => 'e1', 'rallyWinner' => 'A', 'newScore' => '1-0-1'],
        ['id' => 'e2', 'rallyWinner' => 'A', 'newScore' => '2-0-1'],
    ];

    save_history_game($pdo, STAFF, 'g_player_rallies', 1, [
        'teamA' => ['name' => 'Pedro Reyes / Di', 'score' => 11],
        'events' => $rallies,
    ]);
    save_history_game($pdo, STAFF, 'g_staff_only_rallies', 2, [
        'teamA' => ['name' => 'Court Admin / Di', 'score' => 11],
        'events' => $rallies,
    ]);
    save_history_game($pdo, VISITOR, 'g_visitor_rallies', 3, [
        'events' => $rallies,
    ]);

    // 1. Authorized player reads own game with full events
    $player = PLAYER + ['player_id' => player_id_for($pdo, 'Pedro Reyes')];
    [$status, $payload] = read_game($pdo, $player, 'g_player_rallies');
    expect_same(200, $status, 'Player reads own game');
    expect_same(true, $payload['ok'], 'Read game payload ok');
    expect_same(2, count($payload['game']['events']), 'Full rally log is present');
    expect_same(true, $payload['game']['_shared'], 'Game marked shared');

    // 2. Player cannot read a game they are not named in
    [$status, $payload] = read_game($pdo, $player, 'g_staff_only_rallies');
    expect_same([404, 'Game not found'], [$status, $payload['error'] ?? null], 'Player cannot read other games');

    // 3. Player cannot read visitor games
    [$status, $payload] = read_game($pdo, $player, 'g_visitor_rallies');
    expect_same([404, 'Game not found'], [$status, $payload['error'] ?? null], 'Player cannot read visitor games');

    // 4. Staff can read any non-visitor game
    [$status, $payload] = read_game($pdo, STAFF, 'g_staff_only_rallies');
    expect_same(200, $status, 'Staff reads non-visitor game');
    expect_same(2, count($payload['game']['events']), 'Staff gets full rally log');

    // 5. Visitor can read visitor games with full events
    [$status, $payload] = read_game($pdo, VISITOR, 'g_visitor_rallies');
    expect_same(200, $status, 'Visitor reads visitor game');
    expect_same(2, count($payload['game']['events']), 'Visitor gets full rally log');

    // 6. Invalid IDs
    [$status, $payload] = read_game($pdo, STAFF, 'g_does_not_exist');
    expect_same(404, $status, 'Missing game returns 404');

    [$status, $payload] = read_game($pdo, STAFF, '   ');
    expect_same(400, $status, 'Blank game id returns 400');
}

// History is readable signed out, and every Visitor sees every Visitor Game, so a scorer's username
// (a staff login name, or a Visitor's email) stays on the server. id, display name and role remain.
function test_history_never_sends_the_scorers_username(PDO $pdo): void
{
    seed_history($pdo);

    [, $payload] = read_history($pdo, null, []);
    [, $visitorPayload] = read_history($pdo, VISITOR, []);
    [, $single] = read_game($pdo, null, 'g_other');
    foreach (array_merge($payload['games'], $visitorPayload['games'], [$single['game']]) as $game) {
        expect_same(false, array_key_exists('username', $game['createdBy']), "Game {$game['id']} has no scorer username");
        expect_same(['id', 'displayName', 'role'], array_keys($game['createdBy']), "Game {$game['id']} keeps the scorer's id, name and role");
    }
}

run_db_tests([
    'test_history_never_sends_the_scorers_username',
    'test_visitor_sees_visitor_games_only',
    'test_player_sees_own_games_never_visitor_games',
    'test_renaming_the_account_does_not_lose_the_linked_players_history',
    'test_staff_and_signed_out_see_non_visitor_games_with_filters',
    'test_limit_is_clamped_and_newest_first',
    'test_player_al_does_not_see_alice',
    'test_history_lists_send_summaries_without_rallies',
    'test_read_game_loads_full_rally_log_with_visibility',
]);
