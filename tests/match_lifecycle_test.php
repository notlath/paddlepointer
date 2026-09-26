<?php
declare(strict_types=1);

// Pure unit tests for the Match lifecycle module.
// Run directly without database:
//   php tests/match_lifecycle_test.php

require_once __DIR__ . '/../api/match_lifecycle.php';

function expect_same(mixed $expected, mixed $actual, string $label): void
{
    if ($expected !== $actual) {
        throw new RuntimeException(sprintf(
            "%s\n  expected: %s\n  actual:   %s",
            $label,
            var_export($expected, true),
            var_export($actual, true)
        ));
    }
}

function test_clean_match_score(): void
{
    expect_same('11', clean_match_score('11'), 'Two digits are preserved');
    expect_same('4', clean_match_score('4x'), 'Non-digits are stripped');
    expect_same('10', clean_match_score('100'), 'Capped at 2 digits');
    expect_same('99', clean_match_score('999'), 'Scores above 99 are capped at 2 digits');
    expect_same('05', clean_match_score('05'), 'Leading zeroes preserved');
    expect_same('0', clean_match_score(0), 'Integer 0 becomes "0"');
    expect_same('', clean_match_score(''), 'Empty string remains empty');
    expect_same('', clean_match_score(null), 'Null becomes empty');
    expect_same('', clean_match_score('abc'), 'Letters become empty');
}

function test_start_scheduled_match(): void
{
    $scheduled = [
        'id' => 'm1',
        'court' => 1,
        'round' => 1,
        'status' => 'scheduled',
        'scoreA' => '',
        'scoreB' => '',
    ];

    try {
        transition_match($scheduled, ['status' => 'in_progress']);
        throw new RuntimeException('Starting without activeGameId should fail');
    } catch (MatchConflictException $e) {
        expect_same('Active game id is required', $e->getMessage(), 'Requires active game id');
    }

    $started = transition_match($scheduled, [
        'activeGameId' => 'game_100',
        'startedAt' => '2026-09-13T10:00:00Z',
        'startedBy' => ['id' => 1, 'displayName' => 'Scorer'],
    ], ['intent' => 'start-match']);

    expect_same('in_progress', $started['status'], 'Status transitions to in_progress');
    expect_same('game_100', $started['activeGameId'], 'Active game id is set');
    expect_same('0', $started['scoreA'], 'scoreA defaults to 0');
    expect_same('0', $started['scoreB'], 'scoreB defaults to 0');
    expect_same('2026-09-13T10:00:00Z', $started['startedAt'], 'startedAt is set');
    expect_same(['id' => 1, 'displayName' => 'Scorer'], $started['startedBy'], 'startedBy is set');
    expect_same(null, $started['winner'], 'winner is null');
    expect_same(null, $started['gameId'], 'gameId is null');
}

function test_score_sync_in_progress_match(): void
{
    $inProgress = [
        'id' => 'm1',
        'status' => 'in_progress',
        'activeGameId' => 'game_100',
        'scoreA' => '3',
        'scoreB' => '2',
        'startedAt' => '2026-09-13T10:00:00Z',
    ];

    $synced = transition_match($inProgress, [
        'activeGameId' => 'game_100',
        'scoreA' => '7x',
        'scoreB' => '105',
    ], ['intent' => 'score-sync']);

    expect_same('7', $synced['scoreA'], 'scoreA is cleaned and digits only');
    expect_same('10', $synced['scoreB'], 'scoreB is capped at 2 digits');
    expect_same('in_progress', $synced['status'], 'Status remains in_progress');
    expect_same('game_100', $synced['activeGameId'], 'activeGameId is preserved');

    // Attempted update by another scoreboard
    try {
        transition_match($inProgress, [
            'activeGameId' => 'game_other',
            'scoreA' => '8',
        ], ['intent' => 'score-sync']);
        throw new RuntimeException('Score sync from another scoreboard should fail');
    } catch (MatchConflictException $e) {
        expect_same('Match is already ongoing on another scoreboard', $e->getMessage(), 'Refuses other scoreboard');
    }
}

