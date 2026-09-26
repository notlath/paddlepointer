<?php
declare(strict_types=1);

require_once __DIR__ . '/analytics.php';
require_once __DIR__ . '/../db.php';

// Returns [status, payload] for GET /api/qlik/get-events: one row per Event (Tournament).
function read_qlik_events(PDO $pdo, string $providedKey, array $query = []): array
{
    $conflict = analytics_key_conflict($providedKey);
    if ($conflict !== null) {
        return $conflict;
    }

    $eventId = isset($query['event']) ? trim((string)$query['event']) : '';

    $sql = "SELECT
                t.id,
                t.name,
                t.court_count,
                t.match_count,
                t.completed_count,
                (SELECT MIN(started_at) FROM tournament_matches
                    WHERE tournament_id = t.id AND started_at IS NOT NULL AND started_at <> '') AS window_start,
                (SELECT MAX(completed_at) FROM tournament_matches
                    WHERE tournament_id = t.id AND completed_at IS NOT NULL AND completed_at <> '') AS window_end
            FROM tournaments t";
    $params = [];
    if ($eventId !== '') {
        $sql .= " WHERE t.id = :id";
        $params[':id'] = $eventId;
    }
    $sql .= " ORDER BY t.id ASC";

    $statement = $pdo->prepare($sql);
    $statement->execute($params);
    $rows = $statement->fetchAll(PDO::FETCH_ASSOC);

    if ($eventId !== '' && count($rows) === 0) {
        return [404, ['ok' => false, 'error' => 'Event was not found']];
    }

    $currentEventId = current_event_id($pdo);
    return [200, ['ok' => true, 'rows' => array_map(
        static fn(array $row): array => qlik_event_row($row, $currentEventId),
        $rows
    )]];
}

function qlik_event_row(array $row, string $currentEventId): array
{
    $hasWindow = $row['window_start'] !== null || $row['window_end'] !== null;
    return [
        'id' => (string)$row['id'],
        'name' => (string)$row['name'],
        'courts' => (int)$row['court_count'],
        'matchCount' => (int)$row['match_count'],
        'completedCount' => (int)$row['completed_count'],
        'eventWindow' => $hasWindow ? [
            'start' => $row['window_start'] !== null ? (string)$row['window_start'] : null,
            'end' => $row['window_end'] !== null ? (string)$row['window_end'] : null,
        ] : null,
        'isCurrent' => $row['id'] === $currentEventId,
    ];
}
