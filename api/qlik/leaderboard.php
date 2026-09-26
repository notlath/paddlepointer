<?php
declare(strict_types=1);

require_once __DIR__ . '/analytics.php';

// Returns [status, payload] for GET /api/qlik/get-leaderboard-results.
function read_qlik_leaderboard_results(PDO $pdo, string $providedKey, array $query = []): array
{
    $conflict = analytics_key_conflict($providedKey);
    if ($conflict !== null) {
        return $conflict;
    }

    $eventId = isset($query['event']) ? trim((string)$query['event']) : '';
    if ($eventId !== '' && !qlik_event_exists($pdo, $eventId)) {
        return [404, ['ok' => false, 'error' => 'Event was not found']];
    }

    $sql = "SELECT games.id, games.tournament_id, games.winner_team, games.team_a_score, games.team_b_score,
                   games.target_score, games.duration_seconds, games.ended_at, games.game_json,
                   tournament_matches.round, tournament_matches.court
            FROM games
            LEFT JOIN tournament_matches
              ON tournament_matches.tournament_id = games.tournament_id
             AND tournament_matches.id = games.tournament_match_id
            WHERE (match_scope IS NULL OR match_scope <> 'visitor')
              AND (created_by_role IS NULL OR created_by_role <> 'visitor')
              AND winner_team IN ('A', 'B')";
    $params = [];
    if ($eventId !== '') {
        $sql .= ' AND games.tournament_id = :event_id';
        $params[':event_id'] = $eventId;
    }
    $sql .= ' ORDER BY games.id ASC';

    $statement = $pdo->prepare($sql);
    $statement->execute($params);
    $rows = $statement->fetchAll(PDO::FETCH_ASSOC);

    return [200, ['ok' => true, 'rows' => array_map('qlik_leaderboard_result_row', $rows)]];
}

function qlik_leaderboard_result_row(array $row): array
{
    $durationSeconds = (int)($row['duration_seconds'] ?? 0);
    $game = json_decode((string)($row['game_json'] ?? ''), true);
    $events = is_array($game) && is_array($game['events'] ?? null) ? $game['events'] : [];
    $rallyStats = qlik_rally_stats($events);

    return [
        'matchId' => (string)$row['id'],
        'eventId' => $row['tournament_id'] !== null && $row['tournament_id'] !== '' ? (string)$row['tournament_id'] : null,
        'winner' => (string)$row['winner_team'],
        'teamAScore' => (int)$row['team_a_score'],
        'teamBScore' => (int)$row['team_b_score'],
        'targetScore' => (int)$row['target_score'],
        'durationSeconds' => $durationSeconds > 0 ? $durationSeconds : null,
        'completedAt' => normalize_iso_utc($row['ended_at']),
        'round' => $row['round'] !== null ? (int)$row['round'] : null,
        'court' => $row['court'] !== null ? (int)$row['court'] : null,
        'sideOuts' => $rallyStats['sideOuts'],
        'rallyCount' => $rallyStats['rallyCount'],
        'teamALongestRun' => $rallyStats['teamALongestRun'],
        'teamBLongestRun' => $rallyStats['teamBLongestRun'],
    ];
}

// Each entry in a Game's Rally log (see rally-engine.js) is one Rally, resulting in a point,
// a server-switch (same Team keeps serving) or a side-out (serve passes to the other Team).
// A scoring run is broken by a side-out, not by a server-switch, since the Team keeps serving through one.
function qlik_rally_stats(array $events): array
{
    $sideOuts = 0;
    $rallyCount = 0;
    $run = ['A' => 0, 'B' => 0];
    $longestRun = ['A' => 0, 'B' => 0];

    foreach ($events as $event) {
        if (!is_array($event)) {
            continue;
        }
        $action = (string)($event['action'] ?? '');
        // Serve corrections and timeouts are Rally-log entries, not Rallies.
        if ($action !== 'correction' && $action !== 'timeout') {
            $rallyCount++;
        }
        if ($action === 'point') {
            $winner = (string)($event['rallyWinner'] ?? '');
            if ($winner === 'A' || $winner === 'B') {
                $run[$winner]++;
                $longestRun[$winner] = max($longestRun[$winner], $run[$winner]);
            }
        } elseif ($action === 'side-out') {
            $sideOuts++;
            $run = ['A' => 0, 'B' => 0];
        }
    }

    return [
        'sideOuts' => $sideOuts,
        'rallyCount' => $rallyCount,
        'teamALongestRun' => $longestRun['A'],
        'teamBLongestRun' => $longestRun['B'],
    ];
}

