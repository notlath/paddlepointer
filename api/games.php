<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/match_lifecycle.php';
require_once __DIR__ . '/players.php';

function extract_game_players(array $game): array
{
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
}

// Saves a Game from a scoreboard. Returns [status, payload] for the endpoint to send.
function save_game(PDO $pdo, ?array $currentUser, array $data): array
{
    $game = $data['game'] ?? $data;
    if (!is_array($game)) {
        return [400, ['ok' => false, 'error' => 'Missing game payload']];
    }

    $id = trim((string)($game['id'] ?? ''));
    $teamA = $game['teamA'] ?? null;
    $teamB = $game['teamB'] ?? null;
    if ($id === '' || !is_array($teamA) || !is_array($teamB)) {
        return [400, ['ok' => false, 'error' => 'Game id, teamA, and teamB are required']];
    }

    if (!$currentUser) {
        return [401, ['ok' => false, 'error' => 'Login required']];
    }
    if (!can($currentUser, 'save_game')) {
        return [403, ['ok' => false, 'error' => 'Match scoring access required']];
    }
    if (isset($game['events']) && is_array($game['events']) && count($game['events']) > 5000) {
        return [400, ['ok' => false, 'error' => 'Too many Rally events']];
    }

    // The browser renders these as HTML, so they are stored as plain values, never as sent.
    $game['type'] = ($game['type'] ?? null) === 'singles' ? 'singles' : 'doubles';
    $teamA['score'] = $game['teamA']['score'] = (int)($teamA['score'] ?? 0);
    $teamB['score'] = $game['teamB']['score'] = (int)($teamB['score'] ?? 0);
    $game['sideOuts'] = (int)($game['sideOuts'] ?? 0);

    $game['createdBy'] = [
        'id' => (int)$currentUser['id'],
        'username' => (string)$currentUser['username'],
        'displayName' => (string)$currentUser['display_name'],
        'role' => (string)$currentUser['role'],
    ];
    if (trim((string)($game['scorerName'] ?? '')) === '') {
        $game['scorerName'] = (string)$currentUser['display_name'];
    }

    $matchScope = normalize_match_scope((string)($game['matchScope'] ?? ''));
    if (can($currentUser, 'view_visitor_history')) {
        $matchScope = 'visitor';
    } elseif ($matchScope === 'visitor') {
        $matchScope = 'standard';
    }
    if ($matchScope === 'standard' && isset($game['tournamentMatch']) && is_array($game['tournamentMatch'])) {
        $matchScope = 'tournament';
    }
    $game['matchScope'] = $matchScope;

    $tournamentMatch = $game['tournamentMatch'] ?? null;
    $tournamentId = null;
    $tournamentMatchId = null;
    if (is_array($tournamentMatch)) {
        $tournamentId = !empty($tournamentMatch['tournamentId']) ? trim((string)$tournamentMatch['tournamentId']) : current_event_id($pdo);
        $tournamentMatchId = !empty($tournamentMatch['matchId']) ? trim((string)$tournamentMatch['matchId']) : null;
    }

    $winnerTeam = isset($game['winner']) ? (string)$game['winner'] : null;
    $winnerName = null;
    if ($winnerTeam === 'A') {
        $winnerName = (string)($teamA['name'] ?? 'Team A');
    } elseif ($winnerTeam === 'B') {
        $winnerName = (string)($teamB['name'] ?? 'Team B');
    }

    $gameJson = json_encode($game, JSON_UNESCAPED_SLASHES);
    if ($gameJson === false) {
        return [400, ['ok' => false, 'error' => 'Could not encode game payload']];
    }

    $pdo->beginTransaction();
    try {
        // Game ids come from the browser and appear in public History, so a resave is only a retry
        // by the account that first saved the Game; a correction goes through Correct Match.
        $owner = $pdo->prepare("SELECT created_by_user_id, winner_team, team_a_score, team_b_score FROM games WHERE id = :id FOR UPDATE");
        $owner->execute([':id' => $id]);
        $existing = $owner->fetch(PDO::FETCH_ASSOC);
        if ($existing && (int)$existing['created_by_user_id'] !== (int)$currentUser['id']) {
            $pdo->rollBack();
            return [409, ['ok' => false, 'error' => 'This Match was already saved by another account']];
        }
        if ($existing && in_array($existing['winner_team'], ['A', 'B'], true)) {
            if ($existing['winner_team'] === $winnerTeam && (int)$existing['team_a_score'] === $teamA['score'] && (int)$existing['team_b_score'] === $teamB['score']) {
                $pdo->rollBack();
                return [200, ['ok' => true, 'id' => $id]];
            }
            $pdo->rollBack();
            return [409, ['ok' => false, 'error' => 'This Match is already finished. A Super Admin can change the result with Correct Match.']];
        }

        // A Match still being played has no result yet; a finished result follows the scoring rules.
        if (!in_array((string)($game['status'] ?? ''), ['active', 'in_progress'], true)) {
            try {
                validate_completed_match_result(array_merge($game, ['scoreA' => $teamA['score'], 'scoreB' => $teamB['score']]));
            } catch (MatchConflictException $error) {
                $pdo->rollBack();
                return [400, ['ok' => false, 'error' => $error->getMessage()]];
            }
        }

        $statement = $pdo->prepare(
            "INSERT INTO games (
                id, tournament_id, tournament_match_id, created_by_user_id, created_by_name, created_by_role, match_scope, scorer_name, game_type, team_a_name, team_b_name, team_a_score, team_b_score,
                winner_team, winner_name, target_score, win_by_two, side_outs, duration_seconds,
                created_at, started_at, ended_at, game_json
            ) VALUES (
                :id, :tournament_id, :tournament_match_id, :created_by_user_id, :created_by_name, :created_by_role, :match_scope, :scorer_name, :game_type, :team_a_name, :team_b_name, :team_a_score, :team_b_score,
                :winner_team, :winner_name, :target_score, :win_by_two, :side_outs, :duration_seconds,
                :created_at, :started_at, :ended_at, :game_json
            )
            ON DUPLICATE KEY UPDATE
                tournament_id = VALUES(tournament_id),
                tournament_match_id = VALUES(tournament_match_id),
                created_by_user_id = VALUES(created_by_user_id),
                created_by_name = VALUES(created_by_name),
                created_by_role = VALUES(created_by_role),
                match_scope = VALUES(match_scope),
                scorer_name = VALUES(scorer_name),
                game_type = VALUES(game_type),
                team_a_name = VALUES(team_a_name),
                team_b_name = VALUES(team_b_name),
                team_a_score = VALUES(team_a_score),
                team_b_score = VALUES(team_b_score),
                winner_team = VALUES(winner_team),
                winner_name = VALUES(winner_name),
                target_score = VALUES(target_score),
                win_by_two = VALUES(win_by_two),
                side_outs = VALUES(side_outs),
                duration_seconds = VALUES(duration_seconds),
                created_at = VALUES(created_at),
                started_at = VALUES(started_at),
                ended_at = VALUES(ended_at),
                game_json = VALUES(game_json)"
        );

        $statement->execute([
            ':id' => $id,
            ':tournament_id' => $tournamentId,
            ':tournament_match_id' => $tournamentMatchId,
            ':created_by_user_id' => (int)$currentUser['id'],
            ':created_by_name' => (string)$currentUser['display_name'],
            ':created_by_role' => (string)$currentUser['role'],
            ':match_scope' => $matchScope,
            ':scorer_name' => trim((string)($game['scorerName'] ?? '')) ?: null,
            ':game_type' => (string)($game['type'] ?? 'doubles'),
            ':team_a_name' => (string)($teamA['name'] ?? 'Team A'),
            ':team_b_name' => (string)($teamB['name'] ?? 'Team B'),
            ':team_a_score' => (int)($teamA['score'] ?? 0),
            ':team_b_score' => (int)($teamB['score'] ?? 0),
            ':winner_team' => $winnerTeam,
            ':winner_name' => $winnerName,
            ':target_score' => (int)($game['targetScore'] ?? 11),
            ':win_by_two' => !empty($game['winByTwo']) ? 1 : 0,
            ':side_outs' => (int)($game['sideOuts'] ?? 0),
            ':duration_seconds' => duration_seconds($game['startedAt'] ?? null, $game['endedAt'] ?? null),
            ':created_at' => parse_iso_datetime($game['createdAt'] ?? null),
            ':started_at' => parse_iso_datetime($game['startedAt'] ?? null),
            ':ended_at' => parse_iso_datetime($game['endedAt'] ?? null),
            ':game_json' => $gameJson,
        ]);

        // A Match resaved while still in progress (e.g. every score update) keeps each player's earlier
        // link by team position, so a Player renamed elsewhere mid-Match doesn't strand this Match with
        // a name that now matches no one and would otherwise create a duplicate Player.  A name that
        // still matches a real Player is always resolved fresh, so a genuine correction to a different
        // real name still takes effect.
        $priorPlayerIdByPosition = [];
        if ($matchScope !== 'visitor') {
            $priorRows = $pdo->prepare("SELECT team, player_id FROM game_players WHERE game_id = :game_id ORDER BY id ASC");
            $priorRows->execute([':game_id' => $id]);
            $positionCounters = [];
            foreach ($priorRows->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $team = (string)$row['team'];
                $position = $positionCounters[$team] = ($positionCounters[$team] ?? -1) + 1;
                $priorPlayerIdByPosition["$team|$position"] = $row['player_id'] !== null ? (int)$row['player_id'] : null;
            }
        }

        $players = extract_game_players($game);
        $pdo->prepare("DELETE FROM game_players WHERE game_id = :game_id")->execute([':game_id' => $id]);
        $insertPlayer = $pdo->prepare(
            "INSERT INTO game_players (game_id, team, player_name, player_id) VALUES (:game_id, :team, :player_name, :player_id)"
        );
        $positionCounters = [];
        foreach ($players as $p) {
            $playerId = null;
            if ($matchScope !== 'visitor') { // A Visitor Match's names stay names; they never become Players (ADR 0005).
                $position = $positionCounters[$p['team']] = ($positionCounters[$p['team']] ?? -1) + 1;
                $key = "{$p['team']}|$position";
                $existingLink = $priorPlayerIdByPosition[$key] ?? null;
                if ($existingLink !== null && !find_player_by_name($pdo, $p['name'])) {
                    $playerId = $existingLink;
                } else {
                    $player = find_or_create_player($pdo, $p['name']);
                    $playerId = $player ? (int)$player['id'] : null;
                }
            }
            $insertPlayer->execute([
                ':game_id' => $id,
                ':team' => $p['team'],
                ':player_name' => $p['name'],
                ':player_id' => $playerId,
            ]);
        }

        $pdo->commit();
        return [200, ['ok' => true, 'id' => $id]];
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

// Builds the WHERE clause and bound parameters for history visibility across all roles.
function history_visibility_where(?array $currentUser, array $query): array
{
    if ($currentUser && can($currentUser, 'view_visitor_history')) {
        return [
            "match_scope = 'visitor' OR created_by_role = 'visitor'",
            [],
        ];
    }

    $where = [
        "(match_scope IS NULL OR match_scope <> 'visitor')",
        "(created_by_role IS NULL OR created_by_role <> 'visitor')",
    ];
    $params = [];

    if ($currentUser && !can($currentUser, 'view_all_history')) {
        $displayName = (string)$currentUser['display_name'];
        $username = (string)$currentUser['username'];
        $playerId = isset($currentUser['player_id']) && $currentUser['player_id'] !== null
            ? (int)$currentUser['player_id']
            : null;
        // A linked Player's id decides which Games they're recorded in, not their account's current
        // name (ADR 0005) — an account with no linked Player matches none this way.
        $playedClause = $playerId !== null
            ? "OR games.id IN (SELECT gp.game_id FROM game_players gp WHERE gp.player_id = :linked_player_id)"
            : "";
        $where[] = "(
            created_by_user_id = :user_id
            OR scorer_name = :scorer_display
            OR scorer_name = :scorer_user
            $playedClause
        )";
        $params[':user_id'] = (int)$currentUser['id'];
        $params[':scorer_display'] = $displayName;
        $params[':scorer_user'] = $username;
        if ($playerId !== null) {
            $params[':linked_player_id'] = $playerId;
        }
        return [implode(' AND ', $where), $params];
    }

    $player = isset($query['player']) ? trim((string)$query['player']) : '';
    $scorer = isset($query['scorer']) ? trim((string)$query['scorer']) : '';

    if ($player !== '') {
        $where[] = "(
            scorer_name = :filter_scorer
            OR games.id IN (
                SELECT gp.game_id FROM game_players gp
                WHERE gp.player_name = :filter_player
            )
        )";
        $params[':filter_scorer'] = $player;
        $params[':filter_player'] = $player;
    } elseif ($scorer !== '') {
        $where[] = "scorer_name = :scorer";
        $params[':scorer'] = $scorer;
    }

    return [implode(' AND ', $where), $params];
}

