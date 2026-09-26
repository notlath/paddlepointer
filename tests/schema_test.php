<?php
declare(strict_types=1);

// Schema migration test. Needs a disposable MySQL/MariaDB server:
//   php tests/schema_test.php
// Database setup: see tests/test_db.php.

require_once __DIR__ . '/test_db.php';
require_once __DIR__ . '/../api/games.php';

function test_empty_database_gets_full_schema(PDO $pdo): void
{
    migrate($pdo);

    // The seeded Super Admin can hold a session (SQL from sign_in.php create_session, lookup via db.php).
    $superAdmin = $pdo->query("SELECT id FROM users WHERE username = 'superadmin_ac'")->fetch();
    expect_same(true, is_array($superAdmin), 'Super Admin is seeded');
    $token = bin2hex(random_bytes(32));
    $pdo->prepare(
        "INSERT INTO user_sessions (token_hash, user_id, expires_at)
         VALUES (:token_hash, :user_id, DATE_ADD(NOW(), INTERVAL 30 DAY))"
    )->execute([
        ':token_hash' => hash('sha256', $token),
        ':user_id' => (int)$superAdmin['id'],
    ]);
    $_SERVER['HTTP_X_SESSION_TOKEN'] = $token;
    expect_same('super_admin', user_from_request($pdo)['role'] ?? null, 'Super Admin session resolves to the Super Admin');

    // A visitor whose email is as long as clean_username() allows (128 chars), as accounts.php add_user writes it.
    $email = str_repeat('a', 116) . '@example.com';
    $pdo->prepare(
        "INSERT INTO users (username, display_name, role, password_hash, is_active)
         VALUES (:username, :display_name, :role, :password_hash, 1)"
    )->execute([
        ':username' => $email,
        ':display_name' => 'Visitor',
        ':role' => 'visitor',
        ':password_hash' => '',
    ]);
    $usernames = $pdo->query(
        "SELECT id, username, display_name, role, is_active, created_at, updated_at
         FROM users
         ORDER BY FIELD(role, 'super_admin', 'admin', 'player', 'visitor'), display_name ASC, username ASC"
    )->fetchAll(PDO::FETCH_COLUMN, 1);
    expect_same(['superadmin_ac', $email], $usernames, 'Users list holds the Super Admin and the visitor');

    // A Game saved through the save-game handler, found the way get-history.php looks it up.
    [$status] = save_game($pdo, user_from_request($pdo), ['game' => [
        'id' => 'game_1',
        'scorerName' => 'Court 1',
        'teamA' => ['name' => 'Team A', 'score' => 11],
        'teamB' => ['name' => 'Team B', 'score' => 7],
        'winner' => 'A',
        'sideOuts' => 9,
        'startedAt' => '2026-09-11T09:00:00+08:00',
        'endedAt' => '2026-09-11T09:14:00+08:00',
    ]]);
    expect_same(200, $status, 'The Super Admin saves a Game');
    $history = $pdo->prepare(
        "SELECT game_json
         FROM games
         WHERE (match_scope IS NULL OR match_scope <> 'visitor')
           AND (created_by_role IS NULL OR created_by_role <> 'visitor')
           AND scorer_name = :scorer
         ORDER BY COALESCE(ended_at, created_at, saved_at) DESC, saved_at DESC
         LIMIT 200"
    );
    $history->execute([':scorer' => 'Court 1']);
    expect_same(
        ['game_1'],
        array_map(static fn(string $json): string => json_decode($json, true)['id'], $history->fetchAll(PDO::FETCH_COLUMN)),
        'History finds the saved Game by scorer'
    );

    // A Tournament as save-tournament.php writes it, read the way get-tournament.php reads it.
    $tournamentJson = '{"id":"open_play","matches":[]}';
    $pdo->prepare(
        "INSERT INTO tournaments (
            id, name, format_type, player_count, court_count, match_count, completed_count, tournament_json
        ) VALUES (
            :id, :name, :format_type, :player_count, :court_count, :match_count, :completed_count, :tournament_json
        )"
    )->execute([
        ':id' => 'open_play',
        ':name' => 'Open Play',
        ':format_type' => 'open-play-doubles',
        ':player_count' => 8,
        ':court_count' => 2,
        ':match_count' => 0,
        ':completed_count' => 0,
        ':tournament_json' => $tournamentJson,
    ]);
    $tournament = $pdo->prepare("SELECT tournament_json, updated_at FROM tournaments WHERE id = :id LIMIT 1");
    $tournament->execute([':id' => 'open_play']);
    expect_same($tournamentJson, $tournament->fetch()['tournament_json'] ?? null, 'Tournament reads back by id');
}

