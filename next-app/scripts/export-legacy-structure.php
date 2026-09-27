<?php
declare(strict_types=1);

// Read-only snapshot for import-legacy-structure.ts. Run against a consistent MySQL snapshot.
require_once __DIR__ . '/../../api/config.php';

try {
    $pdo = new PDO(
        sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', DB_HOST, DB_PORT, DB_NAME),
        DB_USER,
        DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
    $pdo->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    $pdo->beginTransaction();
    $snapshot = [
        'players' => $pdo->query('SELECT id, name, skill_level, created_at FROM players ORDER BY id')->fetchAll(),
        'tournaments' => $pdo->query('SELECT id, name, court_count, tournament_json, updated_at FROM tournaments ORDER BY id')->fetchAll(),
        'matches' => $pdo->query('SELECT tournament_id, id, round, court, status, team_a, team_b, started_at, completed_at FROM tournament_matches ORDER BY tournament_id, sort_order, id')->fetchAll(),
        'games' => $pdo->query('SELECT id, created_by_user_id, created_by_role, match_scope, tournament_id, tournament_match_id, team_a_score, team_b_score, winner_team, target_score, duration_seconds, started_at, ended_at, game_json FROM games ORDER BY id')->fetchAll(),
        'gamePlayers' => $pdo->query('SELECT game_id, team, player_name, player_id FROM game_players ORDER BY game_id, team, id')->fetchAll(),
        'legacyUsers' => $pdo->query('SELECT id, role, player_id FROM users ORDER BY id')->fetchAll(),
        'currentEventId' => $pdo->query("SELECT setting_value FROM app_settings WHERE setting_key = 'current_event_id'")->fetchColumn() ?: null,
    ];
    $pdo->commit();
    echo json_encode($snapshot, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES), PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, "Legacy export failed: {$error->getMessage()}\n");
    exit(1);
}
