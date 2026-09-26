<?php
declare(strict_types=1);

require_once __DIR__ . '/analytics.php';

// Returns [status, payload] for GET /api/qlik/get-matches: one row per Tournament Match.
function read_qlik_matches(PDO $pdo, string $providedKey, array $query = []): array
{
    $conflict = analytics_key_conflict($providedKey);
    if ($conflict !== null) {
        return $conflict;
    }

    $eventId = isset($query['event']) ? trim((string)$query['event']) : '';
    if ($eventId !== '' && !qlik_event_exists($pdo, $eventId)) {
        return [404, ['ok' => false, 'error' => 'Event was not found']];
    }

    $sql = "SELECT tournament_id, id, round, court, status, team_a, team_b,
                   score_a, score_b, winner, started_at, completed_at, game_id
            FROM tournament_matches";
    $params = [];
    if ($eventId !== '') {
        $sql .= " WHERE tournament_id = :event_id";
        $params[':event_id'] = $eventId;
    }
    $sql .= " ORDER BY tournament_id ASC, sort_order ASC";

    $statement = $pdo->prepare($sql);
    $statement->execute($params);
    $rows = $statement->fetchAll(PDO::FETCH_ASSOC);

    return [200, ['ok' => true, 'rows' => array_map('qlik_match_row', $rows)]];
}

function qlik_match_row(array $row): array
{
    return [
        'eventId' => (string)$row['tournament_id'],
        'matchId' => (string)$row['id'],
        'round' => (int)$row['round'],
        'court' => (int)$row['court'],
        'status' => (string)$row['status'],
        'teamA' => json_decode((string)$row['team_a'], true) ?: [],
        'teamB' => json_decode((string)$row['team_b'], true) ?: [],
        'scoreA' => $row['score_a'] !== '' ? (int)$row['score_a'] : null,
        'scoreB' => $row['score_b'] !== '' ? (int)$row['score_b'] : null,
        'winner' => $row['winner'] !== null ? (string)$row['winner'] : null,
        'startedAt' => normalize_iso_utc($row['started_at']),
        'completedAt' => normalize_iso_utc($row['completed_at']),
        'gameId' => $row['game_id'] !== null ? (string)$row['game_id'] : null,
    ];
}