// Loads shared History ($query is the request's query string). A Visitor sees visitor Games only;
// a Player sees non-visitor Games they created, scored or are recorded as a player in; staff and
// signed-out requests see every non-visitor Game, optionally filtered by player name or scorer.
// Returns Game summaries without Rally logs (events).
function read_history(PDO $pdo, ?array $currentUser, array $query): array
{
    if (isset($query['id']) && trim((string)$query['id']) !== '') {
        return read_game($pdo, $currentUser, trim((string)$query['id']));
    }

    $limit = isset($query['limit']) ? (int)$query['limit'] : 100;
    $limit = max(1, min(200, $limit));

    [$whereSql, $params] = history_visibility_where($currentUser, $query);

    $statement = $pdo->prepare(
        "SELECT game_json
         FROM games
         WHERE $whereSql
         ORDER BY COALESCE(ended_at, created_at, saved_at) DESC, saved_at DESC
         LIMIT $limit"
    );
    $statement->execute($params);

    $games = [];
    foreach ($statement->fetchAll() as $row) {
        $game = json_decode((string)$row['game_json'], true);
        if (is_array($game)) {
            $game['_shared'] = true;
            unset($game['createdBy']['username']); // a staff login name or a Visitor's email
            unset($game['events']);
            $games[] = $game;
        }
    }

    return [200, ['ok' => true, 'games' => $games, 'count' => count($games)]];
}

