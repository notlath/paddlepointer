<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/access_policy.php';

// Players module: Players are lasting records, separate from the names typed on a roster or a
// scoreboard (ADR 0005). Names are trimmed, collapsed to single spaces, and matched regardless of
// case; the first spelling used for a name is kept as the Player's display name. players.name and
// players.normalized_name are VARCHAR(120), so a name is capped the same way clean_display_name() caps one.

function normalize_player_name(string $name): string
{
    return mb_strtolower(clean_player_name($name));
}

function clean_player_name(string $name): string
{
    return mb_substr(trim(preg_replace('/\s+/', ' ', $name) ?? ''), 0, 120);
}

// Returns the Player matching $name (trimmed, case-insensitive), or null if none does or $name is blank.
function find_player_by_name(PDO $pdo, string $name): ?array
{
    $name = clean_player_name($name);
    if ($name === '') {
        return null;
    }
    $select = $pdo->prepare("SELECT * FROM players WHERE normalized_name = :normalized_name LIMIT 1");
    $select->execute([':normalized_name' => normalize_player_name($name)]);
    $player = $select->fetch();
    return is_array($player) ? $player : null;
}

function find_player_by_id(PDO $pdo, int $id): ?array
{
    $select = $pdo->prepare("SELECT * FROM players WHERE id = :id LIMIT 1");
    $select->execute([':id' => $id]);
    $player = $select->fetch();
    return is_array($player) ? $player : null;
}

// Returns the Player matching $name (trimmed, case-insensitive), creating one if none exists.
// Returns null for a blank name. Used directly by save_game()/save_tournament(), and by the
// schema migration that backfills Players from Games, Tournament rosters and Schedules.
function find_or_create_player(PDO $pdo, string $name): ?array
{
    $existing = find_player_by_name($pdo, $name);
    if ($existing) {
        return $existing;
    }

    $name = clean_player_name($name);
    if ($name === '') {
        return null;
    }
    $normalized = normalize_player_name($name);

    try {
        $pdo->prepare("INSERT INTO players (name, normalized_name) VALUES (:name, :normalized_name)")->execute([
            ':name' => $name,
            ':normalized_name' => $normalized,
        ]);
        return [
            'id' => (int)$pdo->lastInsertId(),
            'name' => $name,
            'normalized_name' => $normalized,
        ];
    } catch (PDOException $error) {
        if ($error->getCode() !== '23000') { // anything but a duplicate normalized_name (a concurrent insert won the race)
            throw $error;
        }
    }

    return find_player_by_name($pdo, $name);
}

// Links $userId's account to the Player named $name, creating that Player if none matches yet.
// A Player already linked to a different account is left alone: users.player_id is unique, so the
// database itself refuses a second account, not a check-then-write race. Used when a Player login is
// created or promoted, and by the migration that links existing ones.
function link_user_to_player(PDO $pdo, int $userId, string $name): void
{
    $player = find_or_create_player($pdo, $name);
    if (!$player) {
        return;
    }

    try {
        $pdo->prepare("UPDATE users SET player_id = :player_id WHERE id = :id")->execute([
            ':player_id' => (int)$player['id'],
            ':id' => $userId,
        ]);
    } catch (PDOException $error) {
        if ($error->getCode() !== '23000') { // anything but that Player already having a linked account
            throw $error;
        }
    }
}

// Replaces $oldName with $newName wherever it names a player inside a team array, whichever shape it
// was saved in: an explicit players array, a {name: "..."} team (including a doubles "Old / Partner"
// name), or a bare ["Alice", "Bob"] array (from before migration 005). Anything else is left as-is.
function rename_in_team($team, string $oldName, string $newName)
{
    if (!is_array($team)) {
        return $team;
    }
    $matches = static fn(string $value): bool => normalize_player_name($value) === normalize_player_name($oldName);

    if (array_is_list($team)) {
        return array_map(static fn($entry) => is_string($entry) && $matches($entry) ? $newName : $entry, $team);
    }

    if (!empty($team['players']) && is_array($team['players'])) {
        $team['players'] = array_map(static fn($entry) => is_string($entry) && $matches($entry) ? $newName : $entry, $team['players']);
    }
    if (isset($team['name']) && is_string($team['name'])) {
        $parts = array_map('trim', explode('/', $team['name']));
        $renamed = false;
        foreach ($parts as &$part) {
            if ($matches($part)) {
                $part = $newName;
                $renamed = true;
            }
        }
        unset($part);
        if ($renamed) {
            $team['name'] = implode(' / ', $parts);
        }
    }
    return $team;
}

