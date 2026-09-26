<?php
declare(strict_types=1);

// Super Admin corrections and deleting empty Events:
//   php tests/event_corrections_and_deletion_test.php
// Database setup: see tests/test_db.php.

require_once __DIR__ . '/test_db.php';
require_once __DIR__ . '/../api/tournaments.php';
require_once __DIR__ . '/../api/games.php';
require_once __DIR__ . '/../api/qlik/leaderboard.php';

function user_for_role(string $role): array
{
    return ['id' => 1, 'username' => "{$role}_user", 'display_name' => ucfirst($role), 'role' => $role, 'is_active' => 1];
}

function setup_fixture_past_and_current_events(PDO $pdo): array
{
    migrate($pdo);
    $superAdmin = user_for_role('super_admin');

    // 1. Seed open_play with 2 matches (m1 completed, m2 scheduled)
    save_tournament($pdo, $superAdmin, ['intent' => 'schedule-update', 'tournament' => [
        'id' => 'open_play', 'name' => 'Open Play', 'courts' => 2, 'matches' => [
            ['id' => 'm1', 'status' => 'completed', 'scoreA' => '11', 'scoreB' => '4', 'winner' => 'A'],
            ['id' => 'm2', 'status' => 'scheduled'],
        ],
    ]]);

    // Record game for m1
    save_game($pdo, $superAdmin, ['game' => [
        'id' => 'g_open_1',
        'status' => 'completed',
        'type' => 'doubles',
        'teamA' => ['name' => 'Team Alpha', 'players' => ['Alice', 'Bob'], 'score' => 11],
        'teamB' => ['name' => 'Team Beta', 'players' => ['Charlie', 'Dave'], 'score' => 4],
        'winner' => 'A',
        'tournamentMatch' => ['tournamentId' => 'open_play', 'matchId' => 'm1'],
    ]]);

    // 2. Start new event via ticket 17 flow
    [, $newEvent] = start_new_event($pdo, $superAdmin, ['name' => 'Fall Classic', 'courts' => 3]);
    $currentId = $newEvent['id'];

    return [$superAdmin, 'open_play', $currentId];
}

function test_roles_refused_match_correction(PDO $pdo): void
{
    [$superAdmin, $pastId, $currentId] = setup_fixture_past_and_current_events($pdo);

    $correctionData = [
        'tournamentId' => $pastId,
        'matchId' => 'm1',
        'scoreA' => '8',
        'scoreB' => '11',
        'winner' => 'B',
    ];

    // Signed out (null)
    [$statusNull, $payloadNull] = correct_tournament_match($pdo, null, $correctionData);
    expect_same(401, $statusNull, 'Signed-out caller is refused with 401');

    // Admin
    [$statusAdmin, $payloadAdmin] = correct_tournament_match($pdo, user_for_role('admin'), $correctionData);
    expect_same(403, $statusAdmin, 'Admin role cannot correct matches (403)');

    // Player
    [$statusPlayer, $payloadPlayer] = correct_tournament_match($pdo, user_for_role('player'), $correctionData);
    expect_same(403, $statusPlayer, 'Player role cannot correct matches (403)');

    // Visitor
    [$statusVisitor, $payloadVisitor] = correct_tournament_match($pdo, user_for_role('visitor'), $correctionData);
    expect_same(403, $statusVisitor, 'Visitor role cannot correct matches (403)');
}