// Reads a single Game with its full Rally log, enforced by history visibility rules.
function read_game(PDO $pdo, ?array $currentUser, string $id): array
{
    $id = trim($id);
    if ($id === '') {
        return [400, ['ok' => false, 'error' => 'Game id required']];
    }

    [$whereSql, $params] = history_visibility_where($currentUser, []);
    $params[':id'] = $id;

    $statement = $pdo->prepare(
        "SELECT game_json
         FROM games
         WHERE id = :id AND ($whereSql)
         LIMIT 1"
    );
    $statement->execute($params);
    $row = $statement->fetch();
    if (!$row) {
        return [404, ['ok' => false, 'error' => 'Game not found']];
    }

    $game = json_decode((string)$row['game_json'], true);
    if (!is_array($game)) {
        return [500, ['ok' => false, 'error' => 'Could not decode game payload']];
    }

    $game['_shared'] = true;
    unset($game['createdBy']['username']); // a staff login name or a Visitor's email
    return [200, ['ok' => true, 'game' => $game]];
}

// Computes leaderboard standings across all completed games visible to the viewer.
// `event` narrows it to one Event's Tournament Matches: an Event id, or "current".
function read_leaderboard(PDO $pdo, ?array $currentUser, array $query = []): array
{
    [$whereSql, $params] = history_visibility_where($currentUser, $query);

    $event = null;
    $eventId = trim((string)($query['event'] ?? ''));
    if ($eventId !== '') {
        $eventId = $eventId === 'current' ? current_event_id($pdo) : $eventId;
        $nameStmt = $pdo->prepare("SELECT name FROM tournaments WHERE id = :id");
        $nameStmt->execute([':id' => $eventId]);
        $name = $nameStmt->fetchColumn();
        $event = ['id' => $eventId, 'name' => $name !== false ? (string)$name : ($eventId === 'open_play' ? 'Open Play' : $eventId)];
        $whereSql = "($whereSql) AND games.tournament_id = :event_id";
        $params[':event_id'] = $eventId;
    }

    $gamesStmt = $pdo->prepare(
        "SELECT games.id, games.game_type, games.team_a_name, games.team_b_name, games.team_a_score, games.team_b_score,
                games.winner_team, games.duration_seconds, games.started_at, games.ended_at, games.game_json
         FROM games
         WHERE ($whereSql)
           AND games.winner_team IN ('A', 'B')
         ORDER BY COALESCE(games.ended_at, games.created_at, games.saved_at) DESC"
    );
    $gamesStmt->execute($params);
    $games = $gamesStmt->fetchAll(PDO::FETCH_ASSOC);

    // Fetch players for all visible completed games
    $playersStmt = $pdo->prepare(
        "SELECT gp.game_id, gp.team, gp.player_name
         FROM game_players gp
         INNER JOIN games ON games.id = gp.game_id
         WHERE ($whereSql)
           AND games.winner_team IN ('A', 'B')
         ORDER BY gp.id ASC"
    );
    $playersStmt->execute($params);
    $playersByGame = [];
    foreach ($playersStmt->fetchAll(PDO::FETCH_ASSOC) as $pRow) {
        $playersByGame[$pRow['game_id']][$pRow['team']][] = $pRow['player_name'];
    }

    $teamStats = [];
    $playerStats = [];
    $gamesCount = 0;

    foreach ($games as $game) {
        $winnerKey = $game['winner_team'] === 'B' ? 'B' : 'A';
        $loserKey = $winnerKey === 'A' ? 'B' : 'A';

        $winnerScore = (int)($winnerKey === 'A' ? $game['team_a_score'] : $game['team_b_score']);
        $loserScore = (int)($loserKey === 'A' ? $game['team_a_score'] : $game['team_b_score']);

        $winnerTeamName = trim((string)($winnerKey === 'A' ? ($game['team_a_name'] ?: 'Team A') : ($game['team_b_name'] ?: 'Team B')));
        $loserTeamName = trim((string)($loserKey === 'A' ? ($game['team_a_name'] ?: 'Team A') : ($game['team_b_name'] ?: 'Team B')));

        $durationSeconds = (int)($game['duration_seconds'] ?? 0);
        if ($durationSeconds <= 0 && !empty($game['started_at']) && !empty($game['ended_at'])) {
            $durationSeconds = duration_seconds($game['started_at'], $game['ended_at']);
        }
        $durationMinutes = $durationSeconds > 0 ? max(1, (int)round($durationSeconds / 60)) : 15;

        $gamesCount++;

        // Team stats
        record_leaderboard_entry($teamStats, 'team:' . mb_strtolower($winnerTeamName), $winnerTeamName, 'team', true, $winnerScore, $loserScore, $durationMinutes, null);
        record_leaderboard_entry($teamStats, 'team:' . mb_strtolower($loserTeamName), $loserTeamName, 'team', false, $loserScore, $winnerScore, $durationMinutes, null);

        // Player names for winner team
        $winnerPlayers = $playersByGame[$game['id']][$winnerKey] ?? [];
        if (empty($winnerPlayers)) {
            $gameData = json_decode((string)$game['game_json'], true);
            if (is_array($gameData)) {
                $extracted = extract_game_players($gameData);
                foreach ($extracted as $ep) {
                    if ($ep['team'] === $winnerKey) {
                        $winnerPlayers[] = $ep['name'];
                    }
                }
            }
        }
        if (empty($winnerPlayers)) {
            $winnerPlayers = [$winnerTeamName];
        }

        // Player names for loser team
        $loserPlayers = $playersByGame[$game['id']][$loserKey] ?? [];
        if (empty($loserPlayers)) {
            $gameData = json_decode((string)$game['game_json'], true);
            if (is_array($gameData)) {
                $extracted = extract_game_players($gameData);
                foreach ($extracted as $ep) {
                    if ($ep['team'] === $loserKey) {
                        $loserPlayers[] = $ep['name'];
                    }
                }
            }
        }
        if (empty($loserPlayers)) {
            $loserPlayers = [$loserTeamName];
        }

        foreach ($winnerPlayers as $pName) {
            record_leaderboard_entry($playerStats, 'player:' . mb_strtolower(trim($pName)), trim($pName), 'player', true, $winnerScore, $loserScore, $durationMinutes, $winnerTeamName);
        }
        foreach ($loserPlayers as $pName) {
            record_leaderboard_entry($playerStats, 'player:' . mb_strtolower(trim($pName)), trim($pName), 'player', false, $loserScore, $winnerScore, $durationMinutes, $loserTeamName);
        }
    }

    $teamRows = sort_leaderboard_entries(array_values($teamStats));
    $playerRows = sort_leaderboard_entries(array_values($playerStats));

    return [
        200,
        [
            'ok' => true,
            'gamesCount' => $gamesCount,
            'teamRows' => $teamRows,
            'playerRows' => $playerRows,
        ] + ($event ? ['event' => $event] : []),
    ];
}