function test_existing_database_is_adopted_without_data_loss(PDO $pdo): void
{
    // A database already in use from before match_scope existed (the state database/add-match-scope-column.sql
    // used to fix by hand), with a shorter username column and no schema_migrations table.
    $pdo->exec(
        "CREATE TABLE games (
            id VARCHAR(96) NOT NULL PRIMARY KEY,
            created_by_user_id INT NULL,
            created_by_name VARCHAR(120) NULL,
            created_by_role VARCHAR(20) NULL,
            scorer_name VARCHAR(120) NULL,
            game_type VARCHAR(20) NOT NULL,
            team_a_name VARCHAR(120) NOT NULL,
            team_b_name VARCHAR(120) NOT NULL,
            team_a_score INT NOT NULL DEFAULT 0,
            team_b_score INT NOT NULL DEFAULT 0,
            winner_team VARCHAR(8) NULL,
            winner_name VARCHAR(120) NULL,
            target_score INT NOT NULL DEFAULT 11,
            win_by_two TINYINT(1) NOT NULL DEFAULT 1,
            side_outs INT NOT NULL DEFAULT 0,
            duration_seconds INT NOT NULL DEFAULT 0,
            created_at DATETIME NULL,
            started_at DATETIME NULL,
            ended_at DATETIME NULL,
            game_json LONGTEXT NOT NULL,
            saved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $pdo->exec(
        "CREATE TABLE tournaments (
            id VARCHAR(96) NOT NULL PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            format_type VARCHAR(40) NOT NULL DEFAULT 'open-play-doubles',
            player_count INT NOT NULL DEFAULT 0,
            court_count INT NOT NULL DEFAULT 1,
            match_count INT NOT NULL DEFAULT 0,
            completed_count INT NOT NULL DEFAULT 0,
            tournament_json LONGTEXT NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $pdo->exec(
        "CREATE TABLE users (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(64) NOT NULL UNIQUE,
            display_name VARCHAR(120) NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'player',
            password_hash VARCHAR(255) NOT NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $pdo->exec(
        "CREATE TABLE user_sessions (
            token_hash CHAR(64) NOT NULL PRIMARY KEY,
            user_id INT NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $pdo->exec(
        "INSERT INTO users (id, username, display_name, role, password_hash, is_active) VALUES
            (1, 'superadmin_ac', 'Master AC', 'super_admin', 'existing-super-admin-hash', 1),
            (2, 'court_admin', 'Court Admin', 'admin', 'existing-admin-hash', 1)"
    );
    $token = bin2hex(random_bytes(32));
    $pdo->prepare(
        "INSERT INTO user_sessions (token_hash, user_id, expires_at)
         VALUES (:token_hash, 2, DATE_ADD(NOW(), INTERVAL 30 DAY))"
    )->execute([':token_hash' => hash('sha256', $token)]);
    $pdo->exec(
        "INSERT INTO games (id, created_by_role, game_type, team_a_name, team_b_name, game_json) VALUES
            ('game_standard', 'admin', 'doubles', 'Team A', 'Team B', '{\"id\":\"game_standard\"}'),
            ('game_tournament', 'admin', 'doubles', 'Ana / Ben', 'Cy / Di', '{\"id\":\"game_tournament\",\"tournamentMatch\":{\"matchId\":\"open_1\"}}'),
            ('game_visitor', 'visitor', 'singles', 'Team A', 'Team B', '{\"id\":\"game_visitor\"}')"
    );
    $tournamentJson = '{"id":"open_play","matches":[{"id":"open_1","status":"completed"}]}';
    $pdo->prepare("INSERT INTO tournaments (id, name, tournament_json) VALUES ('open_play', 'Open Play', :tournament_json)")
        ->execute([':tournament_json' => $tournamentJson]);

    migrate($pdo);

    expect_same(
        ['game_standard' => 'standard', 'game_tournament' => 'tournament', 'game_visitor' => 'visitor'],
        $pdo->query("SELECT id, match_scope FROM games ORDER BY id")->fetchAll(PDO::FETCH_KEY_PAIR),
        'Every existing Game is kept and gets its match scope'
    );
    $_SERVER['HTTP_X_SESSION_TOKEN'] = $token;
    expect_same('court_admin', user_from_request($pdo)['username'] ?? null, 'An existing login still works');
    expect_same(
        'existing-super-admin-hash',
        $pdo->query("SELECT password_hash FROM users WHERE username = 'superadmin_ac'")->fetchColumn(),
        "The Super Admin's existing password is kept"
    );
    $tournament = $pdo->prepare("SELECT tournament_json, updated_at FROM tournaments WHERE id = :id LIMIT 1");
    $tournament->execute([':id' => 'open_play']);
    expect_same('{"id":"open_play","matches":[]}', $tournament->fetch()['tournament_json'] ?? null, 'The existing Tournament matches are moved out of tournament_json');
    expect_same(
        ['open_1' => 'completed'],
        $pdo->query("SELECT id, status FROM tournament_matches WHERE tournament_id = 'open_play'")->fetchAll(PDO::FETCH_KEY_PAIR),
        'The existing Match was moved to its own row with status preserved'
    );

    // Visitor emails up to clean_username()'s 128 characters now fit.
    $pdo->prepare(
        "INSERT INTO users (username, display_name, role, password_hash, is_active)
         VALUES (:username, 'Visitor', 'visitor', '', 1)"
    )->execute([':username' => str_repeat('a', 116) . '@example.com']);
    expect_same(3, (int)$pdo->query("SELECT COUNT(*) FROM users")->fetchColumn(), 'A 128-character visitor email fits');
}

function test_migration_moves_existing_matches_without_data_loss(PDO $pdo): void
{
    // A database with an existing Tournament holding scheduled, in-progress (with lock), and completed matches.
    // We run migrations 001-004 first to simulate the pre-005 database state.
    $allMigrations = schema_migrations();
    $preMigrations = array_intersect_key($allMigrations, array_flip([
        '001_base_tables',
        '002_games_owner_and_match_scope',
        '003_users_username_128',
        '004_seed_super_admin',
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

    $existingTournament = [
        'id' => 'open_play',
        'name' => 'Open Play',
        'courts' => 2,
        'matches' => [
            [
                'id' => 'm_sched',
                'round' => 1,
                'court' => 1,
                'status' => 'scheduled',
                'teamA' => ['Alice', 'Bob'],
                'teamB' => ['Charlie', 'Dave'],
                'scoreA' => '',
                'scoreB' => '',
            ],
            [
                'id' => 'm_live',
                'round' => 1,
                'court' => 2,
                'status' => 'in_progress',
                'teamA' => ['Eve', 'Frank'],
                'teamB' => ['Grace', 'Heidi'],
                'scoreA' => '7',
                'scoreB' => '5',
                'activeGameId' => 'game_live_123',
                'startedAt' => '2026-09-13T10:00:00+08:00',
                'startedBy' => ['id' => 1, 'name' => 'Court Admin'],
            ],
            [
                'id' => 'm_done',
                'round' => 2,
                'court' => 1,
                'status' => 'completed',
                'teamA' => ['Ivan', 'Judy'],
                'teamB' => ['Mallory', 'Niaj'],
                'scoreA' => '11',
                'scoreB' => '9',
                'winner' => 'A',
                'gameId' => 'game_done_456',
                'completedAt' => '2026-09-13T09:45:00+08:00',
                'durationSeconds' => 600,
                'durationMinutes' => 10,
            ],
        ],
    ];

    $pdo->prepare(
        "INSERT INTO tournaments (
            id, name, format_type, player_count, court_count, match_count, completed_count, tournament_json
        ) VALUES (
            :id, :name, 'open-play-doubles', 10, 2, 3, 1, :json
        )"
    )->execute([
        ':id' => 'open_play',
        ':name' => 'Open Play',
        ':json' => json_encode($existingTournament, JSON_UNESCAPED_SLASHES),
    ]);

    // Apply pending migrations
    $ran = migrate($pdo);
    expect_same(['005_tournament_matches', '006_games_tournament_and_players', '007_tournaments_updated_at_microseconds', '008_current_event', '009_players', '010_player_accounts', '011_player_skill_level', '012_rate_limits'], $ran, 'Migrations 005 through 012 run');

    // 1. Check all rows in tournament_matches
    $matches = $pdo->query(
        "SELECT id, tournament_id, sort_order, round, court, status, team_a, team_b,
                score_a, score_b, winner, active_game_id, game_id, duration_seconds,
                duration_minutes, started_at, started_by, completed_at
         FROM tournament_matches
         WHERE tournament_id = 'open_play'
         ORDER BY sort_order ASC"
    )->fetchAll();

    expect_same(3, count($matches), 'All 3 matches moved to tournament_matches');

    // Match 1: scheduled
    expect_same('m_sched', $matches[0]['id'], 'Match 1 id');
    expect_same('scheduled', $matches[0]['status'], 'Match 1 status');
    expect_same('', $matches[0]['score_a'], 'Match 1 score A');
    expect_same('', $matches[0]['score_b'], 'Match 1 score B');
    expect_same(json_encode(['Alice', 'Bob']), $matches[0]['team_a'], 'Match 1 team A');
    expect_same(null, $matches[0]['active_game_id'], 'Match 1 active game id');

    // Match 2: in_progress with lock
    expect_same('m_live', $matches[1]['id'], 'Match 2 id');
    expect_same('in_progress', $matches[1]['status'], 'Match 2 status');
    expect_same('7', $matches[1]['score_a'], 'Match 2 score A');
    expect_same('5', $matches[1]['score_b'], 'Match 2 score B');
    expect_same('game_live_123', $matches[1]['active_game_id'], 'Match 2 lock preserved');
    expect_same('2026-09-13T10:00:00+08:00', $matches[1]['started_at'], 'Match 2 started_at');
    expect_same(json_encode(['id' => 1, 'name' => 'Court Admin']), $matches[1]['started_by'], 'Match 2 started_by');

    // Match 3: completed
    expect_same('m_done', $matches[2]['id'], 'Match 3 id');
    expect_same('completed', $matches[2]['status'], 'Match 3 status');
    expect_same('11', $matches[2]['score_a'], 'Match 3 score A');
    expect_same('9', $matches[2]['score_b'], 'Match 3 score B');
    expect_same('A', $matches[2]['winner'], 'Match 3 winner');
    expect_same('game_done_456', $matches[2]['game_id'], 'Match 3 game id');
    expect_same(600, (int)$matches[2]['duration_seconds'], 'Match 3 duration seconds');
    expect_same(10, (int)$matches[2]['duration_minutes'], 'Match 3 duration minutes');
    expect_same('2026-09-13T09:45:00+08:00', $matches[2]['completed_at'], 'Match 3 completed_at');

    // 2. Check tournaments.tournament_json has matches moved out
    $tJson = $pdo->query("SELECT tournament_json FROM tournaments WHERE id = 'open_play'")->fetchColumn();
    $tDecoded = json_decode((string)$tJson, true);
    expect_same([], $tDecoded['matches'], 'Matches moved out of tournament_json');
    expect_same('Open Play', $tDecoded['name'], 'Tournament metadata preserved');

    // 3. Re-running migration is idempotent
    expect_same([], migrate($pdo), 'Re-running migrate() is a no-op');
}

function test_migration_backfills_game_tournament_and_players(PDO $pdo): void
{
    // Apply migrations 001-005 to simulate pre-006 state
    $allMigrations = schema_migrations();
    $preMigrations = array_intersect_key($allMigrations, array_flip([
        '001_base_tables',
        '002_games_owner_and_match_scope',
        '003_users_username_128',
        '004_seed_super_admin',
        '005_tournament_matches',
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

    // 1. Standalone doubles (slash-separated names)
    $standaloneDoubles = [
        'id' => 'g_standalone_doubles',
        'type' => 'doubles',
        'teamA' => ['name' => '  Ana / Ben  ', 'score' => 11],
        'teamB' => ['name' => 'Cy / Di', 'score' => 7],
    ];
    // 2. Standalone singles
    $standaloneSingles = [
        'id' => 'g_standalone_singles',
        'type' => 'singles',
        'teamA' => ['name' => 'Eve', 'score' => 11],
        'teamB' => ['name' => 'Frank', 'score' => 9],
    ];
    // 3. Tournament doubles (explicit players array)
    $tournamentDoubles = [
        'id' => 'g_tournament_doubles',
        'type' => 'doubles',
        'tournamentMatch' => ['tournamentId' => 'open_play', 'matchId' => 'm1'],
        'teamA' => ['name' => 'Team A', 'players' => [' Alice ', 'Bob'], 'score' => 11],
        'teamB' => ['name' => 'Team B', 'players' => ['Charlie', 'Dave '], 'score' => 4],
    ];
    // 4. Tournament singles
    $tournamentSingles = [
        'id' => 'g_tournament_singles',
        'type' => 'singles',
        'tournamentMatch' => ['tournamentId' => 'summer_cup', 'matchId' => 's1'],
        'teamA' => ['name' => 'Grace', 'players' => ['Grace'], 'score' => 11],
        'teamB' => ['name' => 'Heidi', 'players' => ['Heidi'], 'score' => 8],
    ];

    $insert = $pdo->prepare(
        "INSERT INTO games (id, game_type, team_a_name, team_b_name, game_json)
         VALUES (:id, :game_type, :team_a, :team_b, :json)"
    );
    foreach ([$standaloneDoubles, $standaloneSingles, $tournamentDoubles, $tournamentSingles] as $g) {
        $insert->execute([
            ':id' => $g['id'],
            ':game_type' => $g['type'],
            ':team_a' => $g['teamA']['name'],
            ':team_b' => $g['teamB']['name'],
            ':json' => json_encode($g, JSON_UNESCAPED_SLASHES),
        ]);
    }

    $ran = migrate($pdo);
    expect_same(['006_games_tournament_and_players', '007_tournaments_updated_at_microseconds', '008_current_event', '009_players', '010_player_accounts', '011_player_skill_level', '012_rate_limits'], $ran, '006 through 012 run');

    // Verify tournament_id and tournament_match_id on games table
    $gamesRows = $pdo->query(
        "SELECT id, tournament_id, tournament_match_id FROM games ORDER BY id"
    )->fetchAll();
    $gamesById = [];
    foreach ($gamesRows as $row) {
        $gamesById[$row['id']] = $row;
    }

    expect_same(null, $gamesById['g_standalone_doubles']['tournament_id'], 'Standalone doubles has no tournament_id');
    expect_same(null, $gamesById['g_standalone_doubles']['tournament_match_id'], 'Standalone doubles has no match_id');

    expect_same(null, $gamesById['g_standalone_singles']['tournament_id'], 'Standalone singles has no tournament_id');
    expect_same(null, $gamesById['g_standalone_singles']['tournament_match_id'], 'Standalone singles has no match_id');

    expect_same('open_play', $gamesById['g_tournament_doubles']['tournament_id'], 'Tournament doubles tournament_id');
    expect_same('m1', $gamesById['g_tournament_doubles']['tournament_match_id'], 'Tournament doubles match_id');

    expect_same('summer_cup', $gamesById['g_tournament_singles']['tournament_id'], 'Tournament singles tournament_id');
    expect_same('s1', $gamesById['g_tournament_singles']['tournament_match_id'], 'Tournament singles match_id');

    // Verify game_players entries
    $playersStmt = $pdo->prepare(
        "SELECT team, player_name FROM game_players WHERE game_id = :id ORDER BY id ASC"
    );

    // Standalone doubles
    $playersStmt->execute([':id' => 'g_standalone_doubles']);
    expect_same([
        ['team' => 'A', 'player_name' => 'Ana'],
        ['team' => 'A', 'player_name' => 'Ben'],
        ['team' => 'B', 'player_name' => 'Cy'],
        ['team' => 'B', 'player_name' => 'Di'],
    ], $playersStmt->fetchAll(), 'Standalone doubles players trimmed and split from slash name');

    // Standalone singles
    $playersStmt->execute([':id' => 'g_standalone_singles']);
    expect_same([
        ['team' => 'A', 'player_name' => 'Eve'],
        ['team' => 'B', 'player_name' => 'Frank'],
    ], $playersStmt->fetchAll(), 'Standalone singles players');

    // Tournament doubles
    $playersStmt->execute([':id' => 'g_tournament_doubles']);
    expect_same([
        ['team' => 'A', 'player_name' => 'Alice'],
        ['team' => 'A', 'player_name' => 'Bob'],
        ['team' => 'B', 'player_name' => 'Charlie'],
        ['team' => 'B', 'player_name' => 'Dave'],
    ], $playersStmt->fetchAll(), 'Tournament doubles players trimmed from array');

    // Tournament singles
    $playersStmt->execute([':id' => 'g_tournament_singles']);
    expect_same([
        ['team' => 'A', 'player_name' => 'Grace'],
        ['team' => 'B', 'player_name' => 'Heidi'],
    ], $playersStmt->fetchAll(), 'Tournament singles players');

    // Re-running migrate() is idempotent
    expect_same([], migrate($pdo), 'Re-running migrate() is a no-op');
}

run_db_tests([
    'test_empty_database_gets_full_schema',
    'test_existing_database_is_adopted_without_data_loss',
    'test_migration_moves_existing_matches_without_data_loss',
    'test_migration_backfills_game_tournament_and_players',
]);