function test_super_admin_corrects_finished_match_in_past_event(PDO $pdo): void
{
    [$superAdmin, $pastId, $currentId] = setup_fixture_past_and_current_events($pdo);
    expect_same($currentId, current_event_id($pdo), 'Fall Classic is current event');
    expect_same(true, $pastId !== $currentId, 'open_play is indeed a past event');

    // Verify initial leaderboard before correction
    [, $lbBefore] = read_leaderboard($pdo, $superAdmin, ['event' => $pastId]);
    expect_same('Team Alpha', $lbBefore['teamRows'][0]['name'], 'Team Alpha initially leading with 1 win');
    expect_same(1, $lbBefore['teamRows'][0]['wins'], 'Team Alpha has 1 win');
    expect_same(11, $lbBefore['teamRows'][0]['pointsFor'], 'Team Alpha has 11 points');

    // Super Admin corrects m1 on past event: score becomes 8-11, winner B
    [$status, $payload] = correct_tournament_match($pdo, $superAdmin, [
        'tournamentId' => $pastId,
        'matchId' => 'm1',
        'scoreA' => '8',
        'scoreB' => '11',
        'winner' => 'B',
    ]);

    expect_same(200, $status, 'Super Admin correction returns 200');
    expect_same(true, $payload['ok'] ?? null, 'Correction payload has ok: true');

    // Verify tournament_matches row in DB
    $matchStmt = $pdo->prepare("SELECT * FROM tournament_matches WHERE tournament_id = :tid AND id = :id");
    $matchStmt->execute([':tid' => $pastId, ':id' => 'm1']);
    $mRow = $matchStmt->fetch(PDO::FETCH_ASSOC);
    expect_same('8', $mRow['score_a'], 'tournament_matches score_a updated to 8');
    expect_same('11', $mRow['score_b'], 'tournament_matches score_b updated to 11');
    expect_same('B', $mRow['winner'], 'tournament_matches winner updated to B');

    // Verify games row in DB
    $gameStmt = $pdo->prepare("SELECT * FROM games WHERE tournament_id = :tid AND tournament_match_id = :mid");
    $gameStmt->execute([':tid' => $pastId, ':mid' => 'm1']);
    $gRow = $gameStmt->fetch(PDO::FETCH_ASSOC);
    expect_same(8, (int)$gRow['team_a_score'], 'games team_a_score updated to 8');
    expect_same(11, (int)$gRow['team_b_score'], 'games team_b_score updated to 11');
    expect_same('B', $gRow['winner_team'], 'games winner_team updated to B');
    expect_same('Team Beta', $gRow['winner_name'], 'games winner_name updated to Team Beta');

    // Verify read_leaderboard immediately reflects the correction
    [, $lbAfter] = read_leaderboard($pdo, $superAdmin, ['event' => $pastId]);
    expect_same('Team Beta', $lbAfter['teamRows'][0]['name'], 'Team Beta is now leading after correction');
    expect_same(1, $lbAfter['teamRows'][0]['wins'], 'Team Beta has 1 win');
    expect_same(11, $lbAfter['teamRows'][0]['pointsFor'], 'Team Beta has 11 points');
    expect_same('Team Alpha', $lbAfter['teamRows'][1]['name'], 'Team Alpha is now second');
    expect_same(0, $lbAfter['teamRows'][1]['wins'], 'Team Alpha has 0 wins');
    expect_same(8, $lbAfter['teamRows'][1]['pointsFor'], 'Team Alpha has 8 points');

    // Verify read_qlik_leaderboard_results immediately reflects the correction
    putenv('ANALYTICS_KEY=test-key');
    [$qlikStatus, $qlikResults] = read_qlik_leaderboard_results($pdo, 'test-key', ['event' => $pastId]);
    expect_same(200, $qlikStatus, 'Qlik results returns 200');
    expect_same(1, count($qlikResults['rows']), 'Qlik leaderboard results has 1 match');
    expect_same('B', $qlikResults['rows'][0]['winner'], 'Qlik result winner is B');
    expect_same(8, $qlikResults['rows'][0]['teamAScore'], 'Qlik result teamAScore is 8');
    expect_same(11, $qlikResults['rows'][0]['teamBScore'], 'Qlik result teamBScore is 11');
}

