<?php
declare(strict_types=1);

require_once __DIR__ . '/players.php';

const DEFAULT_SUPER_ADMIN_PASSWORD_HASH = '$2y$10$vD0YZdFB.aUNDdXACw4DMOT2IURWH8A/G1WkRvBsMZHp/q5zFvKjW';

// Schema migration module: brings the database to the latest schema.
// Each migration runs once, in order, and is recorded in schema_migrations.
// Append new migrations; never edit or reorder shipped ones. Each must be safe to re-run:
// MySQL can't roll back DDL, so a crash mid-migration runs it again next time.

function migrate(PDO $pdo): array
{
    if (!pending_migrations($pdo)) {
        return [];
    }

    // Requests arriving together right after a deploy wait here instead of racing the same ALTERs.
    if ((int)$pdo->query("SELECT GET_LOCK('paddlepoint_schema', 60)")->fetchColumn() !== 1) {
        throw new RuntimeException('Timed out waiting for the schema migration lock');
    }
    try {
        $ran = [];
        foreach (pending_migrations($pdo) as $name => $migration) {
            $migration($pdo);
            $pdo->prepare("INSERT INTO schema_migrations (name) VALUES (:name)")->execute([':name' => $name]);
            $ran[] = $name;
        }
        return $ran;
    } finally {
        $pdo->query("SELECT RELEASE_LOCK('paddlepoint_schema')")->fetchColumn();
    }
}

function pending_migrations(PDO $pdo): array
{
    try {
        $applied = $pdo->query("SELECT name FROM schema_migrations")->fetchAll(PDO::FETCH_COLUMN);
    } catch (PDOException $error) {
        if ($error->getCode() !== '42S02') { // anything but "table doesn't exist yet"
            throw $error;
        }
        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                name VARCHAR(64) NOT NULL PRIMARY KEY,
                applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $applied = [];
    }

    return array_diff_key(schema_migrations(), array_flip($applied));
}