function test_switch_ends_cue_follows_the_score_sync(): void
{
    $inProgress = [
        'id' => 'm1',
        'status' => 'in_progress',
        'activeGameId' => 'game_100',
        'scoreA' => '5',
        'scoreB' => '2',
        'startedAt' => '2026-09-13T10:00:00Z',
    ];

    $cued = transition_match($inProgress, ['activeGameId' => 'game_100', 'scoreA' => '6', 'switchEnds' => true], ['intent' => 'score-sync']);
    expect_same(true, $cued['switchEnds'], 'The Rally that reaches the midpoint carries the switch-ends cue');

    $next = transition_match($cued, ['activeGameId' => 'game_100', 'scoreB' => '3'], ['intent' => 'score-sync']);
    expect_same(false, $next['switchEnds'], 'The cue clears on the next Rally');

    $completed = transition_match($cued, ['gameId' => 'game_100', 'scoreA' => '11', 'scoreB' => '3', 'winner' => 'A', 'status' => 'completed', 'targetScore' => 11]);
    expect_same(false, $completed['switchEnds'], 'A finished Match shows no cue');
}

function test_busy_player_conflict(): void
{
    $live = [
        ['id' => 'm_live', 'status' => 'in_progress', 'court' => 2, 'teamA' => ['Alice', 'Amy'], 'teamB' => ['Bob', 'Bill']],
        ['id' => 'm_done', 'status' => 'completed', 'court' => 3, 'teamA' => ['Cid', 'Dee'], 'teamB' => ['Eli', 'Fay']],
        ['id' => 'm_next', 'status' => 'scheduled', 'court' => 1, 'teamA' => ['Gia', 'Hal'], 'teamB' => ['Ivy', 'Jo']],
    ];

    expect_same(
        'Amy is already playing on Court 2',
        busy_player_conflict($live, ['id' => 'm_start', 'teamA' => ['Gia', 'Amy'], 'teamB' => ['Ivy', 'Jo']]),
        'A Player in an ongoing Match is named with the court they are on'
    );

    expect_same(
        'Alice is already playing on Court 2',
        busy_player_conflict($live, ['id' => 'm_start', 'teamA' => ['Gia', 'Hal'], 'teamB' => [' alice ', 'Jo']]),
        'Player names match regardless of case and surrounding spaces'
    );

    expect_same(
        null,
        busy_player_conflict($live, ['id' => 'm_start', 'teamA' => ['Cid', 'Dee'], 'teamB' => ['Eli', 'Fay']]),
        'Players whose only other Match is finished are free'
    );

    expect_same(
        null,
        busy_player_conflict($live, ['id' => 'm_live', 'teamA' => ['Alice', 'Amy'], 'teamB' => ['Bob', 'Bill']]),
        'A Match is never blocked by its own Players, so taking over and resuming still work'
    );
}

