<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/match_lifecycle.php';
require_once __DIR__ . '/access_policy.php';
require_once __DIR__ . '/players.php';

class TournamentMatchConflictException extends MatchConflictException
{
}

class TournamentConflictException extends MatchConflictException
{
}

function row_to_match(array $row): array
{
    $match = [
        'id' => (string)$row['id'],
        'round' => (int)$row['round'],
        'court' => (int)$row['court'],
        'status' => (string)$row['status'],
        'scoreA' => (string)$row['score_a'],
        'scoreB' => (string)$row['score_b'],
        'winner' => $row['winner'] !== null ? (string)$row['winner'] : null,
        'activeGameId' => $row['active_game_id'] !== null ? (string)$row['active_game_id'] : null,
        'gameId' => $row['game_id'] !== null ? (string)$row['game_id'] : null,
        'durationSeconds' => $row['duration_seconds'] !== null ? (int)$row['duration_seconds'] : null,
        'durationMinutes' => $row['duration_minutes'] !== null ? (int)$row['duration_minutes'] : null,
        'startedAt' => $row['started_at'] !== null ? (string)$row['started_at'] : null,
        'startedBy' => $row['started_by'] !== null ? json_decode((string)$row['started_by'], true) : null,
        'completedAt' => $row['completed_at'] !== null ? (string)$row['completed_at'] : null,
    ];
    if ($row['team_a'] !== null) {
        $match['teamA'] = json_decode((string)$row['team_a'], true) ?? $row['team_a'];
    }
    if ($row['team_b'] !== null) {
        $match['teamB'] = json_decode((string)$row['team_b'], true) ?? $row['team_b'];
    }
    if (!empty($row['match_json'])) {
        $extra = json_decode((string)$row['match_json'], true);
        if (is_array($extra)) {
            $match = array_merge($extra, $match);
        }
    }
    return $match;
}

function fetch_tournament_matches(PDO $pdo, string $tournamentId, bool $forUpdate = false): array
{
    $sql = "SELECT * FROM tournament_matches WHERE tournament_id = :tid ORDER BY sort_order ASC, round ASC, court ASC, id ASC";
    if ($forUpdate) {
        $sql .= " FOR UPDATE";
    }
    $statement = $pdo->prepare($sql);
    $statement->execute([':tid' => $tournamentId]);
    return array_map('row_to_match', $statement->fetchAll(PDO::FETCH_ASSOC));
}