function test_match_correction_guardrails(PDO $pdo): void
{
    [$superAdmin, $pastId, $currentId] = setup_fixture_past_and_current_events($pdo);

    // 1. Attempt to correct an unfinished match (m2 is scheduled)
    [$statusScheduled, $payloadScheduled] = correct_tournament_match($pdo, $superAdmin, [
        'tournamentId' => $pastId,
        'matchId' => 'm2',
        'scoreA' => '11',
        'scoreB' => '5',
        'winner' => 'A',
    ]);
    expect_same(400, $statusScheduled, 'Correcting an unfinished match returns 400');
    expect_same(false, $payloadScheduled['ok'] ?? null, 'Reply reports ok: false');

    // 2. Attempt to correct with tied scores (11-11)
    [$statusTie, $payloadTie] = correct_tournament_match($pdo, $superAdmin, [
        'tournamentId' => $pastId,
        'matchId' => 'm1',
        'scoreA' => '11',
        'scoreB' => '11',
        'winner' => 'A',
    ]);
    expect_same(400, $statusTie, 'Correcting with tied scores returns 400');
    expect_same(false, $payloadTie['ok'] ?? null, 'Reply reports ok: false');

    // 3. Attempt to correct with non-existent match id
    [$statusMissingMatch, $payloadMissingMatch] = correct_tournament_match($pdo, $superAdmin, [
        'tournamentId' => $pastId,
        'matchId' => 'non_existent_match',
        'scoreA' => '11',
        'scoreB' => '5',
        'winner' => 'A',
    ]);
    expect_same(404, $statusMissingMatch, 'Non-existent match returns 404');

    // 4. Attempt to correct with non-existent tournament id
    [$statusMissingTourn, $payloadMissingTourn] = correct_tournament_match($pdo, $superAdmin, [
        'tournamentId' => 'non_existent_tournament',
        'matchId' => 'm1',
        'scoreA' => '11',
        'scoreB' => '5',
        'winner' => 'A',
    ]);
    expect_same(404, $statusMissingTourn, 'Non-existent tournament returns 404');

    // 5. Attempt to correct with winner contradicting scores
    [$statusWinnerMismatch, $payloadWinnerMismatch] = correct_tournament_match($pdo, $superAdmin, [
        'tournamentId' => $pastId,
        'matchId' => 'm1',
        'scoreA' => '11',
        'scoreB' => '5',
        'winner' => 'B',
    ]);
    expect_same(400, $statusWinnerMismatch, 'Winner contradicting higher score returns 400');

    foreach ([
        [['scoreA' => '10', 'scoreB' => '8', 'winner' => 'A'], 'Winning score must reach the target score'],
        [['scoreA' => '11', 'scoreB' => '10', 'winner' => 'A'], 'Winner must lead by at least 2 points'],
        [['scoreA' => '11', 'scoreB' => '5'], 'Winner is required to complete the match'],
    ] as [$result, $message]) {
        [$status, $payload] = correct_tournament_match($pdo, $superAdmin, $result + [
            'tournamentId' => $pastId,
            'matchId' => 'm1',
        ]);
        expect_same([400, $message], [$status, $payload['error'] ?? null], "Correction refuses: $message");
    }

    $retirement = [
        'scoreA' => '0',
        'scoreB' => '0',
        'winner' => 'A',
        'endedEarly' => true,
        'endReason' => 'retirement_or_forfeit',
        'retiredTeam' => 'B',
    ];
    $pdo->prepare("UPDATE tournament_matches SET score_a = '0', score_b = '0', winner = 'A', match_json = :json WHERE tournament_id = :tid AND id = 'm1'")
        ->execute([':json' => json_encode($retirement, JSON_UNESCAPED_SLASHES), ':tid' => $pastId]);
    [$status] = correct_tournament_match($pdo, $superAdmin, $retirement + [
        'tournamentId' => $pastId,
        'matchId' => 'm1',
    ]);
    expect_same(200, $status, 'A 0-0 retirement correction uses the shared scoring rules');
}

function test_roles_refused_event_deletion(PDO $pdo): void
{
    [$superAdmin, $pastId, $currentId] = setup_fixture_past_and_current_events($pdo);

    // Create an empty event
    save_tournament($pdo, $superAdmin, ['intent' => 'schedule-update', 'tournament' => [
        'id' => 'empty_event', 'name' => 'Empty Event', 'courts' => 1, 'matches' => [],
    ]]);

    // Signed-out caller (null)
    [$statusNull, $payloadNull] = delete_event($pdo, null, ['eventId' => 'empty_event']);
    expect_same(401, $statusNull, 'Signed-out caller cannot delete event (401)');

    // Admin
    [$statusAdmin, $payloadAdmin] = delete_event($pdo, user_for_role('admin'), ['eventId' => 'empty_event']);
    expect_same(403, $statusAdmin, 'Admin role cannot delete event (403)');

    // Player
    [$statusPlayer, $payloadPlayer] = delete_event($pdo, user_for_role('player'), ['eventId' => 'empty_event']);
    expect_same(403, $statusPlayer, 'Player role cannot delete event (403)');

    // Visitor
    [$statusVisitor, $payloadVisitor] = delete_event($pdo, user_for_role('visitor'), ['eventId' => 'empty_event']);
    expect_same(403, $statusVisitor, 'Visitor role cannot delete event (403)');
}

