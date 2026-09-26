<?php
declare(strict_types=1);

// Players module test, no web server needed:
//   php tests/players_test.php
// Database setup: see tests/test_db.php.

require_once __DIR__ . '/test_db.php';
require_once __DIR__ . '/../api/games.php';
require_once __DIR__ . '/../api/tournaments.php';

function sample_player_user(string $role): array
{
    return ['id' => 9, 'username' => "{$role}_user", 'display_name' => ucfirst($role), 'role' => $role];
}

function player_names_for_game(PDO $pdo, string $gameId): array
{
    $statement = $pdo->prepare(
        "SELECT p.name FROM game_players gp INNER JOIN players p ON p.id = gp.player_id
         WHERE gp.game_id = :game_id ORDER BY gp.id ASC"
    );
    $statement->execute([':game_id' => $gameId]);
    return $statement->fetchAll(PDO::FETCH_COLUMN);
}

function test_find_or_create_player_matches_regardless_of_case_and_spacing(PDO $pdo): void
{
    migrate($pdo);

    $first = find_or_create_player($pdo, 'Jomar Ebonite');
    $second = find_or_create_player($pdo, '  jomar   ebonite  ');
    expect_same($first['id'], $second['id'], 'A name that differs only in case or spacing reuses the same Player');
    expect_same('Jomar Ebonite', $second['name'], 'The first spelling used is kept as the display name');
    expect_same(1, (int)$pdo->query("SELECT COUNT(*) FROM players")->fetchColumn(), 'Only one Player row was created');

    expect_same(null, find_or_create_player($pdo, '   '), 'A blank name creates no Player');
}

// players.name and players.normalized_name are VARCHAR(120); an over-length name must be capped
// the way clean_display_name() caps one, not left to fail the INSERT under strict SQL mode.
function test_find_or_create_player_caps_an_overlong_name(PDO $pdo): void
{
    migrate($pdo);

    $longName = str_repeat('A', 150);
    $player = find_or_create_player($pdo, $longName);
    expect_same(120, strlen($player['name']), 'An over-120-character name is capped at 120, like clean_display_name()');
    expect_same(str_repeat('A', 120), $player['name'], 'The capped name keeps its first 120 characters');
}