function test_completing_in_progress_match(): void
{
    $inProgress = [
        'id' => 'm1',
        'status' => 'in_progress',
        'activeGameId' => 'game_100',
        'scoreA' => '3',
        'scoreB' => '2',
        'startedAt' => '2026-09-13T10:00:00Z',
    ];

    // Complete with an explicit winner.
    $completedB = transition_match($inProgress, [
        'activeGameId' => 'game_100',
        'gameId' => 'game_100',
        'scoreA' => '5',
        'scoreB' => '11',
        'winner' => 'B',
        'completedAt' => '2026-09-13T10:20:00Z',
        'durationSeconds' => 1200,
        'durationMinutes' => 20,
    ], ['intent' => 'complete-match']);

    expect_same('completed', $completedB['status'], 'Status becomes completed');
    expect_same('B', $completedB['winner'], 'Winner B is saved');
    expect_same('5', $completedB['scoreA'], 'scoreA is saved');
    expect_same('11', $completedB['scoreB'], 'scoreB is saved');
    expect_same('game_100', $completedB['gameId'], 'gameId is saved');
    expect_same(null, $completedB['activeGameId'], 'activeGameId is cleared');
    expect_same(1200, $completedB['durationSeconds'], 'durationSeconds is saved');
    expect_same(20, $completedB['durationMinutes'], 'durationMinutes is saved');

    // Tied without winner fails
    try {
        transition_match($inProgress, [
            'activeGameId' => 'game_100',
            'gameId' => 'game_100',
            'scoreA' => '9',
            'scoreB' => '9',
        ], ['intent' => 'complete-match']);
        throw new RuntimeException('Tied complete without winner should fail');
    } catch (MatchConflictException $e) {
        expect_same('Winner is required to complete the match', $e->getMessage(), 'Requires winner on tie');
    }

    foreach ([
        [['scoreA' => '3', 'scoreB' => '11', 'winner' => 'A'], 'Winner must correspond to the higher score'],
        [['scoreA' => '10', 'scoreB' => '8', 'winner' => 'A'], 'Winning score must reach the target score'],
        [['scoreA' => '11', 'scoreB' => '10', 'winner' => 'A'], 'Winner must lead by at least 2 points'],
    ] as [$result, $message]) {
        try {
            transition_match($inProgress, $result + [
                'activeGameId' => 'game_100',
                'gameId' => 'game_100',
                'targetScore' => 11,
                'winByTwo' => true,
            ], ['intent' => 'complete-match']);
            throw new RuntimeException("Invalid result should fail: $message");
        } catch (MatchConflictException $e) {
            expect_same($message, $e->getMessage(), $message);
        }
    }

    $retirement = transition_match($inProgress, [
        'activeGameId' => 'game_100',
        'gameId' => 'game_100',
        'scoreA' => '3',
        'scoreB' => '11',
        'winner' => 'A',
        'targetScore' => 11,
        'winByTwo' => true,
        'endedEarly' => true,
        'endReason' => 'retirement_or_forfeit',
        'retiredTeam' => 'B',
    ], ['intent' => 'complete-match']);
    expect_same('A', $retirement['winner'], 'Opponent wins when Team B retires');
}

function test_unstarted_match_cannot_be_completed(): void
{
    $scheduled = ['id' => 'm1', 'status' => 'scheduled'];
    try {
        transition_match($scheduled, [
            'status' => 'completed',
            'scoreA' => '11',
            'scoreB' => '5',
            'winner' => 'A',
        ]);
        throw new RuntimeException('Completing scheduled match should fail');
    } catch (MatchConflictException $e) {
        expect_same('Match must be started before it can be completed', $e->getMessage(), 'Refuses unstarted match');
    }
}

function test_completed_match_is_locked(): void
{
    $completed = [
        'id' => 'm1',
        'status' => 'completed',
        'gameId' => 'game_100',
        'scoreA' => '11',
        'scoreB' => '4',
        'winner' => 'A',
    ];

    // Cannot demote to scheduled or in_progress
    foreach (['scheduled', 'in_progress'] as $status) {
        try {
            transition_match($completed, ['status' => $status]);
            throw new RuntimeException("Demoting to $status should fail");
        } catch (MatchConflictException $e) {
            expect_same('Match is already completed and locked', $e->getMessage(), "Cannot demote to $status");
        }
    }

    // Same gameId can complete/update again
    $recompleted = transition_match($completed, [
        'gameId' => 'game_100',
        'scoreA' => '11',
        'scoreB' => '4',
        'winner' => 'A',
    ], ['intent' => 'complete-match']);
    expect_same('completed', $recompleted['status'], 'Same gameId succeeds');

    // Different gameId is refused
    try {
        transition_match($completed, [
            'gameId' => 'game_other',
            'winner' => 'B',
        ], ['intent' => 'complete-match']);
        throw new RuntimeException('Different gameId should fail');
    } catch (MatchConflictException $e) {
        expect_same('Match is already completed and locked', $e->getMessage(), 'Refuses different gameId');
    }

    // Empty gameId on complete-match cannot wipe existing gameId
    try {
        transition_match($completed, [
            'gameId' => '',
            'winner' => 'A',
        ], ['intent' => 'complete-match']);
        throw new RuntimeException('Empty gameId should fail on completed match with existing gameId');
    } catch (MatchConflictException $e) {
        expect_same('Match is already completed and locked', $e->getMessage(), 'Refuses empty gameId wipe');
    }
}

