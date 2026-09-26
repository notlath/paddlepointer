<?php
declare(strict_types=1);

// Qlik reload trigger test, no Qlik call made:
//   php tests/qlik_reload_trigger_test.php

require_once __DIR__ . '/test_db.php';
require_once __DIR__ . '/../api/qlik/reload_trigger.php';
require_once __DIR__ . '/../api/tournaments.php';

function with_trigger_config(string $url, string $token, callable $test): void
{
    putenv("QLIK_RELOAD_TRIGGER_URL=$url");
    putenv("QLIK_RELOAD_TRIGGER_TOKEN=$token");
    try {
        $test();
    } finally {
        putenv('QLIK_RELOAD_TRIGGER_URL');
        putenv('QLIK_RELOAD_TRIGGER_TOKEN');
    }
}

function test_a_finished_game_triggers_one_reload_with_the_execution_token(PDO $pdo): void
{
    with_trigger_config('https://qlik.test/execute', 'secret-token', function (): void {
        $calls = [];
        $sent = request_qlik_reload(function (string $url, string $token) use (&$calls): int {
            $calls[] = [$url, $token];
            return 200;
        });
        expect_same([true, [['https://qlik.test/execute', 'secret-token']]], [$sent, $calls], 'One call to the trigger URL with the execution token');
    });
}

// The execute endpoint waits for the whole reload (~7 s) but the run carries on after the
// caller hangs up, so a timeout means "sent", not "failed".
function test_timing_out_while_qlik_reloads_still_counts_as_sent(PDO $pdo): void
{
    with_trigger_config('https://qlik.test/execute', 'secret-token', function (): void {
        expect_same(true, request_qlik_reload(fn (): int => QLIK_TRIGGER_TIMED_OUT), 'A timeout after sending is a sent trigger');
    });
}

function test_a_refused_or_unreachable_trigger_reports_false_without_throwing(PDO $pdo): void
{
    with_trigger_config('https://qlik.test/execute', 'secret-token', function (): void {
        $log = ini_set('error_log', PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null');
        try {
            expect_same(false, request_qlik_reload(fn (): int => 400), 'Qlik refusing the trigger is reported as not sent');
            expect_same(false, request_qlik_reload(fn (): int => 0), 'An unreachable Qlik is reported as not sent');
        } finally {
            ini_set('error_log', (string)$log);
        }
    });
}

function test_nothing_is_called_when_the_trigger_is_not_configured(PDO $pdo): void
{
    with_trigger_config('', '', function (): void {
        $called = false;
        $sent = request_qlik_reload(function () use (&$called): int {
            $called = true;
            return 200;
        });
        expect_same([false, false], [$sent, $called], 'An unconfigured environment (tests, CI) never calls Qlik');
    });
}

// Writes only mark a reload pending; the cron-run command fires it. Nothing goes out in a request.
function test_only_successful_writes_mark_a_reload_pending(PDO $pdo): void
{
    migrate($pdo);
    with_trigger_config('https://qlik.test/execute', 'secret-token', function () use ($pdo): void {
        $count = 0;
        $post = function () use (&$count): int {
            $count++;
            return 200;
        };
        foreach ([400, 401, 403, 409, 500] as $status) {
            reload_qlik_after_response($status, $pdo);
        }
        expect_same(false, fire_pending_qlik_reload($pdo, $post), 'Failed writes leave nothing pending');
        reload_qlik_after_response(201, $pdo);
        expect_same([true, 1], [fire_pending_qlik_reload($pdo, $post), $count], 'A successful write is pending until the command runs');
    });
}

function test_a_burst_of_writes_costs_one_reload_and_clears_the_mark(PDO $pdo): void
{
    migrate($pdo);
    with_trigger_config('https://qlik.test/execute', 'secret-token', function () use ($pdo): void {
        $count = 0;
        $post = function () use (&$count): int {
            $count++;
            return 200;
        };
        for ($i = 0; $i < 8; $i++) {
            reload_qlik_after_response(200, $pdo);
        }
        expect_same([true, false, 1], [fire_pending_qlik_reload($pdo, $post), fire_pending_qlik_reload($pdo, $post), $count], 'Eight writes fire once, then nothing is pending');
    });
}

function test_a_write_landing_while_firing_stays_pending(PDO $pdo): void
{
    migrate($pdo);
    with_trigger_config('https://qlik.test/execute', 'secret-token', function () use ($pdo): void {
        reload_qlik_after_response(200, $pdo);
        $count = 0;
        $post = function () use (&$count, $pdo): int {
            $count++;
            reload_qlik_after_response(200, $pdo);
            return 200;
        };
        fire_pending_qlik_reload($pdo, $post);
        expect_same([true, 2], [fire_pending_qlik_reload($pdo, $post), $count], 'The write made during the first run is fired by the next');
    });
}

function test_a_failed_trigger_stays_pending_for_the_next_run(PDO $pdo): void
{
    migrate($pdo);
    with_trigger_config('https://qlik.test/execute', 'secret-token', function () use ($pdo): void {
        reload_qlik_after_response(200, $pdo);
        $log = ini_set('error_log', PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null');
        try {
            expect_same(false, fire_pending_qlik_reload($pdo, fn (): int => 500), 'A refused trigger reports not fired');
        } finally {
            ini_set('error_log', (string)$log);
        }
        expect_same(true, fire_pending_qlik_reload($pdo, fn (): int => 200), 'The retry fires it');
    });
}

// save-tournament-match.php reloads Qlik only for complete-match: score-sync arrives on every
// Rally and must never start a reload.
function test_only_completing_a_match_is_a_reload_worthy_update(PDO $pdo): void
{
    expect_same(
        ['complete-match', 'complete-match', 'score-sync', 'score-sync', 'start-match'],
        [
            match_update_intent(['intent' => 'complete-match', 'match' => []]),
            match_update_intent(['match' => ['intent' => 'complete-match']]),
            match_update_intent(['match' => ['tournamentId' => 't']]),
            match_update_intent(['intent' => 'made-up', 'match' => 'not an array']),
            match_update_intent(['matchUpdate' => ['intent' => 'start-match']]),
        ],
        'Intent is read from the top level or the update, and anything unknown is a score-sync'
    );
}

run_db_tests([
    'test_only_completing_a_match_is_a_reload_worthy_update',
    'test_a_finished_game_triggers_one_reload_with_the_execution_token',
    'test_timing_out_while_qlik_reloads_still_counts_as_sent',
    'test_a_refused_or_unreachable_trigger_reports_false_without_throwing',
    'test_nothing_is_called_when_the_trigger_is_not_configured',
    'test_only_successful_writes_mark_a_reload_pending',
    'test_a_burst_of_writes_costs_one_reload_and_clears_the_mark',
    'test_a_write_landing_while_firing_stays_pending',
    'test_a_failed_trigger_stays_pending_for_the_next_run',
]);