// A migration backfill test covering standalone, Tournament, singles and doubles Matches, names
// that differ only by case or spacing, and Visitor Matches, on a database from before Players existed.
function test_migration_backfills_players_from_games_rosters_and_schedules(PDO $pdo): void
{
    $allMigrations = schema_migrations();
    $preMigrations = array_intersect_key($allMigrations, array_flip([
        '001_base_tables', '002_games_owner_and_match_scope', '003_users_username_128',
        '004_seed_super_admin', '005_tournament_matches', '006_games_tournament_and_players',
        '007_tournaments_updated_at_microseconds', '008_current_event',
    ]));
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            name VARCHAR(64) NOT NULL PRIMARY KEY,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    foreach ($preMigrations as $name => $migration) {
        $migration($pdo);
        $pdo->prepare("INSERT INTO schema_migrations (name) VALUES (:name)")->execute([':name' => $name]);
    }

    // Standalone doubles, split from a slash-separated name, saved before Players existed.
    $pdo->exec("INSERT INTO games (id, match_scope, created_by_role, game_type, team_a_name, team_b_name, game_json)
        VALUES ('g_doubles', 'standard', 'admin', 'doubles', 'Ana / Ben', 'Cy / Di', '{}')");
    $pdo->exec("INSERT INTO game_players (game_id, team, player_name) VALUES
        ('g_doubles', 'A', 'Ana'), ('g_doubles', 'A', 'Ben'), ('g_doubles', 'B', 'Cy'), ('g_doubles', 'B', 'Di')");

    // Standalone singles, one of the same Players under a differently-cased, differently-spaced name.
    $pdo->exec("INSERT INTO games (id, match_scope, created_by_role, game_type, team_a_name, team_b_name, game_json)
        VALUES ('g_singles', 'standard', 'admin', 'singles', 'ana', 'Frank', '{}')");
    $pdo->exec("INSERT INTO game_players (game_id, team, player_name) VALUES
        ('g_singles', 'A', '  ana  '), ('g_singles', 'B', 'Frank')");

    // Tournament doubles.
    $pdo->exec("INSERT INTO games (id, tournament_id, match_scope, created_by_role, game_type, team_a_name, team_b_name, game_json)
        VALUES ('g_tournament', 'cup_2026', 'tournament', 'admin', 'doubles', 'Team A', 'Team B', '{}')");
    $pdo->exec("INSERT INTO game_players (game_id, team, player_name) VALUES
        ('g_tournament', 'A', 'Bob'), ('g_tournament', 'B', 'Charlie'), ('g_tournament', 'B', 'Dave')");

    // A Visitor Match: its names must not become Players.
    $pdo->exec("INSERT INTO games (id, match_scope, created_by_role, game_type, team_a_name, team_b_name, game_json)
        VALUES ('g_visitor', 'visitor', 'visitor', 'singles', 'Walk In', 'Drop In', '{}')");
    $pdo->exec("INSERT INTO game_players (game_id, team, player_name) VALUES
        ('g_visitor', 'A', 'Walk In'), ('g_visitor', 'B', 'Drop In')");

    // A Tournament roster (free-typed names) and a Schedule (Match team JSON) with no Game yet.
    $pdo->prepare(
        "INSERT INTO tournaments (id, name, tournament_json) VALUES ('roster_only', 'Roster Only', :json)"
    )->execute([':json' => json_encode(['id' => 'roster_only', 'playersText' => "Grace, Heidi\nIvan"], JSON_UNESCAPED_SLASHES)]);
    $pdo->prepare(
        "INSERT INTO tournament_matches (tournament_id, id, team_a, team_b) VALUES ('roster_only', 'sched_1', :team_a, :team_b)"
    )->execute([
        ':team_a' => json_encode(['name' => 'Grace', 'players' => ['Grace']], JSON_UNESCAPED_SLASHES),
        ':team_b' => json_encode(['name' => 'Judy'], JSON_UNESCAPED_SLASHES),
    ]);

    $ran = migrate($pdo);
    expect_same(['009_players', '010_player_accounts', '011_player_skill_level', '012_rate_limits'], $ran, 'Migrations 009 through 012 run on a database from before Players existed');

    expect_same(['Ana', 'Ben', 'Cy', 'Di'], player_names_for_game($pdo, 'g_doubles'), 'Doubles players are linked to Players');
    expect_same(['Ana', 'Frank'], player_names_for_game($pdo, 'g_singles'), 'A differently-cased, differently-spaced name reuses the same Player');
    expect_same(['Bob', 'Charlie', 'Dave'], player_names_for_game($pdo, 'g_tournament'), 'Tournament players are linked to Players');
    expect_same([], player_names_for_game($pdo, 'g_visitor'), 'A Visitor Match creates no Players');

    $names = $pdo->query("SELECT name FROM players ORDER BY name ASC")->fetchAll(PDO::FETCH_COLUMN);
    expect_same(
        ['Ana', 'Ben', 'Bob', 'Charlie', 'Cy', 'Dave', 'Di', 'Frank', 'Grace', 'Heidi', 'Ivan', 'Judy'],
        $names,
        'Players are backfilled from Games, Tournament rosters and Schedules; Visitor names are excluded'
    );

    expect_same([], migrate($pdo), 'Re-running migrate() is a no-op');
}

function test_saving_a_tournament_creates_players_from_its_roster(PDO $pdo): void
{
    migrate($pdo);

    save_tournament($pdo, sample_player_user('super_admin'), ['tournament' => [
        'id' => 'open_play',
        'playersText' => "Alice, Bob\nCharlie",
        'matches' => [],
    ]]);

    $names = $pdo->query("SELECT name FROM players ORDER BY name ASC")->fetchAll(PDO::FETCH_COLUMN);
    expect_same(['Alice', 'Bob', 'Charlie'], $names, 'Saving a Tournament roster creates a Player per name');

    save_tournament($pdo, sample_player_user('super_admin'), ['tournament' => [
        'id' => 'open_play',
        'playersText' => "alice, Bob, Diana",
        'matches' => [],
    ]]);
    $namesAfter = $pdo->query("SELECT name FROM players ORDER BY name ASC")->fetchAll(PDO::FETCH_COLUMN);
    expect_same(['Alice', 'Bob', 'Charlie', 'Diana'], $namesAfter, 'A re-typed existing name reuses its Player instead of duplicating it');
}

function test_list_players_is_staff_only_and_reports_matches_and_events(PDO $pdo): void
{
    migrate($pdo);

    save_game($pdo, sample_player_user('admin'), ['game' => [
        'id' => 'g1',
        'tournamentMatch' => ['tournamentId' => 'cup_2026', 'matchId' => 'm1'],
        'teamA' => ['name' => 'Ana', 'score' => 11],
        'teamB' => ['name' => 'Ben', 'score' => 9],
        'winner' => 'A',
    ]]);
    save_game($pdo, sample_player_user('admin'), ['game' => [
        'id' => 'g2',
        'tournamentMatch' => ['tournamentId' => 'summer_cup', 'matchId' => 'm1'],
        'teamA' => ['name' => 'Ana', 'score' => 5],
        'teamB' => ['name' => 'Ben', 'score' => 11],
        'winner' => 'B',
    ]]);

    $pdo->prepare(
        "INSERT INTO users (username, display_name, role, password_hash, is_active, player_id)
         VALUES ('ana_login', 'Ana', 'player', '', 1, :player_id)"
    )->execute([':player_id' => (int)find_or_create_player($pdo, 'Ana')['id']]);

    [$status, $payload] = list_players($pdo, sample_player_user('admin'));
    expect_same(200, $status, 'An Admin can list Players');
    expect_same(
        [
            ['name' => 'Ana', 'matchCount' => 2, 'eventCount' => 2, 'hasAccount' => true],
            ['name' => 'Ben', 'matchCount' => 2, 'eventCount' => 2, 'hasAccount' => false],
        ],
        array_map(static fn(array $p): array => ['name' => $p['name'], 'matchCount' => $p['matchCount'], 'eventCount' => $p['eventCount'], 'hasAccount' => $p['hasAccount']], $payload['players']),
        'Each Player reports Match and Event counts across their linked Games, and whether an account is linked'
    );

    [$superStatus] = list_players($pdo, sample_player_user('super_admin'));
    expect_same(200, $superStatus, 'A Super Admin can list Players');

    [$playerStatus] = list_players($pdo, sample_player_user('player'));
    expect_same(403, $playerStatus, 'A Player cannot list Players');

    [$visitorStatus] = list_players($pdo, sample_player_user('visitor'));
    expect_same(403, $visitorStatus, 'A Visitor cannot list Players');

    [$signedOutStatus] = list_players($pdo, null);
    expect_same(401, $signedOutStatus, 'A signed-out request cannot list Players');
}

// ADR 0005: an account links to a Player by name once, on a database from before that link existed.
function test_migration_links_existing_player_accounts_to_players(PDO $pdo): void
{
    $allMigrations = schema_migrations();
    $preMigrations = array_intersect_key($allMigrations, array_flip([
        '001_base_tables', '002_games_owner_and_match_scope', '003_users_username_128',
        '004_seed_super_admin', '005_tournament_matches', '006_games_tournament_and_players',
        '007_tournaments_updated_at_microseconds', '008_current_event', '009_players',
    ]));
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            name VARCHAR(64) NOT NULL PRIMARY KEY,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    foreach ($preMigrations as $name => $migration) {
        $migration($pdo);
        $pdo->prepare("INSERT INTO schema_migrations (name) VALUES (:name)")->execute([':name' => $name]);
    }

    find_or_create_player($pdo, 'Jomar Ebonite');
    find_or_create_player($pdo, 'Maria Santos');

    $insert = $pdo->prepare(
        "INSERT INTO users (username, display_name, role, password_hash, is_active) VALUES (:username, :display_name, 'player', '', 1)"
    );
    // Matches an existing Player by display name.
    $insert->execute([':username' => 'jomar', ':display_name' => 'Jomar Ebonite']);
    // Matches an existing Player by username, since its display name matches no Player.
    $insert->execute([':username' => 'maria santos', ':display_name' => 'Court 4']);
    // A second account also named "Jomar Ebonite": the Player is already claimed, so it stays unlinked.
    $insert->execute([':username' => 'jomar2', ':display_name' => 'Jomar Ebonite']);
    // No matching Player anywhere: stays unlinked, and creates no Player.
    $insert->execute([':username' => 'nobody_yet', ':display_name' => 'Nobody Yet']);

    $ran = migrate($pdo);
    expect_same(['010_player_accounts', '011_player_skill_level', '012_rate_limits'], $ran, 'Migrations 010 through 012 run on a database from before account linking existed');

    $playerIds = $pdo->query("SELECT username, player_id FROM users WHERE role = 'player' ORDER BY id ASC")->fetchAll(PDO::FETCH_KEY_PAIR);
    expect_same((int)find_or_create_player($pdo, 'Jomar Ebonite')['id'], (int)$playerIds['jomar'], 'The account is linked by display name');
    expect_same((int)find_or_create_player($pdo, 'Maria Santos')['id'], (int)$playerIds['maria santos'], 'The account is linked by username when display name does not match');
    expect_same(null, $playerIds['jomar2'], 'A second account with the same name does not claim an already-linked Player');
    expect_same(null, $playerIds['nobody_yet'], 'An account matching no Player stays unlinked');
    expect_same(2, (int)$pdo->query("SELECT COUNT(*) FROM players")->fetchColumn(), 'The migration only links; it creates no Player for the unmatched account');

    expect_same([], migrate($pdo), 'Re-running migrate() is a no-op');
}

run_db_tests([
    'test_find_or_create_player_matches_regardless_of_case_and_spacing',
    'test_find_or_create_player_caps_an_overlong_name',
    'test_migration_backfills_players_from_games_rosters_and_schedules',
    'test_saving_a_tournament_creates_players_from_its_roster',
    'test_list_players_is_staff_only_and_reports_matches_and_events',
    'test_migration_links_existing_player_accounts_to_players',
]);