function record_leaderboard_entry(
    array &$stats,
    string $key,
    string $name,
    string $type,
    bool $won,
    int $pointsFor,
    int $pointsAgainst,
    int $minutesPlayed,
    ?string $teamName
): void {
    if (!isset($stats[$key])) {
        $stats[$key] = [
            'key' => $key,
            'name' => trim($name) !== '' ? trim($name) : ($type === 'team' ? 'Unnamed Team' : 'Unnamed Player'),
            'type' => $type,
            'wins' => 0,
            'losses' => 0,
            'pointsFor' => 0,
            'pointsAgainst' => 0,
            'minutesPlayed' => 0,
            'teams' => [],
        ];
    }

    if ($won) {
        $stats[$key]['wins'] += 1;
    } else {
        $stats[$key]['losses'] += 1;
    }
    $stats[$key]['pointsFor'] += $pointsFor;
    $stats[$key]['pointsAgainst'] += $pointsAgainst;
    $stats[$key]['minutesPlayed'] += $minutesPlayed;
    if ($teamName !== null && $teamName !== '' && !in_array($teamName, $stats[$key]['teams'], true)) {
        $stats[$key]['teams'][] = $teamName;
    }

    $games = $stats[$key]['wins'] + $stats[$key]['losses'];
    $diff = $stats[$key]['pointsFor'] - $stats[$key]['pointsAgainst'];
    $winRate = $games > 0 ? (int)round(($stats[$key]['wins'] / $games) * 100) : 0;
    $detail = !empty($stats[$key]['teams']) ? implode(' / ', array_slice($stats[$key]['teams'], 0, 2)) : '';

    $stats[$key]['games'] = $games;
    $stats[$key]['diff'] = $diff;
    $stats[$key]['winRate'] = $winRate;
    $stats[$key]['detail'] = $detail;
}