// Renames a Player and updates every place its old name was recorded: Games (game_players and each
// affected Game's stored teams), every Tournament's roster and Schedule, and the Qlik endpoints (which
// read the same tables directly, so nothing else is needed for those). Player names stay unique.
// Returns [status, payload] for the endpoint to send.
function rename_player(PDO $pdo, ?array $currentUser, int $playerId, string $newName): array
{
    if (!$currentUser) {
        return [401, ['ok' => false, 'error' => 'Login required']];
    }
    if (!can($currentUser, 'rename_player')) {
        return [403, ['ok' => false, 'error' => 'Staff access required']];
    }

    $player = find_player_by_id($pdo, $playerId);
    if (!$player) {
        return [404, ['ok' => false, 'error' => 'Player not found']];
    }

    $cleanName = clean_player_name($newName);
    if ($cleanName === '') {
        return [400, ['ok' => false, 'error' => 'Name is required']];
    }
    $normalized = normalize_player_name($cleanName);

    $collision = find_player_by_name($pdo, $cleanName);
    if ($collision && (int)$collision['id'] !== $playerId) {
        return [409, ['ok' => false, 'error' => "Another Player is already named \"{$collision['name']}\" — merge them instead?"]];
    }

    $oldName = (string)$player['name'];
    if (normalize_player_name($oldName) === $normalized && $oldName === $cleanName) {
        return [200, ['ok' => true, 'player' => ['id' => $playerId, 'name' => $cleanName]]];
    }

    $pdo->beginTransaction();
    try {
        try {
            $pdo->prepare("UPDATE players SET name = :name, normalized_name = :normalized_name WHERE id = :id")->execute([
                ':name' => $cleanName,
                ':normalized_name' => $normalized,
                ':id' => $playerId,
            ]);
        } catch (PDOException $error) {
            if ($error->getCode() === '23000') { // a concurrent rename or Merge claimed this name first
                $pdo->rollBack();
                return [409, ['ok' => false, 'error' => 'Another Player was just given that name — merge them instead?']];
            }
            throw $error;
        }

        $pdo->prepare("UPDATE game_players SET player_name = :name WHERE player_id = :id")->execute([
            ':name' => $cleanName,
            ':id' => $playerId,
        ]);

        rename_player_in_games($pdo, $playerId, $oldName, $cleanName);
        rename_player_in_tournaments($pdo, $oldName, $cleanName);

        $pdo->commit();
        return [200, ['ok' => true, 'player' => ['id' => $playerId, 'name' => $cleanName]]];
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

// Rewrites every Game this Player is recorded in: the stored game_json, and the team_a_name/team_b_name/
// winner_name columns derived from it the same way save_game() derives them.
function rename_player_in_games(PDO $pdo, int $playerId, string $oldName, string $newName): void
{
    $gameIds = $pdo->prepare("SELECT DISTINCT game_id FROM game_players WHERE player_id = :player_id");
    $gameIds->execute([':player_id' => $playerId]);

    $select = $pdo->prepare("SELECT game_json FROM games WHERE id = :id LIMIT 1 FOR UPDATE");
    $update = $pdo->prepare(
        "UPDATE games SET game_json = :game_json, team_a_name = :team_a_name, team_b_name = :team_b_name, winner_name = :winner_name
         WHERE id = :id"
    );

    foreach ($gameIds->fetchAll(PDO::FETCH_COLUMN) as $gameId) {
        $select->execute([':id' => $gameId]);
        $gameData = json_decode((string)$select->fetchColumn(), true);
        if (!is_array($gameData)) {
            continue;
        }

        if (isset($gameData['teamA'])) {
            $gameData['teamA'] = rename_in_team($gameData['teamA'], $oldName, $newName);
        }
        if (isset($gameData['teamB'])) {
            $gameData['teamB'] = rename_in_team($gameData['teamB'], $oldName, $newName);
        }

        $teamAName = team_display_name($gameData['teamA'] ?? null, 'Team A');
        $teamBName = team_display_name($gameData['teamB'] ?? null, 'Team B');
        $winnerTeam = $gameData['winner'] ?? null;
        $winnerName = null;
        if ($winnerTeam === 'A') {
            $winnerName = $teamAName;
        } elseif ($winnerTeam === 'B') {
            $winnerName = $teamBName;
        }

        $update->execute([
            ':game_json' => json_encode($gameData, JSON_UNESCAPED_SLASHES),
            ':team_a_name' => $teamAName,
            ':team_b_name' => $teamBName,
            ':winner_name' => $winnerName,
            ':id' => $gameId,
        ]);
    }
}

// A team's display name, the same way save_game() derives team_a_name/team_b_name from teamA/teamB.
function team_display_name($team, string $fallback): string
{
    return is_array($team) ? (string)($team['name'] ?? $fallback) : $fallback;
}

// A LIKE pattern finding $name inside stored JSON, which json_encode() writes with \uXXXX escapes
// for non-ASCII characters and \" for quotes, so "Peñaflor" is searched for as "Peñaflor".
function like_stored_name(string $name): string
{
    $stored = substr(json_encode($name, JSON_UNESCAPED_SLASHES), 1, -1);
    return '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $stored) . '%';
}

// Rewrites every Tournament's roster (playersText) and Schedule (each Match's stored teams) that names
// this Player, across every Event: Qlik pulls every Event's Matches, not only the Current Event's.
function rename_player_in_tournaments(PDO $pdo, string $oldName, string $newName): void
{
    $likeOldName = like_stored_name($oldName);

    $tournaments = $pdo->prepare("SELECT id, tournament_json FROM tournaments WHERE tournament_json LIKE :like FOR UPDATE");
    $tournaments->execute([':like' => $likeOldName]);
    $updateTournament = $pdo->prepare("UPDATE tournaments SET tournament_json = :json WHERE id = :id");
    $affectedTournamentIds = [];
    foreach ($tournaments->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $data = json_decode((string)$row['tournament_json'], true);
        if (!is_array($data) || empty($data['playersText'])) {
            continue;
        }
        $names = preg_split('/([\n,]+)/', (string)$data['playersText'], -1, PREG_SPLIT_DELIM_CAPTURE) ?: [];
        $renamed = false;
        foreach ($names as &$part) {
            if (normalize_player_name($part) === normalize_player_name($oldName)) {
                $part = $newName;
                $renamed = true;
            }
        }
        unset($part);
        if ($renamed) {
            $data['playersText'] = implode('', $names);
            $updateTournament->execute([':json' => json_encode($data, JSON_UNESCAPED_SLASHES), ':id' => $row['id']]);
            $affectedTournamentIds[$row['id']] = true;
        }
    }

    $matches = $pdo->prepare(
        "SELECT tournament_id, id, team_a, team_b, match_json FROM tournament_matches
         WHERE team_a LIKE :like OR team_b LIKE :like OR match_json LIKE :like FOR UPDATE"
    );
    $matches->execute([':like' => $likeOldName]);
    $updateMatch = $pdo->prepare(
        "UPDATE tournament_matches SET team_a = :team_a, team_b = :team_b, match_json = :match_json WHERE tournament_id = :tid AND id = :id"
    );
    $touchTournament = $pdo->prepare(
        "UPDATE tournaments SET updated_at = GREATEST(CURRENT_TIMESTAMP(6), DATE_ADD(updated_at, INTERVAL 1 MICROSECOND)) WHERE id = :id"
    );
    foreach ($matches->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $teamA = $row['team_a'] !== null ? json_decode((string)$row['team_a'], true) : null;
        $teamB = $row['team_b'] !== null ? json_decode((string)$row['team_b'], true) : null;
        $matchJson = isset($row['match_json']) && $row['match_json'] !== null ? json_decode((string)$row['match_json'], true) : null;
        if (is_array($matchJson)) {
            if (isset($matchJson['teamA'])) {
                $matchJson['teamA'] = rename_in_team($matchJson['teamA'], $oldName, $newName);
            }
            if (isset($matchJson['teamB'])) {
                $matchJson['teamB'] = rename_in_team($matchJson['teamB'], $oldName, $newName);
            }
        }
        $updateMatch->execute([
            ':team_a' => $row['team_a'] !== null ? json_encode(rename_in_team($teamA, $oldName, $newName), JSON_UNESCAPED_SLASHES) : null,
            ':team_b' => $row['team_b'] !== null ? json_encode(rename_in_team($teamB, $oldName, $newName), JSON_UNESCAPED_SLASHES) : null,
            ':match_json' => is_array($matchJson) ? json_encode($matchJson, JSON_UNESCAPED_SLASHES) : ($row['match_json'] ?? null),
            ':tid' => $row['tournament_id'],
            ':id' => $row['id'],
        ]);
        $affectedTournamentIds[$row['tournament_id']] = true;
    }
    foreach (array_keys($affectedTournamentIds) as $tid) {
        $touchTournament->execute([':id' => $tid]);
    }
}

// Sets or clears a Player's Skill level (Beginner, Intermediate, Advanced, or Unrated/null).
// Staff-only (Admin and Super Admin). Returns [status, payload].
const VALID_SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'];

function normalize_skill_level(?string $level): string|null|false
{
    if ($level === null) {
        return null;
    }
    $trimmed = mb_strtolower(trim($level));
    if ($trimmed === '' || $trimmed === 'unrated') {
        return null;
    }
    if (in_array($trimmed, VALID_SKILL_LEVELS, true)) {
        return $trimmed;
    }
    return false;
}

function set_player_skill(PDO $pdo, ?array $currentUser, int $playerId, ?string $skillLevel): array
{
    if (!$currentUser) {
        return [401, ['ok' => false, 'error' => 'Login required']];
    }
    if (!can($currentUser, 'set_player_skill')) {
        return [403, ['ok' => false, 'error' => 'Staff access required']];
    }

    $player = find_player_by_id($pdo, $playerId);
    if (!$player) {
        return [404, ['ok' => false, 'error' => 'Player not found']];
    }

    $normalized = normalize_skill_level($skillLevel);
    if ($normalized === false) {
        return [400, ['ok' => false, 'error' => 'Invalid skill level. Allowed values: Beginner, Intermediate, Advanced, or Unrated']];
    }

    $pdo->prepare("UPDATE players SET skill_level = :skill_level WHERE id = :id")->execute([
        ':skill_level' => $normalized,
        ':id' => $playerId,
    ]);

    return [200, [
        'ok' => true,
        'player' => [
            'id' => $playerId,
            'name' => (string)$player['name'],
            'skillLevel' => $normalized,
        ],
    ]];
}

// Staff-only Players list: each Player's name, skill level, how many Games they're recorded in,
// across how many Tournaments, and whether an account is linked to them.
function list_players(PDO $pdo, ?array $currentUser): array
{
    if (!$currentUser) {
        return [401, ['ok' => false, 'error' => 'Login required']];
    }
    if (!can($currentUser, 'view_players')) {
        return [403, ['ok' => false, 'error' => 'Staff access required']];
    }

    $rows = $pdo->query(
        "SELECT players.id, players.name, players.skill_level,
                COUNT(DISTINCT game_players.game_id) AS match_count,
                COUNT(DISTINCT games.tournament_id) AS event_count,
                MAX(users.id IS NOT NULL) AS has_account
         FROM players
         LEFT JOIN game_players ON game_players.player_id = players.id
         LEFT JOIN games ON games.id = game_players.game_id
         LEFT JOIN users ON users.player_id = players.id
         GROUP BY players.id, players.name, players.skill_level
         ORDER BY players.name ASC"
    )->fetchAll(PDO::FETCH_ASSOC);

    $players = array_map(static fn(array $row): array => [
        'id' => (int)$row['id'],
        'name' => (string)$row['name'],
        'skillLevel' => $row['skill_level'] ?? null,
        'matchCount' => (int)$row['match_count'],
        'eventCount' => (int)$row['event_count'],
        'hasAccount' => (bool)$row['has_account'],
    ], $rows);

    return [200, ['ok' => true, 'players' => $players]];
}

// Merges one Player ($absorbedId) into another ($survivorId).
// Staff-only (Admin and Super Admin). Returns [status, payload].
function merge_players(PDO $pdo, ?array $currentUser, int $survivorId, int $absorbedId): array
{
    if (!$currentUser) {
        return [401, ['ok' => false, 'error' => 'Login required']];
    }
    if (!can($currentUser, 'merge_players')) {
        return [403, ['ok' => false, 'error' => 'Staff access required']];
    }
    if ($survivorId === $absorbedId) {
        return [400, ['ok' => false, 'error' => 'Cannot merge a Player into themselves']];
    }

    $survivor = find_player_by_id($pdo, $survivorId);
    $absorbed = find_player_by_id($pdo, $absorbedId);
    if (!$survivor || !$absorbed) {
        return [404, ['ok' => false, 'error' => 'Player not found']];
    }

    // Refuse if both players have linked accounts
    $userCountStmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE player_id IN (:survivor_id, :absorbed_id)");
    $userCountStmt->execute([':survivor_id' => $survivorId, ':absorbed_id' => $absorbedId]);
    if ((int)$userCountStmt->fetchColumn() > 1) {
        return [400, ['ok' => false, 'error' => 'Both Players have linked accounts. Unlink one first.']];
    }

    // Refuse if both players appear in the same Match in games
    $sameGameStmt = $pdo->prepare(
        "SELECT gp1.game_id
         FROM game_players gp1
         INNER JOIN game_players gp2 ON gp1.game_id = gp2.game_id
         WHERE gp1.player_id = :survivor_id AND gp2.player_id = :absorbed_id
         LIMIT 1"
    );
    $sameGameStmt->execute([':survivor_id' => $survivorId, ':absorbed_id' => $absorbedId]);
    if ($sameGameStmt->fetch()) {
        return [400, ['ok' => false, 'error' => 'Both Players appear in the same Match. One person cannot play in two spots of one Match.']];
    }

    // Refuse if both players appear in the same Match in tournament_matches
    $normSurvivor = normalize_player_name((string)$survivor['name']);
    $normAbsorbed = normalize_player_name((string)$absorbed['name']);
    $likeSurvivor = like_stored_name((string)$survivor['name']);
    $likeAbsorbed = like_stored_name((string)$absorbed['name']);
    $sameScheduledMatch = $pdo->prepare(
        "SELECT team_a, team_b FROM tournament_matches
         WHERE (team_a LIKE :s1 OR team_b LIKE :s2 OR match_json LIKE :s3)
           AND (team_a LIKE :a1 OR team_b LIKE :a2 OR match_json LIKE :a3)"
    );
    $sameScheduledMatch->execute([
        ':s1' => $likeSurvivor, ':s2' => $likeSurvivor, ':s3' => $likeSurvivor,
        ':a1' => $likeAbsorbed, ':a2' => $likeAbsorbed, ':a3' => $likeAbsorbed,
    ]);
    while ($row = $sameScheduledMatch->fetch(PDO::FETCH_ASSOC)) {
        $namesInMatch = [];
        foreach (['team_a', 'team_b'] as $col) {
            if (!empty($row[$col])) {
                foreach (player_names_from_team($row[$col]) as $n) {
                    $namesInMatch[normalize_player_name($n)] = true;
                }
            }
        }
        if (isset($namesInMatch[$normSurvivor], $namesInMatch[$normAbsorbed])) {
            return [400, ['ok' => false, 'error' => 'Both Players appear in the same Match. One person cannot play in two spots of one Match.']];
        }
    }

    $finalSkillLevel = $survivor['skill_level'];
    if ($finalSkillLevel === null && $absorbed['skill_level'] !== null) {
        $finalSkillLevel = $absorbed['skill_level'];
    }

    $pdo->beginTransaction();
    try {
        if ($finalSkillLevel !== $survivor['skill_level']) {
            $pdo->prepare("UPDATE players SET skill_level = :skill_level WHERE id = :id")
                ->execute([':skill_level' => $finalSkillLevel, ':id' => $survivorId]);
        }

        // Move linked user account if absorbed Player has one
        try {
            $pdo->prepare("UPDATE users SET player_id = :survivor_id WHERE player_id = :absorbed_id")
                ->execute([':survivor_id' => $survivorId, ':absorbed_id' => $absorbedId]);
        } catch (PDOException $error) {
            if ($error->getCode() === '23000') { // an account was linked to the survivor since the check above
                $pdo->rollBack();
                return [400, ['ok' => false, 'error' => 'Both Players have linked accounts. Unlink one first.']];
            }
            throw $error;
        }

        // Rewrite the absorbed Player's stored Game JSON and derived columns, while game_players still finds them
        rename_player_in_games($pdo, $absorbedId, (string)$absorbed['name'], (string)$survivor['name']);

        // Move game_players to survivor
        $pdo->prepare("UPDATE game_players SET player_id = :survivor_id, player_name = :survivor_name WHERE player_id = :absorbed_id")
            ->execute([
                ':survivor_id' => $survivorId,
                ':survivor_name' => (string)$survivor['name'],
                ':absorbed_id' => $absorbedId,
            ]);

        // Rewrite Tournaments roster and Schedule
        merge_player_in_tournaments($pdo, (string)$absorbed['name'], (string)$survivor['name']);

        // Delete the absorbed Player record
        $pdo->prepare("DELETE FROM players WHERE id = :id")->execute([':id' => $absorbedId]);

        $pdo->commit();

        return [200, [
            'ok' => true,
            'survivor' => [
                'id' => $survivorId,
                'name' => (string)$survivor['name'],
                'skillLevel' => $finalSkillLevel,
            ],
            'absorbed' => [
                'id' => $absorbedId,
                'name' => (string)$absorbed['name'],
            ],
        ]];
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

// Rewrites every Tournament roster and Schedule for a Merge, listing the survivor once where both Players appeared.
function merge_player_in_tournaments(PDO $pdo, string $oldName, string $newName): void
{
    rename_player_in_tournaments($pdo, $oldName, $newName);

    $likeNewName = like_stored_name($newName);
    $tournaments = $pdo->prepare("SELECT id, tournament_json FROM tournaments WHERE tournament_json LIKE :like FOR UPDATE");
    $tournaments->execute([':like' => $likeNewName]);
    $updateTournament = $pdo->prepare("UPDATE tournaments SET tournament_json = :json WHERE id = :id");
    foreach ($tournaments->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $data = json_decode((string)$row['tournament_json'], true);
        if (!is_array($data) || empty($data['playersText'])) {
            continue;
        }
        // Same split as rename_player_in_tournaments(): names at even indexes, separators between them.
        $parts = preg_split('/([\n,]+)/', (string)$data['playersText'], -1, PREG_SPLIT_DELIM_CAPTURE) ?: [];
        $kept = [];
        $seenSurvivor = false;
        $changed = false;
        foreach ($parts as $i => $part) {
            if ($i % 2 === 1) {
                continue;
            }
            if (normalize_player_name($part) === normalize_player_name($newName)) {
                if ($seenSurvivor) {
                    $changed = true; // drop this repeat and the separator before it
                    continue;
                }
                $seenSurvivor = true;
            }
            if ($i > 0) {
                $kept[] = $parts[$i - 1];
            }
            $kept[] = $part;
        }
        if ($changed) {
            $data['playersText'] = implode('', $kept);
            $updateTournament->execute([':json' => json_encode($data, JSON_UNESCAPED_SLASHES), ':id' => $row['id']]);
        }
    }
}

// Extracts player names from a team array, json string, or {name: "..."} doubles representation.
function player_names_from_team($team): array
{
    if (is_string($team)) {
        $team = json_decode($team, true);
    }
    if (!is_array($team)) {
        return [];
    }
    if (array_is_list($team)) {
        return array_values(array_filter($team, 'is_string'));
    }
    if (!empty($team['players']) && is_array($team['players'])) {
        return array_values(array_filter($team['players'], 'is_string'));
    }
    if (isset($team['name']) && is_string($team['name'])) {
        return array_values(array_filter(array_map('trim', explode('/', $team['name']))));
    }
    return [];
}