function test_unlock_match(): void
{
    $inProgress = [
        'id' => 'm1',
        'status' => 'in_progress',
        'activeGameId' => 'game_100',
        'scoreA' => '5',
        'scoreB' => '3',
        'startedAt' => '2026-09-13T10:00:00Z',
        'startedBy' => ['id' => 1],
    ];

    // Unlocking by owning device
    $unlocked = transition_match($inProgress, [
        'activeGameId' => 'game_100',
        'status' => 'scheduled',
    ], ['intent' => 'unlock-match']);

    expect_same('scheduled', $unlocked['status'], 'Status is scheduled');
    expect_same(null, $unlocked['activeGameId'], 'activeGameId is cleared');
    expect_same(null, $unlocked['startedAt'], 'startedAt is cleared');
    expect_same(null, $unlocked['startedBy'], 'startedBy is cleared');

    // Unlocking by another device fails
    try {
        transition_match($inProgress, [
            'activeGameId' => 'game_other',
            'status' => 'scheduled',
        ], ['intent' => 'unlock-match']);
        throw new RuntimeException('Unlock from other scoreboard should fail');
    } catch (MatchConflictException $e) {
        expect_same('Match is already ongoing on another scoreboard', $e->getMessage(), 'Refuses other device unlock');
    }
}

function test_schedule_update_lock_conflict(): void
{
    $inProgress = [
        'id' => 'm1',
        'status' => 'in_progress',
        'activeGameId' => 'game_100',
    ];

    try {
        transition_match($inProgress, [
            'activeGameId' => 'game_200',
            'status' => 'in_progress',
        ], ['intent' => 'schedule-update']);
        throw new RuntimeException('Changing lock on schedule-update should fail');
    } catch (MatchConflictException $e) {
        expect_same('Match is already ongoing', $e->getMessage(), 'Throws schedule-update conflict message');
    }
}

function test_decide_match_transition_wrapper(): void
{
    $scheduled = ['id' => 'm1', 'status' => 'scheduled'];

    // Successful transition
    $result = decide_match_transition($scheduled, [
        'activeGameId' => 'game_1',
        'status' => 'in_progress',
    ]);
    expect_same(true, $result['ok'], 'Returns ok = true');
    expect_same(null, $result['conflict'], 'conflict is null');
    expect_same('in_progress', $result['match']['status'], 'Match is transitioned');

    // Conflict transition
    $conflictResult = decide_match_transition($scheduled, ['status' => 'completed']);
    expect_same(false, $conflictResult['ok'], 'Returns ok = false');
    expect_same(null, $conflictResult['match'], 'match is null');
    expect_same('Match must be started before it can be completed', $conflictResult['conflict'], 'Conflict error is captured');
}

$tests = [
    'test_clean_match_score',
    'test_start_scheduled_match',
    'test_score_sync_in_progress_match',
    'test_switch_ends_cue_follows_the_score_sync',
    'test_busy_player_conflict',
    'test_completing_in_progress_match',
    'test_unstarted_match_cannot_be_completed',
    'test_completed_match_is_locked',
    'test_unlock_match',
    'test_schedule_update_lock_conflict',
    'test_decide_match_transition_wrapper',
];

$failed = false;
foreach ($tests as $test) {
    try {
        $test();
        echo "PASS $test\n";
    } catch (Throwable $e) {
        $failed = true;
        echo "FAIL $test\n  ", $e->getMessage(), "\n";
    }
}
exit($failed ? 1 : 0);