function sort_leaderboard_entries(array $rows): array
{
    usort($rows, static function (array $a, array $b): int {
        if ($b['wins'] !== $a['wins']) {
            return $b['wins'] <=> $a['wins'];
        }
        if ($b['winRate'] !== $a['winRate']) {
            return $b['winRate'] <=> $a['winRate'];
        }
        if ($b['diff'] !== $a['diff']) {
            return $b['diff'] <=> $a['diff'];
        }
        $bMin = (int)($b['minutesPlayed'] ?? 0);
        $aMin = (int)($a['minutesPlayed'] ?? 0);
        if ($bMin !== $aMin) {
            return $bMin <=> $aMin;
        }
        if ($b['pointsFor'] !== $a['pointsFor']) {
            return $b['pointsFor'] <=> $a['pointsFor'];
        }
        return strcasecmp($a['name'], $b['name']);
    });
    return $rows;
}

// Deletes the Games linked to one Tournament's Matches. Super Admin only.
function clear_tournament_games(PDO $pdo, ?array $currentUser, array $data): array
{
    $currentEventId = current_event_id($pdo);
    $tournamentId = trim((string)($data['tournamentId'] ?? ''));
    if ($tournamentId === '') {
        $tournamentId = $currentEventId;
    }

    if (!$currentUser) {
        return [401, ['ok' => false, 'error' => 'Login required']];
    }
    if (!can($currentUser, 'clear_tournament_games')) {
        return [403, ['ok' => false, 'error' => 'Super Admin access required']];
    }

    if ($tournamentId !== $currentEventId) {
        return [400, ['ok' => false, 'error' => 'Past events are protected; only the current event games can be cleared']];
    }

    $pdo->beginTransaction();
    try {
        $gameIdsStmt = $pdo->prepare("SELECT id FROM games WHERE tournament_id = :tournament_id");
        $gameIdsStmt->execute([':tournament_id' => $tournamentId]);
        $gameIds = $gameIdsStmt->fetchAll(PDO::FETCH_COLUMN);

        $deleted = 0;
        if (!empty($gameIds)) {
            $inPlaceholders = implode(',', array_fill(0, count($gameIds), '?'));
            $deletePlayersStmt = $pdo->prepare("DELETE FROM game_players WHERE game_id IN ($inPlaceholders)");
            $deletePlayersStmt->execute($gameIds);

            $deleteGamesStmt = $pdo->prepare("DELETE FROM games WHERE tournament_id = ?");
            $deleteGamesStmt->execute([$tournamentId]);
            $deleted = $deleteGamesStmt->rowCount();
        }

        $pdo->commit();
        return [200, ['ok' => true, 'deleted' => $deleted, 'tournamentId' => $tournamentId]];
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

function escape_like(string $value): string
{
    return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $value);
}

function normalize_match_scope(string $value): string
{
    $scope = strtolower(trim($value));
    if (in_array($scope, ['visitor', 'tournament'], true)) {
        return $scope;
    }
    return 'standard';
}
