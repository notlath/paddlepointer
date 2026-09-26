<?php
declare(strict_types=1);

// Match lifecycle module: central authority for Match transitions, locks, and score sanitization.
// Pure module with zero database dependencies, used by tournament endpoints and handlers.

class MatchConflictException extends RuntimeException
{
}

// Cleans match scores: digits only, capped at 2 digits.
function clean_match_score($value): string
{
    if ($value === null) {
        return '';
    }
    return substr(preg_replace('/\D+/', '', (string)$value) ?? '', 0, 2);
}

function sanitize_match_status($value): string
{
    return in_array($value, ['scheduled', 'in_progress', 'completed'], true) ? $value : 'scheduled';
}

function sanitize_match_winner($value): ?string
{
    return in_array($value, ['A', 'B'], true) ? $value : null;
}

function sanitize_match_scalar_or_null($value): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    return is_scalar($value) ? substr((string)$value, 0, 120) : null;
}

function sanitize_match_non_negative_int_or_null($value): ?int
{
    if ($value === null || $value === '') {
        return null;
    }
    return max(0, (int)round((float)$value));
}

function sanitize_match_started_by($value): ?array
{
    return is_array($value) ? $value : null;
}

// Refuses completed results that cannot occur under the Match's scoring rules.
function validate_completed_match_result(array $result): void
{
    $winner = sanitize_match_winner($result['winner'] ?? null);
    if (!$winner) {
        throw new MatchConflictException('Winner is required to complete the match');
    }

    $scoreA = clean_match_score($result['scoreA'] ?? '');
    $scoreB = clean_match_score($result['scoreB'] ?? '');
    if ($scoreA === '' || $scoreB === '') {
        throw new MatchConflictException('Scores are required to complete the match');
    }

    $endedEarly = filter_var($result['endedEarly'] ?? false, FILTER_VALIDATE_BOOL);
    $retiredTeam = sanitize_match_winner($result['retiredTeam'] ?? null);
    $isRetirement = $endedEarly
        && ($result['endReason'] ?? null) === 'retirement_or_forfeit'
        && $retiredTeam !== null;
    if ($isRetirement) {
        if ($winner === $retiredTeam) {
            throw new MatchConflictException('Winner must be the opponent of the retired team');
        }
        return;
    }

    $winnerScore = $winner === 'A' ? (int)$scoreA : (int)$scoreB;
    $loserScore = $winner === 'A' ? (int)$scoreB : (int)$scoreA;
    if ($winnerScore <= $loserScore) {
        throw new MatchConflictException('Winner must correspond to the higher score');
    }
    if ($endedEarly) {
        return;
    }

    $targetScore = max(1, (int)($result['targetScore'] ?? 11));
    if ($winnerScore < $targetScore) {
        throw new MatchConflictException('Winning score must reach the target score');
    }
    if (filter_var($result['winByTwo'] ?? true, FILTER_VALIDATE_BOOL) && $winnerScore - $loserScore < 2) {
        throw new MatchConflictException('Winner must lead by at least 2 points');
    }
}

// Every Player named on one side or the other of a Match, trimmed and lowercased for comparison.
function match_player_keys(array $match): array
{
    $keys = [];
    foreach (['teamA', 'teamB'] as $side) {
        foreach (is_array($match[$side] ?? null) ? $match[$side] : [] as $player) {
            $key = mb_strtolower(trim((string)$player));
            if ($key !== '') {
                $keys[$key] = trim((string)$player);
            }
        }
    }
    return $keys;
}

// A Player is on one court at a time. Names the first Player of $match who is already
// in another ongoing Match, and the court they are on, or null when every Player is free.
function busy_player_conflict(array $matches, array $match): ?string
{
    $starting = match_player_keys($match);
    if (!$starting) {
        return null;
    }

    foreach ($matches as $other) {
        if (!is_array($other) || (string)($other['status'] ?? '') !== 'in_progress') {
            continue;
        }
        if ((string)($other['id'] ?? '') === (string)($match['id'] ?? '')) {
            continue;
        }
        foreach (match_player_keys($other) as $key => $name) {
            if (isset($starting[$key])) {
                return sprintf('%s is already playing on Court %s', $name, (string)($other['court'] ?? '?'));
            }
        }
    }

    return null;
}