// Returns [status, payload] for GET /api/qlik/get-leaderboard-players.
function read_qlik_leaderboard_players(PDO $pdo, string $providedKey, array $query = []): array
{
    $conflict = analytics_key_conflict($providedKey);
    if ($conflict !== null) {
        return $conflict;
    }

    $eventId = isset($query['event']) ? trim((string)$query['event']) : '';
    if ($eventId !== '' && !qlik_event_exists($pdo, $eventId)) {
        return [404, ['ok' => false, 'error' => 'Event was not found']];
    }

    $gameSql = "SELECT games.id, games.tournament_id, game_players.team, game_players.player_name
                FROM games
                INNER JOIN game_players ON game_players.game_id = games.id
                WHERE (games.match_scope IS NULL OR games.match_scope <> 'visitor')
                  AND (games.created_by_role IS NULL OR games.created_by_role <> 'visitor')";
    $params = [];
    if ($eventId !== '') {
        $gameSql .= ' AND games.tournament_id = :event_id';
        $params[':event_id'] = $eventId;
    }
    $gameSql .= ' ORDER BY games.id ASC, game_players.id ASC';

    $gameStatement = $pdo->prepare($gameSql);
    $gameStatement->execute($params);
    $rows = array_map('qlik_leaderboard_player_row', $gameStatement->fetchAll(PDO::FETCH_ASSOC));

    $matchSql = "SELECT tournament_id, id, team_a, team_b
                 FROM tournament_matches
                 WHERE status IN ('scheduled', 'in_progress')
                   AND NOT EXISTS (
                       SELECT 1 FROM games
                       WHERE games.tournament_id = tournament_matches.tournament_id
                         AND games.tournament_match_id = tournament_matches.id
                         AND (games.match_scope IS NULL OR games.match_scope <> 'visitor')
                         AND (games.created_by_role IS NULL OR games.created_by_role <> 'visitor')
                   )";
    $matchParams = [];
    if ($eventId !== '') {
        $matchSql .= ' AND tournament_id = :event_id';
        $matchParams[':event_id'] = $eventId;
    }
    $matchSql .= ' ORDER BY tournament_id ASC, sort_order ASC';

    $matchStatement = $pdo->prepare($matchSql);
    $matchStatement->execute($matchParams);
    foreach ($matchStatement->fetchAll(PDO::FETCH_ASSOC) as $match) {
        foreach (['A' => 'team_a', 'B' => 'team_b'] as $team => $column) {
            $players = json_decode((string)$match[$column], true);
            if (!is_array($players)) {
                continue;
            }
            foreach ($players as $playerName) {
                $playerName = trim((string)$playerName);
                if ($playerName !== '') {
                    $rows[] = [
                        'matchId' => (string)$match['id'],
                        'eventId' => (string)$match['tournament_id'],
                        'team' => $team,
                        'playerName' => $playerName,
                    ];
                }
            }
        }
    }

    return [200, ['ok' => true, 'rows' => $rows]];
}

function qlik_leaderboard_player_row(array $row): array
{
    return [
        'matchId' => (string)$row['id'],
        'eventId' => $row['tournament_id'] !== null && $row['tournament_id'] !== '' ? (string)$row['tournament_id'] : null,
        'team' => (string)$row['team'],
        'playerName' => trim((string)$row['player_name']),
    ];
}