function schema_migrations(): array
{
    return [
        '001_base_tables' => static function (PDO $pdo): void {
            $pdo->exec(
                "CREATE TABLE IF NOT EXISTS games (
                    id VARCHAR(96) NOT NULL PRIMARY KEY,
                    created_by_user_id INT NULL,
                    created_by_name VARCHAR(120) NULL,
                    created_by_role VARCHAR(20) NULL,
                    match_scope VARCHAR(20) NOT NULL DEFAULT 'standard',
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
                    saved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_games_saved_at (saved_at),
                    INDEX idx_games_ended_at (ended_at),
                    INDEX idx_games_created_by_user_id (created_by_user_id),
                    INDEX idx_games_created_by_role (created_by_role),
                    INDEX idx_games_match_scope (match_scope),
                    INDEX idx_games_scorer_name (scorer_name)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            );
            $pdo->exec(
                "CREATE TABLE IF NOT EXISTS tournaments (
                    id VARCHAR(96) NOT NULL PRIMARY KEY,
                    name VARCHAR(120) NOT NULL,
                    format_type VARCHAR(40) NOT NULL DEFAULT 'open-play-doubles',
                    player_count INT NOT NULL DEFAULT 0,
                    court_count INT NOT NULL DEFAULT 1,
                    match_count INT NOT NULL DEFAULT 0,
                    completed_count INT NOT NULL DEFAULT 0,
                    tournament_json LONGTEXT NOT NULL,
                    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                    INDEX idx_tournaments_updated_at (updated_at),
                    INDEX idx_tournaments_name (name)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            );
            $pdo->exec(
                "CREATE TABLE IF NOT EXISTS users (
                    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    username VARCHAR(128) NOT NULL UNIQUE,
                    display_name VARCHAR(120) NOT NULL,
                    role VARCHAR(20) NOT NULL DEFAULT 'player',
                    password_hash VARCHAR(255) NOT NULL,
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_users_role (role),
                    INDEX idx_users_active (is_active)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            );
            $pdo->exec(
                "CREATE TABLE IF NOT EXISTS user_sessions (
                    token_hash CHAR(64) NOT NULL PRIMARY KEY,
                    user_id INT NOT NULL,
                    expires_at DATETIME NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_user_sessions_user_id (user_id),
                    INDEX idx_user_sessions_expires_at (expires_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            );
        },
        // Databases created before these columns existed.
        '002_games_owner_and_match_scope' => static function (PDO $pdo): void {
            ensure_column($pdo, 'games', 'created_by_user_id', 'INT NULL');
            ensure_column($pdo, 'games', 'created_by_name', 'VARCHAR(120) NULL');
            ensure_column($pdo, 'games', 'created_by_role', 'VARCHAR(20) NULL');
            ensure_column($pdo, 'games', 'match_scope', "VARCHAR(20) NOT NULL DEFAULT 'standard'");
            ensure_index($pdo, 'games', 'idx_games_match_scope', 'match_scope');
            $pdo->exec("UPDATE games SET match_scope = 'visitor' WHERE created_by_role = 'visitor'");
            $pdo->exec("UPDATE games SET match_scope = 'tournament' WHERE match_scope = 'standard' AND game_json LIKE '%\"tournamentMatch\":%'");
        },
        '003_users_username_128' => static function (PDO $pdo): void {
            $pdo->exec("ALTER TABLE users MODIFY username VARCHAR(128) NOT NULL");
        },
        '004_seed_super_admin' => static function (PDO $pdo): void {
            ensure_default_admin($pdo);
        },
        '005_tournament_matches' => static function (PDO $pdo): void {
            $pdo->exec(
                "CREATE TABLE IF NOT EXISTS tournament_matches (
                    tournament_id VARCHAR(96) NOT NULL,
                    id VARCHAR(96) NOT NULL,
                    sort_order INT NOT NULL DEFAULT 0,
                    round INT NOT NULL DEFAULT 1,
                    court INT NOT NULL DEFAULT 1,
                    status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
                    team_a TEXT NULL,
                    team_b TEXT NULL,
                    score_a VARCHAR(8) NOT NULL DEFAULT '',
                    score_b VARCHAR(8) NOT NULL DEFAULT '',
                    winner VARCHAR(8) NULL,
                    active_game_id VARCHAR(96) NULL,
                    game_id VARCHAR(96) NULL,
                    duration_seconds INT NULL,
                    duration_minutes INT NULL,
                    started_at VARCHAR(64) NULL,
                    started_by TEXT NULL,
                    completed_at VARCHAR(64) NULL,
                    match_json LONGTEXT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (tournament_id, id),
                    INDEX idx_tm_tournament_id (tournament_id),
                    INDEX idx_tm_status (status),
                    INDEX idx_tm_court (court)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            );

            $stmt = $pdo->query("SELECT id, tournament_json FROM tournaments");
            $tournaments = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $insert = $pdo->prepare(
                "INSERT INTO tournament_matches (
                    tournament_id, id, sort_order, round, court, status,
                    team_a, team_b, score_a, score_b, winner,
                    active_game_id, game_id, duration_seconds, duration_minutes,
                    started_at, started_by, completed_at, match_json
                ) VALUES (
                    :tournament_id, :id, :sort_order, :round, :court, :status,
                    :team_a, :team_b, :score_a, :score_b, :winner,
                    :active_game_id, :game_id, :duration_seconds, :duration_minutes,
                    :started_at, :started_by, :completed_at, :match_json
                )
                ON DUPLICATE KEY UPDATE
                    sort_order = VALUES(sort_order),
                    round = VALUES(round),
                    court = VALUES(court),
                    status = VALUES(status),
                    team_a = VALUES(team_a),
                    team_b = VALUES(team_b),
                    score_a = VALUES(score_a),
                    score_b = VALUES(score_b),
                    winner = VALUES(winner),
                    active_game_id = VALUES(active_game_id),
                    game_id = VALUES(game_id),
                    duration_seconds = VALUES(duration_seconds),
                    duration_minutes = VALUES(duration_minutes),
                    started_at = VALUES(started_at),
                    started_by = VALUES(started_by),
                    completed_at = VALUES(completed_at),
                    match_json = VALUES(match_json)"
            );
            $updateTournament = $pdo->prepare("UPDATE tournaments SET tournament_json = :json WHERE id = :id");

            foreach ($tournaments as $row) {
                $tId = (string)$row['id'];
                $tData = json_decode((string)$row['tournament_json'], true);
                if (!is_array($tData) || empty($tData['matches']) || !is_array($tData['matches'])) {
                    continue;
                }

                $sortOrder = 0;
                foreach ($tData['matches'] as $match) {
                    if (!is_array($match) || empty($match['id'])) {
                        continue;
                    }
                    $matchId = (string)$match['id'];
                    $status = in_array($match['status'] ?? '', ['scheduled', 'in_progress', 'completed'], true) ? $match['status'] : 'scheduled';
                    $winner = in_array($match['winner'] ?? '', ['A', 'B'], true) ? $match['winner'] : null;
                    $scoreA = isset($match['scoreA']) ? substr(preg_replace('/\D+/', '', (string)$match['scoreA']) ?? '', 0, 2) : '';
                    $scoreB = isset($match['scoreB']) ? substr(preg_replace('/\D+/', '', (string)$match['scoreB']) ?? '', 0, 2) : '';

                    $insert->execute([
                        ':tournament_id' => $tId,
                        ':id' => $matchId,
                        ':sort_order' => $sortOrder,
                        ':round' => isset($match['round']) ? (int)$match['round'] : 1,
                        ':court' => isset($match['court']) ? (int)$match['court'] : 1,
                        ':status' => $status,
                        ':team_a' => isset($match['teamA']) ? json_encode($match['teamA'], JSON_UNESCAPED_SLASHES) : null,
                        ':team_b' => isset($match['teamB']) ? json_encode($match['teamB'], JSON_UNESCAPED_SLASHES) : null,
                        ':score_a' => $scoreA,
                        ':score_b' => $scoreB,
                        ':winner' => $winner,
                        ':active_game_id' => !empty($match['activeGameId']) ? (string)$match['activeGameId'] : null,
                        ':game_id' => !empty($match['gameId']) ? (string)$match['gameId'] : null,
                        ':duration_seconds' => isset($match['durationSeconds']) && is_numeric($match['durationSeconds']) ? (int)$match['durationSeconds'] : null,
                        ':duration_minutes' => isset($match['durationMinutes']) && is_numeric($match['durationMinutes']) ? (int)$match['durationMinutes'] : null,
                        ':started_at' => !empty($match['startedAt']) ? (string)$match['startedAt'] : null,
                        ':started_by' => isset($match['startedBy']) && is_array($match['startedBy']) ? json_encode($match['startedBy'], JSON_UNESCAPED_SLASHES) : null,
                        ':completed_at' => !empty($match['completedAt']) ? (string)$match['completedAt'] : null,
                        ':match_json' => json_encode($match, JSON_UNESCAPED_SLASHES),
                    ]);
                    $sortOrder++;
                }

                $tData['matches'] = [];
                $updateTournament->execute([
                    ':json' => json_encode($tData, JSON_UNESCAPED_SLASHES),
                    ':id' => $tId,
                ]);
            }
        },
        '006_games_tournament_and_players' => static function (PDO $pdo): void {
            ensure_column($pdo, 'games', 'tournament_id', 'VARCHAR(96) NULL');
            ensure_column($pdo, 'games', 'tournament_match_id', 'VARCHAR(96) NULL');
            ensure_index($pdo, 'games', 'idx_games_tournament_id', 'tournament_id');
            ensure_index($pdo, 'games', 'idx_games_tournament_match_id', 'tournament_match_id');

            $pdo->exec(
                "CREATE TABLE IF NOT EXISTS game_players (
                    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    game_id VARCHAR(96) NOT NULL,
                    team VARCHAR(8) NOT NULL,
                    player_name VARCHAR(120) NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_game_players_game_id (game_id),
                    INDEX idx_game_players_player_name (player_name),
                    INDEX idx_game_players_name_game (player_name, game_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            );

            $extractPlayers = static function (array $game): array {
                $players = [];
                foreach (['A' => 'teamA', 'B' => 'teamB'] as $teamKey => $teamProp) {
                    $team = $game[$teamProp] ?? null;
                    if (!is_array($team)) {
                        $flatName = (string)($game["team_{$teamKey}_name"] ?? '');
                        if ($flatName !== '') {
                            $team = ['name' => $flatName];
                        } else {
                            continue;
                        }
                    }

                    $teamPlayers = [];
                    if (!empty($team['players']) && is_array($team['players'])) {
                        foreach ($team['players'] as $p) {
                            $name = trim((string)$p);
                            if ($name !== '') {
                                $teamPlayers[] = $name;
                            }
                        }
                    }

                    if (empty($teamPlayers)) {
                        $name = trim((string)($team['name'] ?? ''));
                        if ($name !== '') {
                            if (str_contains($name, '/')) {
                                foreach (explode('/', $name) as $part) {
                                    $pName = trim($part);
                                    if ($pName !== '') {
                                        $teamPlayers[] = $pName;
                                    }
                                }
                            } else {
                                $teamPlayers[] = $name;
                            }
                        }
                    }

                    foreach ($teamPlayers as $playerName) {
                        $players[] = [
                            'team' => $teamKey,
                            'name' => $playerName,
                        ];
                    }
                }
                return $players;
            };

            $stmt = $pdo->query("SELECT id, game_type, team_a_name, team_b_name, game_json FROM games");
            $games = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $updateGame = $pdo->prepare("UPDATE games SET tournament_id = :tid, tournament_match_id = :mid WHERE id = :id");
            $insertPlayer = $pdo->prepare(
                "INSERT INTO game_players (game_id, team, player_name) VALUES (:game_id, :team, :player_name)"
            );
            $clearPlayers = $pdo->prepare("DELETE FROM game_players WHERE game_id = :game_id");

            foreach ($games as $row) {
                $gId = (string)$row['id'];
                $gData = json_decode((string)$row['game_json'], true);
                if (!is_array($gData)) {
                    $gData = [];
                }
                if (!isset($gData['teamA']) && !empty($row['team_a_name'])) {
                    $gData['teamA'] = ['name' => $row['team_a_name']];
                }
                if (!isset($gData['teamB']) && !empty($row['team_b_name'])) {
                    $gData['teamB'] = ['name' => $row['team_b_name']];
                }
                if (!isset($gData['type']) && !empty($row['game_type'])) {
                    $gData['type'] = $row['game_type'];
                }

                $tournamentMatch = $gData['tournamentMatch'] ?? null;
                $tournamentId = null;
                $tournamentMatchId = null;
                if (is_array($tournamentMatch)) {
                    $tournamentId = !empty($tournamentMatch['tournamentId']) ? trim((string)$tournamentMatch['tournamentId']) : 'open_play';
                    $tournamentMatchId = !empty($tournamentMatch['matchId']) ? trim((string)$tournamentMatch['matchId']) : null;
                }

                $updateGame->execute([
                    ':tid' => $tournamentId,
                    ':mid' => $tournamentMatchId,
                    ':id' => $gId,
                ]);

                $players = $extractPlayers($gData);
                $clearPlayers->execute([':game_id' => $gId]);
                foreach ($players as $p) {
                    $insertPlayer->execute([
                        ':game_id' => $gId,
                        ':team' => $p['team'],
                        ':player_name' => $p['name'],
                    ]);
                }
            }
        },
        '007_tournaments_updated_at_microseconds' => static function (PDO $pdo): void {
            $pdo->exec("ALTER TABLE tournaments MODIFY updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)");
        },
        '008_current_event' => static function (PDO $pdo): void {
            $pdo->exec(
                "CREATE TABLE IF NOT EXISTS app_settings (
                    setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
                    setting_value VARCHAR(255) NOT NULL,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            );
            $pdo->exec("INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('current_event_id', 'open_play')");
        },
        // Players become lasting records (ADR 0005), separate from names. Every distinct normalised
        // name found in a non-Visitor Game, a Tournament roster or a Tournament Match is backfilled
        // into one Player, and game_players.player_id is linked wherever it can be resolved.
        '009_players' => static function (PDO $pdo): void {
            $pdo->exec(
                "CREATE TABLE IF NOT EXISTS players (
                    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(120) NOT NULL,
                    normalized_name VARCHAR(120) NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uniq_players_normalized_name (normalized_name)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            );
            ensure_column($pdo, 'game_players', 'player_id', 'INT NULL');
            ensure_index($pdo, 'game_players', 'idx_game_players_player_id', 'player_id');

            // Backed by the same find_or_create_player() the runtime save paths use, so the backfill
            // and going-forward saves can never disagree on what counts as the same Player. Cached by
            // normalized name so a name repeated across many rows costs one lookup, not one per row.
            $cache = [];
            $findOrCreate = static function (PDO $pdo, array &$cache, string $rawName): ?int {
                $normalized = normalize_player_name($rawName);
                if ($normalized === '') {
                    return null;
                }
                if (!isset($cache[$normalized])) {
                    $player = find_or_create_player($pdo, $rawName);
                    $cache[$normalized] = $player ? (int)$player['id'] : null;
                }
                return $cache[$normalized];
            };

            // Every non-Visitor Game's recorded players.
            $rows = $pdo->query(
                "SELECT gp.id, gp.player_name
                 FROM game_players gp
                 INNER JOIN games ON games.id = gp.game_id
                 WHERE (games.match_scope IS NULL OR games.match_scope <> 'visitor')
                   AND (games.created_by_role IS NULL OR games.created_by_role <> 'visitor')
                 ORDER BY gp.id ASC"
            )->fetchAll(PDO::FETCH_ASSOC);
            $updatePlayerId = $pdo->prepare("UPDATE game_players SET player_id = :player_id WHERE id = :id");
            foreach ($rows as $row) {
                $playerId = $findOrCreate($pdo, $cache, (string)$row['player_name']);
                if ($playerId !== null) {
                    $updatePlayerId->execute([':player_id' => $playerId, ':id' => (int)$row['id']]);
                }
            }

            // Tournament rosters (playersText, free-typed names not yet tied to a Game).
            $tournamentRows = $pdo->query("SELECT tournament_json FROM tournaments")->fetchAll(PDO::FETCH_COLUMN);
            foreach ($tournamentRows as $json) {
                $data = json_decode((string)$json, true);
                if (!is_array($data) || empty($data['playersText'])) {
                    continue;
                }
                foreach (preg_split('/[\n,]+/', (string)$data['playersText']) ?: [] as $name) {
                    $findOrCreate($pdo, $cache, (string)$name);
                }
            }

            // Tournament Schedules (team_a/team_b JSON on tournament_matches).
            $matchRows = $pdo->query("SELECT team_a, team_b FROM tournament_matches")->fetchAll(PDO::FETCH_ASSOC);
            foreach ($matchRows as $row) {
                foreach (['team_a', 'team_b'] as $column) {
                    if (empty($row[$column])) {
                        continue;
                    }
                    foreach (names_from_team_json((string)$row[$column]) as $name) {
                        $findOrCreate($pdo, $cache, $name);
                    }
                }
            }
        },
        // Links each existing Player account to the Player matching its display name, or failing
        // that its username, so History and Leaderboard filter by that link (ADR 0005) from here on.
        // Each Player is linked to at most one account; the lowest account id wins a tie.
        '010_player_accounts' => static function (PDO $pdo): void {
            ensure_column($pdo, 'users', 'player_id', 'INT NULL');
            // Unique (nullable-unique: MySQL allows any number of NULLs), so "no Player is linked to
            // more than one account" is enforced by the database itself, not by an in-memory check that
            // a crashed-and-resumed migration, or a race with a concurrent account creation, could miss.
            ensure_index($pdo, 'users', 'idx_users_player_id', 'player_id', unique: true);

            $playerIdByName = $pdo->query("SELECT normalized_name, id FROM players")
                ->fetchAll(PDO::FETCH_KEY_PAIR);

            $accounts = $pdo->query(
                "SELECT id, display_name, username FROM users
                 WHERE role = 'player' AND player_id IS NULL
                 ORDER BY id ASC"
            )->fetchAll(PDO::FETCH_ASSOC);
            $update = $pdo->prepare("UPDATE users SET player_id = :player_id WHERE id = :id");
            foreach ($accounts as $account) {
                $playerId = $playerIdByName[normalize_player_name((string)$account['display_name'])]
                    ?? $playerIdByName[normalize_player_name((string)$account['username'])]
                    ?? null;
                if ($playerId === null) {
                    continue;
                }
                try {
                    $update->execute([':player_id' => (int)$playerId, ':id' => (int)$account['id']]);
                } catch (PDOException $error) {
                    if ($error->getCode() !== '23000') { // anything but that Player already having a linked account
                        throw $error;
                    }
                }
            }
        },
        // Adds skill_level to players (ADR 0005, ticket 05). Defaults to NULL (representing Unrated).
        // Valid non-null values: 'beginner', 'intermediate', 'advanced'.
        '011_player_skill_level' => static function (PDO $pdo): void {
            ensure_column($pdo, 'players', 'skill_level', 'VARCHAR(20) NULL DEFAULT NULL');
        },
        '012_rate_limits' => static function (PDO $pdo): void {
            $pdo->exec("CREATE TABLE IF NOT EXISTS rate_limits (
                bucket VARCHAR(191) NOT NULL PRIMARY KEY,
                window_start DATETIME NOT NULL,
                hits INT NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        },
    ];
}

// Flattens a tournament_matches team_a/team_b JSON value into its player names, whichever of the
// three shapes it was saved in: an explicit players array, a {name: "..."} team, or (from before
// migration 005) a bare ["Alice", "Bob"] array.
function names_from_team_json(string $json): array
{
    $team = json_decode($json, true);
    if (!is_array($team)) {
        return [];
    }
    if (!empty($team['players']) && is_array($team['players'])) {
        $names = $team['players'];
    } elseif (isset($team['name'])) {
        $names = [$team['name']];
    } else {
        $names = $team;
    }
    return array_values(array_filter($names, 'is_string'));
}

function ensure_column(PDO $pdo, string $table, string $column, string $definition): void
{
    $statement = $pdo->prepare(
        "SELECT COUNT(*) AS column_count
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table_name
           AND COLUMN_NAME = :column_name"
    );
    $statement->execute([
        ':table_name' => $table,
        ':column_name' => $column,
    ]);
    if ((int)($statement->fetch()['column_count'] ?? 0) > 0) {
        return;
    }

    $safeTable = str_replace('`', '``', $table);
    $safeColumn = str_replace('`', '``', $column);
    $pdo->exec("ALTER TABLE `$safeTable` ADD COLUMN `$safeColumn` $definition");
}

function ensure_index(PDO $pdo, string $table, string $index, string $column, bool $unique = false): void
{
    $statement = $pdo->prepare(
        "SELECT COUNT(*) AS index_count
         FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table_name
           AND INDEX_NAME = :index_name"
    );
    $statement->execute([
        ':table_name' => $table,
        ':index_name' => $index,
    ]);
    if ((int)($statement->fetch()['index_count'] ?? 0) > 0) {
        return;
    }

    $safeTable = str_replace('`', '``', $table);
    $safeIndex = str_replace('`', '``', $index);
    $safeColumn = str_replace('`', '``', $column);
    $keyword = $unique ? 'UNIQUE INDEX' : 'INDEX';
    $pdo->exec("CREATE $keyword `$safeIndex` ON `$safeTable` (`$safeColumn`)");
}

function ensure_default_admin(PDO $pdo): void
{
    $seedUsername = 'superadmin_ac';
    $seedDisplayName = 'Master AC';

    $statement = $pdo->prepare("SELECT id, role FROM users WHERE username = :username LIMIT 1");
    $statement->execute([':username' => $seedUsername]);
    $existing = $statement->fetch();
    if ($existing) {
        if (($existing['role'] ?? '') !== 'super_admin') {
            $update = $pdo->prepare("UPDATE users SET role = 'super_admin', is_active = 1 WHERE id = :id");
            $update->execute([':id' => (int)$existing['id']]);
        }
        return;
    }

    $insert = $pdo->prepare(
        "INSERT INTO users (username, display_name, role, password_hash, is_active)
         VALUES (:username, :display_name, 'super_admin', :password_hash, 1)"
    );
    $insert->execute([
        ':username' => $seedUsername,
        ':display_name' => $seedDisplayName,
        ':password_hash' => DEFAULT_SUPER_ADMIN_PASSWORD_HASH,
    ]);
}