// Transitions a Match from its existing state to the requested change, enforcing lock integrity.
// Throws MatchConflictException if the transition violates lock ownership or lifecycle rules.
function transition_match(array $existingMatch, array $change, array $options = []): array
{
    $existingStatus = sanitize_match_status($existingMatch['status'] ?? 'scheduled');
    $intent = (string)($options['intent'] ?? $change['intent'] ?? '');

    if (isset($change['status'])) {
        $requestedStatus = sanitize_match_status($change['status']);
    } elseif ($intent === 'complete-match') {
        $requestedStatus = 'completed';
    } elseif ($intent === 'unlock-match') {
        $requestedStatus = 'scheduled';
    } elseif ($intent === 'start-match' || $intent === 'score-sync') {
        $requestedStatus = 'in_progress';
    } else {
        $requestedStatus = $existingStatus;
    }

    $existingActiveGameId = trim((string)($existingMatch['activeGameId'] ?? ''));
    $submittedActiveGameId = trim((string)($change['activeGameId'] ?? ''));
    $existingGameId = trim((string)($existingMatch['gameId'] ?? ''));
    $submittedGameId = trim((string)($change['gameId'] ?? ''));

    // A completed match is permanently locked and only accepts completion updates from its owning game.
    if ($existingStatus === 'completed') {
        if ($requestedStatus !== 'completed') {
            throw new MatchConflictException('Match is already completed and locked');
        }
        if ($existingGameId !== '' && $submittedGameId !== $existingGameId) {
            throw new MatchConflictException('Match is already completed and locked');
        }
    }

    // An in-progress match is locked to its activeGameId.
    if ($existingStatus === 'in_progress') {
        $lockConflictMessage = (string)($options['lockConflictMessage'] ?? ($intent === 'schedule-update' ? 'Match is already ongoing' : 'Match is already ongoing on another scoreboard'));

        if ($requestedStatus === 'in_progress') {
            if ($existingActiveGameId !== '' && $submittedActiveGameId !== '' && $submittedActiveGameId !== $existingActiveGameId) {
                throw new MatchConflictException($lockConflictMessage);
            }
        } elseif ($requestedStatus === 'completed') {
            if ($existingActiveGameId !== '' && $submittedGameId !== '' && $submittedGameId !== $existingActiveGameId) {
                throw new MatchConflictException('Match is already ongoing on another scoreboard');
            }
        } elseif ($requestedStatus === 'scheduled') {
            if ($existingActiveGameId !== '' && $submittedActiveGameId !== '' && $submittedActiveGameId !== $existingActiveGameId) {
                throw new MatchConflictException($lockConflictMessage);
            }
        }
    }

    if ($requestedStatus === 'in_progress') {
        if ($submittedActiveGameId === '' && $existingActiveGameId === '') {
            throw new MatchConflictException('Active game id is required');
        }

        $existingMatch['status'] = 'in_progress';
        $rawScoreA = $change['scoreA'] ?? ($existingMatch['scoreA'] ?? '0');
        $rawScoreB = $change['scoreB'] ?? ($existingMatch['scoreB'] ?? '0');
        $existingMatch['scoreA'] = $rawScoreA !== '' ? clean_match_score($rawScoreA) : '0';
        $existingMatch['scoreB'] = $rawScoreB !== '' ? clean_match_score($rawScoreB) : '0';
        $existingMatch['winner'] = null;
        $existingMatch['completedAt'] = null;
        $existingMatch['gameId'] = null;
        $existingMatch['durationSeconds'] = null;
        $existingMatch['durationMinutes'] = null;
        $existingMatch['startedAt'] = sanitize_match_scalar_or_null($existingMatch['startedAt'] ?? null)
            ?: sanitize_match_scalar_or_null($change['startedAt'] ?? null);
        $existingMatch['startedBy'] = sanitize_match_started_by($existingMatch['startedBy'] ?? null)
            ?: sanitize_match_started_by($change['startedBy'] ?? null);
        $existingMatch['activeGameId'] = $existingActiveGameId !== '' ? $existingActiveGameId : $submittedActiveGameId;
        $existingMatch['switchEnds'] = !empty($change['switchEnds']);
        return $existingMatch;
    }

    if ($requestedStatus === 'completed') {
        if ($existingStatus !== 'in_progress' && $existingStatus !== 'completed') {
            throw new MatchConflictException('Match must be started before it can be completed');
        }

        $scoreA = clean_match_score($change['scoreA'] ?? $existingMatch['scoreA'] ?? '');
        $scoreB = clean_match_score($change['scoreB'] ?? $existingMatch['scoreB'] ?? '');
        $winner = sanitize_match_winner($change['winner'] ?? ($existingMatch['winner'] ?? null));
        validate_completed_match_result($change + $existingMatch + [
            'scoreA' => $scoreA,
            'scoreB' => $scoreB,
            'winner' => $winner,
        ]);

        $existingMatch['status'] = 'completed';
        $existingMatch['scoreA'] = $scoreA;
        $existingMatch['scoreB'] = $scoreB;
        $existingMatch['winner'] = $winner;
        $existingMatch['completedAt'] = sanitize_match_scalar_or_null($change['completedAt'] ?? ($existingMatch['completedAt'] ?? null));
        $existingMatch['gameId'] = sanitize_match_scalar_or_null($change['gameId'] ?? ($existingMatch['gameId'] ?? null));
        $existingMatch['durationSeconds'] = sanitize_match_non_negative_int_or_null($change['durationSeconds'] ?? ($existingMatch['durationSeconds'] ?? null));
        $existingMatch['durationMinutes'] = sanitize_match_non_negative_int_or_null($change['durationMinutes'] ?? ($existingMatch['durationMinutes'] ?? null));
        $existingMatch['startedAt'] = sanitize_match_scalar_or_null($existingMatch['startedAt'] ?? null)
            ?: sanitize_match_scalar_or_null($change['startedAt'] ?? null);
        $existingMatch['startedBy'] = sanitize_match_started_by($existingMatch['startedBy'] ?? null)
            ?: sanitize_match_started_by($change['startedBy'] ?? null);
        $existingMatch['targetScore'] = max(1, (int)($change['targetScore'] ?? $existingMatch['targetScore'] ?? 11));
        $existingMatch['winByTwo'] = filter_var($change['winByTwo'] ?? $existingMatch['winByTwo'] ?? true, FILTER_VALIDATE_BOOL);
        $existingMatch['endedEarly'] = filter_var($change['endedEarly'] ?? $existingMatch['endedEarly'] ?? false, FILTER_VALIDATE_BOOL);
        $existingMatch['endReason'] = sanitize_match_scalar_or_null($change['endReason'] ?? $existingMatch['endReason'] ?? null);
        $existingMatch['retiredTeam'] = sanitize_match_winner($change['retiredTeam'] ?? $existingMatch['retiredTeam'] ?? null);
        $existingMatch['activeGameId'] = null;
        $existingMatch['switchEnds'] = false;
        return $existingMatch;
    }

    if ($requestedStatus === 'scheduled') {
        $existingMatch['status'] = 'scheduled';
        $existingMatch['scoreA'] = clean_match_score($change['scoreA'] ?? $existingMatch['scoreA'] ?? '');
        $existingMatch['scoreB'] = clean_match_score($change['scoreB'] ?? $existingMatch['scoreB'] ?? '');
        $existingMatch['winner'] = null;
        $existingMatch['completedAt'] = null;
        $existingMatch['gameId'] = null;
        $existingMatch['durationSeconds'] = null;
        $existingMatch['durationMinutes'] = null;
        $existingMatch['startedAt'] = null;
        $existingMatch['startedBy'] = null;
        $existingMatch['activeGameId'] = null;
        $existingMatch['switchEnds'] = false;
        return $existingMatch;
    }

    throw new MatchConflictException('Unsupported match update');
}

// Wrapper returning an associative array with match or conflict instead of throwing.
function decide_match_transition(array $existingMatch, array $change, array $options = []): array
{
    try {
        return [
            'ok' => true,
            'match' => transition_match($existingMatch, $change, $options),
            'conflict' => null,
        ];
    } catch (MatchConflictException $error) {
        return [
            'ok' => false,
            'match' => null,
            'conflict' => $error->getMessage(),
        ];
    }
}