// Saves a whole Tournament. A Super Admin may change the schedule (keeping in-progress Match locks
// unless resetting); an Admin may only change Match result fields on an existing Tournament.
function save_tournament(PDO $pdo, ?array $currentUser, array $data): array
{
    $tournament = $data['tournament'] ?? $data;
    if (!is_array($tournament)) {
        return [400, ['ok' => false, 'error' => 'Missing tournament payload']];
    }

    $id = trim((string)($tournament['id'] ?? current_event_id($pdo)));
    $intent = sanitize_save_intent($data['intent'] ?? '');
    if ($id === '') {
        return [400, ['ok' => false, 'error' => 'Tournament id is required']];
    }
    $tournament['id'] = $id;

    if (!$currentUser) {
        return [401, ['ok' => false, 'error' => 'Login required']];
    }
    if (!can($currentUser, 'save_tournament')) {
        return [403, ['ok' => false, 'error' => 'Admin access required']];
    }

    $pdo->beginTransaction();
    try {
        $existingStatement = $pdo->prepare(
            "SELECT tournament_json
             FROM tournaments
             WHERE id = :id
             LIMIT 1
             FOR UPDATE"
        );
        $existingStatement->execute([':id' => $id]);
        $existingRow = $existingStatement->fetch();
        $existingTournament = null;

        if ($existingRow) {
            $existingTournament = json_decode((string)$existingRow['tournament_json'], true);
            if (!is_array($existingTournament)) {
                $pdo->rollBack();
                return [500, ['ok' => false, 'error' => 'Stored tournament payload is invalid']];
            }
            $existingTournament['matches'] = fetch_tournament_matches($pdo, $id, true);
        }

        $currentEventId = current_event_id($pdo);
        if ($existingRow && $id !== $currentEventId) {
            if ($intent === 'reset') {
                $pdo->rollBack();
                return [400, ['ok' => false, 'error' => 'Past events are protected; only the current event can be reset']];
            }
            if ($intent === 'clear-results') {
                $pdo->rollBack();
                return [400, ['ok' => false, 'error' => 'Past events are protected; only the current event results can be cleared']];
            }
            if ($intent === 'schedule-update' || $intent === '') {
                $pdo->rollBack();
                return [400, ['ok' => false, 'error' => 'Past events are protected; only the current event schedule can be regenerated']];
            }
        }

        if (!can($currentUser, 'reset_tournament')) {
            if (!$existingRow) {
                $pdo->rollBack();
                return [403, ['ok' => false, 'error' => 'Only a Super Admin can create or update a tournament schedule']];
            }

            $tournament = merge_match_state_for_admin($existingTournament, $tournament);
        } elseif ($existingTournament !== null && $intent !== 'reset') {
            assert_ongoing_match_locks_are_preserved($existingTournament, $tournament);
        }

        $name = trim((string)($tournament['name'] ?? 'Open Play'));
        $matches = $tournament['matches'] ?? [];
        $playersText = (string)($tournament['playersText'] ?? '');
        if (!is_array($matches)) {
            $matches = [];
            $tournament['matches'] = [];
        }

        $tournament['averageGameMinutes'] = normalize_tournament_number($tournament['averageGameMinutes'] ?? null, 15, 5, 60);
        $tournament['transitionMinutes'] = normalize_tournament_number($tournament['transitionMinutes'] ?? null, 3, 0, 20);
        $tournament['bufferMinutes'] = normalize_tournament_number($tournament['bufferMinutes'] ?? null, 30, 0, 120);
        $tournament['timingVersion'] = 1;

        $players = tournament_players_from_text($playersText);
        foreach ($players as $playerName) {
            find_or_create_player($pdo, $playerName);
        }

        $completedCount = 0;
        foreach ($matches as &$match) {
            if (is_array($match)) {
                if (isset($match['scoreA'])) {
                    $match['scoreA'] = clean_match_score($match['scoreA']);
                }
                if (isset($match['scoreB'])) {
                    $match['scoreB'] = clean_match_score($match['scoreB']);
                }
                if (($match['status'] ?? '') === 'completed') {
                    validate_completed_match_result(array_merge($tournament, $match));
                    $completedCount++;
                }
            }
        }
        unset($match);
        $tournament['matches'] = $matches;

        $tournamentMetadata = $tournament;
        $tournamentMetadata['matches'] = [];
        $tournamentJson = json_encode($tournamentMetadata, JSON_UNESCAPED_SLASHES);
        if ($tournamentJson === false) {
            $pdo->rollBack();
            return [400, ['ok' => false, 'error' => 'Could not encode tournament payload']];
        }

        $statement = $pdo->prepare(
            "INSERT INTO tournaments (
                id, name, format_type, player_count, court_count, match_count, completed_count, tournament_json, updated_at
            ) VALUES (
                :id, :name, :format_type, :player_count, :court_count, :match_count, :completed_count, :tournament_json, CURRENT_TIMESTAMP(6)
            )
            ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                format_type = VALUES(format_type),
                player_count = VALUES(player_count),
                court_count = VALUES(court_count),
                match_count = VALUES(match_count),
                completed_count = VALUES(completed_count),
                tournament_json = VALUES(tournament_json),
                updated_at = GREATEST(CURRENT_TIMESTAMP(6), DATE_ADD(updated_at, INTERVAL 1 MICROSECOND))"
        );

        $statement->execute([
            ':id' => $id,
            ':name' => $name !== '' ? $name : 'Open Play',
            ':format_type' => 'open-play-doubles',
            ':player_count' => count($players),
            ':court_count' => (int)($tournament['courts'] ?? 1),
            ':match_count' => count($matches),
            ':completed_count' => $completedCount,
            ':tournament_json' => $tournamentJson,
        ]);

        $keptMatchIds = [];
        $upsertMatch = $pdo->prepare(
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

        $sortOrder = 0;
        foreach ($matches as $match) {
            if (!is_array($match) || empty($match['id'])) {
                continue;
            }
            $matchId = (string)$match['id'];
            $keptMatchIds[] = $matchId;
            $upsertMatch->execute([
                ':tournament_id' => $id,
                ':id' => $matchId,
                ':sort_order' => $sortOrder,
                ':round' => isset($match['round']) ? (int)$match['round'] : 1,
                ':court' => isset($match['court']) ? (int)$match['court'] : 1,
                ':status' => sanitize_match_status($match['status'] ?? 'scheduled'),
                ':team_a' => isset($match['teamA']) ? json_encode($match['teamA'], JSON_UNESCAPED_SLASHES) : null,
                ':team_b' => isset($match['teamB']) ? json_encode($match['teamB'], JSON_UNESCAPED_SLASHES) : null,
                ':score_a' => clean_match_score($match['scoreA'] ?? ''),
                ':score_b' => clean_match_score($match['scoreB'] ?? ''),
                ':winner' => sanitize_match_winner($match['winner'] ?? null),
                ':active_game_id' => sanitize_match_scalar_or_null($match['activeGameId'] ?? null),
                ':game_id' => sanitize_match_scalar_or_null($match['gameId'] ?? null),
                ':duration_seconds' => sanitize_match_non_negative_int_or_null($match['durationSeconds'] ?? null),
                ':duration_minutes' => sanitize_match_non_negative_int_or_null($match['durationMinutes'] ?? null),
                ':started_at' => sanitize_match_scalar_or_null($match['startedAt'] ?? null),
                ':started_by' => isset($match['startedBy']) && is_array($match['startedBy']) ? json_encode($match['startedBy'], JSON_UNESCAPED_SLASHES) : null,
                ':completed_at' => sanitize_match_scalar_or_null($match['completedAt'] ?? null),
                ':match_json' => json_encode($match, JSON_UNESCAPED_SLASHES),
            ]);
            $sortOrder++;
        }

        if (!empty($keptMatchIds)) {
            $inPlaceholders = implode(',', array_fill(0, count($keptMatchIds), '?'));
            $deleteStmt = $pdo->prepare("DELETE FROM tournament_matches WHERE tournament_id = ? AND id NOT IN ($inPlaceholders)");
            $deleteStmt->execute(array_merge([$id], $keptMatchIds));
        } else {
            $deleteStmt = $pdo->prepare("DELETE FROM tournament_matches WHERE tournament_id = ?");
            $deleteStmt->execute([$id]);
        }

        $pdo->commit();
        $updatedRow = $pdo->query("SELECT updated_at FROM tournaments WHERE id = " . $pdo->quote($id))->fetch(PDO::FETCH_ASSOC);
        if ($updatedRow) {
            $tournament['_updatedAt'] = (string)$updatedRow['updated_at'];
            $tournament['_shared'] = true;
        }
        return [200, ['ok' => true, 'id' => $id, 'tournament' => $tournament]];
    } catch (MatchConflictException $error) {
        $pdo->rollBack();
        return [409, ['ok' => false, 'error' => $error->getMessage()]];
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

// A fresh, unused Tournament id derived from the Event's name, e.g. "Summer Bash" -> summer_bash.
function generate_event_id(PDO $pdo, string $name): string
{
    $base = strtolower(trim((string)preg_replace('/[^a-zA-Z0-9]+/', '_', $name), '_'));
    if ($base === '') {
        $base = 'event';
    }

    $exists = $pdo->prepare("SELECT 1 FROM tournaments WHERE id = :id LIMIT 1");
    $id = $base;
    $suffix = 1;
    while (true) {
        $exists->execute([':id' => $id]);
        if (!$exists->fetchColumn()) {
            return $id;
        }
        $suffix++;
        $id = "{$base}_{$suffix}";
    }
}

// A Super Admin starts a new Event: a fresh Tournament becomes the Current Event while every
// past Event's Matches and Games stay exactly as they are, queryable by their own Event id (ADR 0002).
function start_new_event(PDO $pdo, ?array $currentUser, array $data): array
{
    if (!$currentUser) {
        return [401, ['ok' => false, 'error' => 'Login required']];
    }
    if (!can($currentUser, 'start_new_event')) {
        return [403, ['ok' => false, 'error' => 'Super Admin access required']];
    }

    $name = trim((string)($data['name'] ?? ''));
    if ($name === '') {
        return [400, ['ok' => false, 'error' => 'Event name is required']];
    }
    $courts = normalize_tournament_number($data['courts'] ?? null, 2, 1, 16);

    $id = generate_event_id($pdo, $name);
    [$status, $payload] = save_tournament($pdo, $currentUser, [
        'intent' => 'schedule-update',
        'tournament' => ['id' => $id, 'name' => $name, 'courts' => $courts, 'matches' => []],
    ]);
    if ($status !== 200) {
        return [$status, $payload];
    }

    set_current_event_id($pdo, $id);
    $payload['currentEventId'] = $id;
    return [200, $payload];
}

// Super Admin deletes an Event with zero finished Matches.
// Removes its Tournament row, any scheduled/in-progress Matches, and any unfinished Games.
// If the deleted Event was the Current Event, falls back current_event_id to the most recent remaining Tournament.
// Refuses with 400 if the Event has any finished Matches.
function delete_event(PDO $pdo, ?array $currentUser, array $data): array
{
    if (!$currentUser) {
        return [401, ['ok' => false, 'error' => 'Login required']];
    }
    if (!can($currentUser, 'delete_event')) {
        return [403, ['ok' => false, 'error' => 'Super Admin access required']];
    }

    $id = trim((string)($data['eventId'] ?? $data['tournamentId'] ?? $data['id'] ?? ''));
    if ($id === '') {
        return [400, ['ok' => false, 'error' => 'Event id is required']];
    }

    $pdo->beginTransaction();
    try {
        $tournStmt = $pdo->prepare("SELECT id FROM tournaments WHERE id = :id LIMIT 1 FOR UPDATE");
        $tournStmt->execute([':id' => $id]);
        if (!$tournStmt->fetch()) {
            $pdo->rollBack();
            return [404, ['ok' => false, 'error' => 'Event was not found']];
        }

        // Check if there are any completed matches in tournament_matches
        $tmCountStmt = $pdo->prepare("SELECT COUNT(*) FROM tournament_matches WHERE tournament_id = :id AND status = 'completed'");
        $tmCountStmt->execute([':id' => $id]);
        $completedTmCount = (int)$tmCountStmt->fetchColumn();

        // Check if there are any completed games in games
        $gCountStmt = $pdo->prepare("SELECT COUNT(*) FROM games WHERE tournament_id = :id AND winner_team IN ('A', 'B')");
        $gCountStmt->execute([':id' => $id]);
        $completedGamesCount = (int)$gCountStmt->fetchColumn();

        if ($completedTmCount > 0 || $completedGamesCount > 0) {
            $pdo->rollBack();
            return [400, ['ok' => false, 'error' => 'An Event with finished matches cannot be deleted']];
        }

        // 1. Delete all tournament_matches for this event
        $deleteMatches = $pdo->prepare("DELETE FROM tournament_matches WHERE tournament_id = :id");
        $deleteMatches->execute([':id' => $id]);

        // 2. Delete any unfinished games & game_players for this event
        $gamesStmt = $pdo->prepare("SELECT id FROM games WHERE tournament_id = :id");
        $gamesStmt->execute([':id' => $id]);
        $gameIds = $gamesStmt->fetchAll(PDO::FETCH_COLUMN);
        if (!empty($gameIds)) {
            $inPlaceholders = implode(',', array_fill(0, count($gameIds), '?'));
            $deletePlayersStmt = $pdo->prepare("DELETE FROM game_players WHERE game_id IN ($inPlaceholders)");
            $deletePlayersStmt->execute($gameIds);

            $deleteGamesStmt = $pdo->prepare("DELETE FROM games WHERE tournament_id = ?");
            $deleteGamesStmt->execute([$id]);
        }

        // 3. Delete the tournament row
        $deleteTourn = $pdo->prepare("DELETE FROM tournaments WHERE id = :id");
        $deleteTourn->execute([':id' => $id]);

        // 4. If this was the current event, fall back to the most recent remaining tournament or 'open_play'
        $currentEventId = current_event_id($pdo);
        $newCurrentEventId = $currentEventId;
        if ($id === $currentEventId) {
            $fallbackStmt = $pdo->query("SELECT id FROM tournaments ORDER BY updated_at DESC LIMIT 1");
            $fallbackRow = $fallbackStmt ? $fallbackStmt->fetch(PDO::FETCH_ASSOC) : null;
            $newCurrentEventId = $fallbackRow && !empty($fallbackRow['id']) ? (string)$fallbackRow['id'] : 'open_play';
            set_current_event_id($pdo, $newCurrentEventId);
        }

        $pdo->commit();

        return [200, [
            'ok' => true,
            'id' => $id,
            'deleted' => true,
            'currentEventId' => $newCurrentEventId,
        ]];
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

function compare_tournament_timestamps(string $a, string $b): int
{
    if ($a === $b) {
        return 0;
    }
    $cleanA = trim(str_replace(['T', 'Z'], [' ', ''], $a));
    $cleanB = trim(str_replace(['T', 'Z'], [' ', ''], $b));
    $normA = str_contains($cleanA, '.') ? $cleanA : "$cleanA.000000";
    $normB = str_contains($cleanB, '.') ? $cleanB : "$cleanB.000000";
    return strcmp($normA, $normB);
}

// Reads the shared Tournament ($query is the request's query string). A missing one reads as empty.
function read_tournament(PDO $pdo, array $query): array
{
    $id = isset($query['id']) ? trim((string)$query['id']) : '';
    if ($id === '') {
        $id = current_event_id($pdo);
    }

    $statement = $pdo->prepare(
        "SELECT tournament_json, updated_at
         FROM tournaments
         WHERE id = :id
         LIMIT 1"
    );
    $statement->execute([':id' => $id]);
    $row = $statement->fetch();

    if (!$row) {
        return [200, ['ok' => true, 'tournament' => null]];
    }

    $updatedAt = (string)$row['updated_at'];
    $since = isset($query['since']) ? trim((string)$query['since']) : null;
    if ($since !== null && $since !== '') {
        if ($since === $updatedAt || compare_tournament_timestamps($since, $updatedAt) >= 0) {
            return [200, ['ok' => true, 'unchanged' => true]];
        }
    }

    $tournament = json_decode((string)$row['tournament_json'], true);
    if (!is_array($tournament)) {
        return [500, ['ok' => false, 'error' => 'Stored tournament payload is invalid']];
    }

    $tournament['matches'] = array_map(static function (array $match): array {
        unset($match['scoringClaim']);
        return $match;
    }, fetch_tournament_matches($pdo, $id));
    $tournament['_shared'] = true;
    $tournament['_updatedAt'] = $updatedAt;
    return [200, ['ok' => true, 'tournament' => $tournament]];
}

// Starts, score-syncs, completes or unlocks one tournament Match from a scoreboard.
// Returns [status, payload] for the endpoint to send.
function update_tournament_match(PDO $pdo, ?array $currentUser, array $data): array
{
    $update = $data['match'] ?? $data['matchUpdate'] ?? null;
    if (!is_array($update)) {
        return [400, ['ok' => false, 'error' => 'Missing match update payload']];
    }

    $tournamentId = trim((string)($update['tournamentId'] ?? ''));
    $matchId = trim((string)($update['matchId'] ?? ''));
    $intent = match_update_intent($data);

    if ($tournamentId === '') {
        $tournamentId = current_event_id($pdo);
    }
    if ($matchId === '') {
        return [400, ['ok' => false, 'error' => 'Match id is required']];
    }

    if (!$currentUser) {
        return [401, ['ok' => false, 'error' => 'Login required']];
    }
    if (!can($currentUser, 'update_tournament_match')) {
        return [403, ['ok' => false, 'error' => 'Admin access required']];
    }

    $pdo->beginTransaction();
    try {
        $tournamentStmt = $pdo->prepare(
            "SELECT id, tournament_json FROM tournaments WHERE id = :id LIMIT 1"
        );
        $tournamentStmt->execute([':id' => $tournamentId]);
        $tournamentRow = $tournamentStmt->fetch(PDO::FETCH_ASSOC);
        if (!$tournamentRow) {
            $pdo->rollBack();
            return [404, ['ok' => false, 'error' => 'Tournament was not found']];
        }
        $tournamentData = json_decode((string)$tournamentRow['tournament_json'], true);
        if (!is_array($tournamentData)) {
            $tournamentData = [];
        }

        $matchStmt = $pdo->prepare(
            "SELECT * FROM tournament_matches WHERE tournament_id = :tournament_id AND id = :id LIMIT 1 FOR UPDATE"
        );
        $matchStmt->execute([':tournament_id' => $tournamentId, ':id' => $matchId]);
        $row = $matchStmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            $pdo->rollBack();
            return [404, ['ok' => false, 'error' => 'Match was not found']];
        }

        $existingMatch = row_to_match($row);
        if ($intent !== 'start-match' && !empty($existingMatch['scoringClaim'])
            && !hash_equals((string)$existingMatch['scoringClaim'], (string)($update['scoringClaim'] ?? ''))) {
            throw new MatchConflictException('Scoring moved to another device');
        }
        $updatedMatch = transition_match($existingMatch, array_merge($update, [
            'targetScore' => $tournamentData['targetScore'] ?? 11,
            'winByTwo' => $tournamentData['winByTwo'] ?? true,
        ]), ['intent' => $intent]);
        if ($intent === 'start-match') {
            $updatedMatch['scoringClaim'] = bin2hex(random_bytes(8));
        }

        // A Player is on one court at a time, so a Match only starts once its Players are free.
        if ($updatedMatch['status'] === 'in_progress' && $existingMatch['status'] !== 'in_progress') {
            $court = isset($update['court']) ? (int)$update['court'] : (int)$existingMatch['court'];
            // Locked, so two Admins cannot start Matches on the same court or with the same Player.
            $matches = fetch_tournament_matches($pdo, $tournamentId, true);
            $courtCount = (int)($tournamentData['courts'] ?? 0);
            if ($courtCount < 1) {
                $courtCount = max(1, ...array_map(static fn(array $match): int => (int)$match['court'], $matches));
            }
            if ($court < 1 || $court > $courtCount) {
                throw new MatchConflictException('Court is not in this Tournament');
            }
            foreach ($matches as $other) {
                if ($other['status'] === 'in_progress' && (int)$other['court'] === $court && $other['id'] !== $matchId) {
                    throw new MatchConflictException("Court $court is already playing a Match");
                }
            }
            $updatedMatch['court'] = $court;
            $busy = busy_player_conflict($matches, $updatedMatch);
            if ($busy !== null) {
                throw new MatchConflictException($busy);
            }
        }

        $updateStmt = $pdo->prepare(
            "UPDATE tournament_matches
             SET court = :court,
                 status = :status,
                 score_a = :score_a,
                 score_b = :score_b,
                 winner = :winner,
                 active_game_id = :active_game_id,
                 game_id = :game_id,
                 duration_seconds = :duration_seconds,
                 duration_minutes = :duration_minutes,
                 started_at = :started_at,
                 started_by = :started_by,
                 completed_at = :completed_at,
                 match_json = :match_json
             WHERE tournament_id = :tournament_id AND id = :id"
        );
        $updateStmt->execute([
            ':court' => $updatedMatch['court'],
            ':status' => $updatedMatch['status'],
            ':score_a' => $updatedMatch['scoreA'],
            ':score_b' => $updatedMatch['scoreB'],
            ':winner' => $updatedMatch['winner'],
            ':active_game_id' => $updatedMatch['activeGameId'],
            ':game_id' => $updatedMatch['gameId'],
            ':duration_seconds' => $updatedMatch['durationSeconds'],
            ':duration_minutes' => $updatedMatch['durationMinutes'],
            ':started_at' => $updatedMatch['startedAt'],
            ':started_by' => isset($updatedMatch['startedBy']) && is_array($updatedMatch['startedBy']) ? json_encode($updatedMatch['startedBy'], JSON_UNESCAPED_SLASHES) : null,
            ':completed_at' => $updatedMatch['completedAt'],
            ':match_json' => json_encode($updatedMatch, JSON_UNESCAPED_SLASHES),
            ':tournament_id' => $tournamentId,
            ':id' => $matchId,
        ]);

        $touchTournamentStmt = $pdo->prepare(
            "UPDATE tournaments
             SET updated_at = GREATEST(CURRENT_TIMESTAMP(6), DATE_ADD(updated_at, INTERVAL 1 MICROSECOND))
             WHERE id = :id"
        );
        $touchTournamentStmt->execute([':id' => $tournamentId]);

        $pdo->commit();

        [, $readPayload] = read_tournament($pdo, ['id' => $tournamentId]);
        $tournament = $readPayload['tournament'] ?? null;

        return [200, [
            'ok' => true,
            'id' => $tournamentId,
            'matchId' => $matchId,
            'match' => $updatedMatch,
            'tournament' => $tournament,
        ]];
    } catch (MatchConflictException $error) {
        $pdo->rollBack();
        return [409, ['ok' => false, 'error' => $error->getMessage()]];
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

// Super Admin corrects a finished match's scores and winner in any Event (past or current).
// Updates both tournament_matches and the associated games record so leaderboard and analytics reflect it immediately.
function correct_tournament_match(PDO $pdo, ?array $currentUser, array $data): array
{
    if (!$currentUser) {
        return [401, ['ok' => false, 'error' => 'Login required']];
    }
    if (!can($currentUser, 'correct_match')) {
        return [403, ['ok' => false, 'error' => 'Super Admin access required']];
    }

    $tournamentId = trim((string)($data['tournamentId'] ?? $data['eventId'] ?? ''));
    if ($tournamentId === '') {
        $tournamentId = current_event_id($pdo);
    }
    $matchId = trim((string)($data['matchId'] ?? ''));
    if ($matchId === '') {
        return [400, ['ok' => false, 'error' => 'Match id is required']];
    }

    $rawScoreA = $data['scoreA'] ?? null;
    $rawScoreB = $data['scoreB'] ?? null;
    if ($rawScoreA === null || $rawScoreB === null) {
        return [400, ['ok' => false, 'error' => 'Scores are required']];
    }
    $cleanScoreA = clean_match_score($rawScoreA);
    $cleanScoreB = clean_match_score($rawScoreB);
    if ($cleanScoreA === '' || $cleanScoreB === '') {
        return [400, ['ok' => false, 'error' => 'Scores must be valid numbers']];
    }
    $intA = (int)$cleanScoreA;
    $intB = (int)$cleanScoreB;
    $winner = isset($data['winner']) ? strtoupper(trim((string)$data['winner'])) : null;
    if ($winner !== 'A' && $winner !== 'B') {
        return [400, ['ok' => false, 'error' => 'Winner is required to complete the match']];
    }

    $pdo->beginTransaction();
    try {
        $tournStmt = $pdo->prepare("SELECT id, tournament_json FROM tournaments WHERE id = :id LIMIT 1 FOR UPDATE");
        $tournStmt->execute([':id' => $tournamentId]);
        $tournamentRow = $tournStmt->fetch(PDO::FETCH_ASSOC);
        if (!$tournamentRow) {
            $pdo->rollBack();
            return [404, ['ok' => false, 'error' => 'Tournament was not found']];
        }

        $matchStmt = $pdo->prepare("SELECT * FROM tournament_matches WHERE tournament_id = :tid AND id = :id LIMIT 1 FOR UPDATE");
        $matchStmt->execute([':tid' => $tournamentId, ':id' => $matchId]);
        $matchRow = $matchStmt->fetch(PDO::FETCH_ASSOC);
        if (!$matchRow) {
            $pdo->rollBack();
            return [404, ['ok' => false, 'error' => 'Match was not found']];
        }

        if ($matchRow['status'] !== 'completed') {
            $pdo->rollBack();
            return [400, ['ok' => false, 'error' => 'Only completed matches can be corrected']];
        }

        $matchData = !empty($matchRow['match_json']) ? json_decode((string)$matchRow['match_json'], true) : [];
        if (!is_array($matchData)) {
            $matchData = [];
        }
        $tournamentData = json_decode((string)$tournamentRow['tournament_json'], true);
        if (!is_array($tournamentData)) {
            $tournamentData = [];
        }
        try {
            validate_completed_match_result(array_merge($tournamentData, $matchData, [
                'scoreA' => $cleanScoreA,
                'scoreB' => $cleanScoreB,
                'winner' => $winner,
            ]));
        } catch (MatchConflictException $error) {
            $pdo->rollBack();
            return [400, ['ok' => false, 'error' => $error->getMessage()]];
        }
        $matchData['scoreA'] = $cleanScoreA;
        $matchData['scoreB'] = $cleanScoreB;
        $matchData['winner'] = $winner;

        $updateMatchStmt = $pdo->prepare(
            "UPDATE tournament_matches
             SET score_a = :score_a,
                 score_b = :score_b,
                 winner = :winner,
                 match_json = :match_json
             WHERE tournament_id = :tid AND id = :id"
        );
        $updateMatchStmt->execute([
            ':score_a' => $cleanScoreA,
            ':score_b' => $cleanScoreB,
            ':winner' => $winner,
            ':match_json' => json_encode($matchData, JSON_UNESCAPED_SLASHES),
            ':tid' => $tournamentId,
            ':id' => $matchId,
        ]);

        $gameId = $matchRow['game_id'] !== null ? (string)$matchRow['game_id'] : null;
        $gameStmt = $pdo->prepare(
            "SELECT id, team_a_name, team_b_name, game_json
             FROM games
             WHERE (tournament_id = :tid AND tournament_match_id = :mid)
                OR (:gid IS NOT NULL AND id = :gid)
             LIMIT 1
             FOR UPDATE"
        );
        $gameStmt->execute([':tid' => $tournamentId, ':mid' => $matchId, ':gid' => $gameId]);
        $gameRow = $gameStmt->fetch(PDO::FETCH_ASSOC);

        if ($gameRow) {
            $foundGameId = (string)$gameRow['id'];
            $winnerName = $winner === 'A' ? (string)($gameRow['team_a_name'] ?? 'Team A') : (string)($gameRow['team_b_name'] ?? 'Team B');
            $gameData = json_decode((string)$gameRow['game_json'], true);
            if (is_array($gameData)) {
                if (isset($gameData['teamA']) && is_array($gameData['teamA'])) {
                    $gameData['teamA']['score'] = $intA;
                }
                if (isset($gameData['teamB']) && is_array($gameData['teamB'])) {
                    $gameData['teamB']['score'] = $intB;
                }
                $gameData['winner'] = $winner;
                $gameData['winnerName'] = $winnerName;
                if (isset($gameData['tournamentMatch']) && is_array($gameData['tournamentMatch'])) {
                    $gameData['tournamentMatch']['scoreA'] = $cleanScoreA;
                    $gameData['tournamentMatch']['scoreB'] = $cleanScoreB;
                    $gameData['tournamentMatch']['winner'] = $winner;
                }
            } else {
                $gameData = [];
            }

            $updateGameStmt = $pdo->prepare(
                "UPDATE games
                 SET team_a_score = :team_a_score,
                     team_b_score = :team_b_score,
                     winner_team = :winner_team,
                     winner_name = :winner_name,
                     game_json = :game_json
                 WHERE id = :id"
            );
            $updateGameStmt->execute([
                ':team_a_score' => $intA,
                ':team_b_score' => $intB,
                ':winner_team' => $winner,
                ':winner_name' => $winnerName,
                ':game_json' => json_encode($gameData, JSON_UNESCAPED_SLASHES),
                ':id' => $foundGameId,
            ]);
        }

        $touchStmt = $pdo->prepare(
            "UPDATE tournaments
             SET updated_at = GREATEST(CURRENT_TIMESTAMP(6), DATE_ADD(updated_at, INTERVAL 1 MICROSECOND))
             WHERE id = :id"
        );
        $touchStmt->execute([':id' => $tournamentId]);

        $pdo->commit();

        $matchRow['score_a'] = $cleanScoreA;
        $matchRow['score_b'] = $cleanScoreB;
        $matchRow['winner'] = $winner;
        $matchRow['match_json'] = json_encode($matchData, JSON_UNESCAPED_SLASHES);
        $updatedMatch = row_to_match($matchRow);

        return [200, [
            'ok' => true,
            'tournamentId' => $tournamentId,
            'matchId' => $matchId,
            'match' => $updatedMatch,
        ]];
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

// The intent of a Match update request, from the top level or inside the update itself.
function match_update_intent(array $data): string
{
    $update = $data['match'] ?? $data['matchUpdate'] ?? null;
    return sanitize_match_intent($data['intent'] ?? (is_array($update) ? ($update['intent'] ?? '') : ''));
}

function sanitize_match_intent($value): string
{
    $intent = is_scalar($value) ? trim((string)$value) : '';
    return in_array($intent, ['start-match', 'score-sync', 'complete-match', 'unlock-match'], true) ? $intent : 'score-sync';
}

function tournament_players_from_text(string $playersText): array
{
    return array_values(array_filter(array_unique(array_map(
        static fn (string $name): string => trim($name),
        preg_split('/[\n,]+/', $playersText) ?: []
    ))));
}

function sanitize_save_intent($value): string
{
    $intent = is_scalar($value) ? trim((string)$value) : '';
    return in_array($intent, ['start-match', 'complete-match', 'score-sync', 'reset', 'schedule-update', 'clear-results'], true) ? $intent : '';
}

function normalize_tournament_number($value, int $fallback, int $min, int $max): int
{
    if ($value === null || $value === '') {
        return $fallback;
    }

    $number = (int)round((float)$value);
    return max($min, min($max, $number));
}

function merge_match_state_for_admin(array $existingTournament, array $submittedTournament): array
{
    $submittedMatches = [];
    foreach (($submittedTournament['matches'] ?? []) as $match) {
        if (is_array($match) && isset($match['id'])) {
            $submittedMatches[(string)$match['id']] = $match;
        }
    }

    $allowedFields = [
        'status',
        'winner',
        'scoreA',
        'scoreB',
        'completedAt',
        'gameId',
        'durationSeconds',
        'durationMinutes',
        'startedAt',
        'startedBy',
        'activeGameId',
    ];

    $existingMatches = [];
    foreach (($existingTournament['matches'] ?? []) as $match) {
        if (!is_array($match) || !isset($match['id'])) {
            continue;
        }

        $id = (string)$match['id'];
        if (isset($submittedMatches[$id])) {
            $transitioned = transition_match($match, $submittedMatches[$id]);
            foreach ($allowedFields as $field) {
                if (array_key_exists($field, $transitioned)) {
                    $match[$field] = $transitioned[$field];
                }
            }
        }
        $existingMatches[] = $match;
    }

    $existingTournament['matches'] = $existingMatches;
    return $existingTournament;
}

function assert_ongoing_match_locks_are_preserved(array $existingTournament, array $submittedTournament): void
{
    $submittedMatches = [];
    foreach (($submittedTournament['matches'] ?? []) as $match) {
        if (is_array($match) && isset($match['id'])) {
            $submittedMatches[(string)$match['id']] = $match;
        }
    }

    foreach (($existingTournament['matches'] ?? []) as $existingMatch) {
        if (!is_array($existingMatch) || !isset($existingMatch['id'])) {
            continue;
        }

        if (($existingMatch['status'] ?? '') !== 'in_progress') {
            continue;
        }

        $id = (string)$existingMatch['id'];
        if (!isset($submittedMatches[$id])) {
            throw new TournamentConflictException('Match is already ongoing; refresh the tournament before changing the schedule');
        }

        transition_match($existingMatch, $submittedMatches[$id], ['intent' => 'schedule-update']);
    }
}