function test_delete_event_with_finished_matches_is_refused(PDO $pdo): void
{
    [$superAdmin, $pastId, $currentId] = setup_fixture_past_and_current_events($pdo);

    // open_play has a completed match (m1)
    [$status, $payload] = delete_event($pdo, $superAdmin, ['eventId' => $pastId]);
    expect_same(400, $status, 'Deleting an event with finished matches is refused with 400');
    expect_same(false, $payload['ok'] ?? null, 'Reply reports ok: false');
    expect_same(true, str_contains($payload['error'] ?? '', 'finished matches'), 'Error mentions finished matches');

    // Verify open_play records are completely intact
    $tournStmt = $pdo->prepare("SELECT COUNT(*) FROM tournaments WHERE id = :id");
    $tournStmt->execute([':id' => $pastId]);
    expect_same(1, (int)$tournStmt->fetchColumn(), 'Tournament open_play is preserved in DB');

    $matchStmt = $pdo->prepare("SELECT COUNT(*) FROM tournament_matches WHERE tournament_id = :tid");
    $matchStmt->execute([':tid' => $pastId]);
    expect_same(2, (int)$matchStmt->fetchColumn(), 'Matches in open_play are preserved in DB');

    $gameStmt = $pdo->prepare("SELECT COUNT(*) FROM games WHERE tournament_id = :tid");
    $gameStmt->execute([':tid' => $pastId]);
    expect_same(1, (int)$gameStmt->fetchColumn(), 'Games in open_play are preserved in DB');
}

function test_super_admin_deletes_empty_event_and_cleans_up(PDO $pdo): void
{
    [$superAdmin, $pastId, $currentId] = setup_fixture_past_and_current_events($pdo);

    // Create an empty event with scheduled and in_progress matches, but 0 finished matches
    save_tournament($pdo, $superAdmin, ['intent' => 'schedule-update', 'tournament' => [
        'id' => 'mistake_event', 'name' => 'Mistake Event', 'courts' => 2, 'matches' => [
            ['id' => 'm_sched', 'status' => 'scheduled'],
            ['id' => 'm_prog', 'status' => 'in_progress', 'startedAt' => '2026-09-18T00:00:00Z'],
        ],
    ]]);

    // Super Admin deletes this event
    [$status, $payload] = delete_event($pdo, $superAdmin, ['eventId' => 'mistake_event']);
    expect_same(200, $status, 'Super Admin successfully deletes empty event (200)');
    expect_same(true, $payload['ok'] ?? null, 'Payload ok: true');
    expect_same('mistake_event', $payload['id'] ?? null, 'Payload id matches deleted event');

    // Verify tournament is deleted
    $tournStmt = $pdo->prepare("SELECT COUNT(*) FROM tournaments WHERE id = :id");
    $tournStmt->execute([':id' => 'mistake_event']);
    expect_same(0, (int)$tournStmt->fetchColumn(), 'Tournament mistake_event row is deleted');

    // Verify scheduled and in_progress matches are deleted
    $matchStmt = $pdo->prepare("SELECT COUNT(*) FROM tournament_matches WHERE tournament_id = :tid");
    $matchStmt->execute([':tid' => 'mistake_event']);
    expect_same(0, (int)$matchStmt->fetchColumn(), 'Matches of mistake_event are deleted');
}

function test_delete_current_empty_event_falls_back_current_event_id(PDO $pdo): void
{
    migrate($pdo);
    $superAdmin = user_for_role('super_admin');

    // Setup base tournament
    save_tournament($pdo, $superAdmin, ['intent' => 'schedule-update', 'tournament' => [
        'id' => 'open_play', 'name' => 'Open Play', 'courts' => 2, 'matches' => [],
    ]]);
    set_current_event_id($pdo, 'open_play');

    // Start a new event, which becomes current
    [, $newEvent] = start_new_event($pdo, $superAdmin, ['name' => 'Transient Event', 'courts' => 2]);
    $transientId = $newEvent['id'];
    expect_same($transientId, current_event_id($pdo), 'Transient Event is current');

    // Delete the current empty event
    [$status, $payload] = delete_event($pdo, $superAdmin, ['eventId' => $transientId]);
    expect_same(200, $status, 'Deletion returns 200');
    expect_same('open_play', current_event_id($pdo), 'current_event_id falls back to open_play');
    expect_same('open_play', $payload['currentEventId'] ?? null, 'Payload reports new currentEventId');
}

run_db_tests([
    'test_roles_refused_match_correction',
    'test_super_admin_corrects_finished_match_in_past_event',
    'test_match_correction_guardrails',
    'test_roles_refused_event_deletion',
    'test_delete_event_with_finished_matches_is_refused',
    'test_super_admin_deletes_empty_event_and_cleans_up',
    'test_delete_current_empty_event_falls_back_current_event_id',
]);
