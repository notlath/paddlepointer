<?php
declare(strict_types=1);

// Qlik events endpoint test, no web server needed:
//   php tests/qlik_events_test.php
// Database setup: see tests/test_db.php.

require_once __DIR__ . '/test_db.php';
require_once __DIR__ . '/../api/qlik/events.php';
require_once __DIR__ . '/../api/tournaments.php';

const QLIK_TEST_KEY = 'test-analytics-key';
const SUPER_ADMIN = ['id' => 999, 'username' => 'super', 'display_name' => 'Super', 'role' => 'super_admin'];

function seed_event(PDO $pdo, string $id, string $name, array $matches): void
{
    save_tournament($pdo, SUPER_ADMIN, ['intent' => 'schedule-update', 'tournament' => [
        'id' => $id,
        'name' => $name,
        'courts' => 2,
        'matches' => $matches,
    ]]);
}

function test_missing_or_wrong_key_is_refused(PDO $pdo): void
{
    migrate($pdo);
    putenv('ANALYTICS_KEY=' . QLIK_TEST_KEY);

    [$status, $payload] = read_qlik_events($pdo, '');
    expect_same([401, false], [$status, $payload['ok']], 'A missing key is refused');

    [$status, $payload] = read_qlik_events($pdo, 'wrong-key');
    expect_same([401, false], [$status, $payload['ok']], 'A wrong key is refused');
}

function test_unknown_event_is_not_found(PDO $pdo): void
{
    migrate($pdo);
    putenv('ANALYTICS_KEY=' . QLIK_TEST_KEY);

    [$status, $payload] = read_qlik_events($pdo, QLIK_TEST_KEY, ['event' => 'nope']);
    expect_same([404, false], [$status, $payload['ok']], 'An unknown Event returns 404');
}

function test_all_events_lists_every_event_ever(PDO $pdo): void
{
    migrate($pdo);
    putenv('ANALYTICS_KEY=' . QLIK_TEST_KEY);

    // open_play: one finished match, so it has an Event window.
    seed_event($pdo, 'open_play', 'Open Play', [
        ['id' => 'm1', 'status' => 'completed', 'scoreA' => '11', 'scoreB' => '4', 'winner' => 'A',
            'startedAt' => '2026-09-13T09:00:00Z', 'completedAt' => '2026-09-13T09:20:00Z'],
    ]);
    // summer_bash: no matches at all yet, so its Event window is null.
    seed_event($pdo, 'summer_bash', 'Summer Bash', []);

    [$status, $payload] = read_qlik_events($pdo, QLIK_TEST_KEY);
    expect_same([200, true], [$status, $payload['ok']], 'The all-Events list succeeds');
    expect_same(2, count($payload['rows']), 'Every Event that has ever existed is returned');

    $byId = [];
    foreach ($payload['rows'] as $row) {
        $byId[$row['id']] = $row;
    }

    expect_same(
        ['Open Play', 2, 1, true, ['start' => '2026-09-13T09:00:00Z', 'end' => '2026-09-13T09:20:00Z']],
        [$byId['open_play']['name'], $byId['open_play']['courts'], $byId['open_play']['matchCount'], $byId['open_play']['isCurrent'], $byId['open_play']['eventWindow']],
        'open_play is reported as current with its match window'
    );
    expect_same(
        ['Summer Bash', 0, false, null],
        [$byId['summer_bash']['name'], $byId['summer_bash']['matchCount'], $byId['summer_bash']['isCurrent'], $byId['summer_bash']['eventWindow']],
        'An Event with no Matches yet has a null Event window and is not current'
    );
}

function test_single_event_filter_returns_just_that_row(PDO $pdo): void
{
    migrate($pdo);
    putenv('ANALYTICS_KEY=' . QLIK_TEST_KEY);

    seed_event($pdo, 'open_play', 'Open Play', []);
    seed_event($pdo, 'summer_bash', 'Summer Bash', []);

    [$status, $payload] = read_qlik_events($pdo, QLIK_TEST_KEY, ['event' => 'summer_bash']);
    expect_same(200, $status, 'A known Event filter succeeds');
    expect_same(1, count($payload['rows']), 'Only the filtered Event is returned');
    expect_same('summer_bash', $payload['rows'][0]['id'], 'The returned row matches the filter');
}

function test_completed_count_reflects_finished_matches_only(PDO $pdo): void
{
    migrate($pdo);
    putenv('ANALYTICS_KEY=' . QLIK_TEST_KEY);

    seed_event($pdo, 'open_play', 'Open Play', [
        ['id' => 'm1', 'status' => 'completed', 'scoreA' => '11', 'scoreB' => '4', 'winner' => 'A'],
        ['id' => 'm2', 'status' => 'completed', 'scoreA' => '11', 'scoreB' => '9', 'winner' => 'A'],
        ['id' => 'm3', 'status' => 'scheduled'],
    ]);

    [, $payload] = read_qlik_events($pdo, QLIK_TEST_KEY, ['event' => 'open_play']);
    expect_same([3, 2], [$payload['rows'][0]['matchCount'], $payload['rows'][0]['completedCount']], 'completedCount counts only finished Matches, matchCount counts every Match');
}

function test_is_current_follows_the_stored_current_event(PDO $pdo): void
{
    migrate($pdo);
    putenv('ANALYTICS_KEY=' . QLIK_TEST_KEY);

    seed_event($pdo, 'open_play', 'Open Play', []);
    seed_event($pdo, 'summer_bash', 'Summer Bash', []);

    $pdo->prepare("UPDATE app_settings SET setting_value = :value WHERE setting_key = 'current_event_id'")
        ->execute([':value' => 'summer_bash']);

    [, $payload] = read_qlik_events($pdo, QLIK_TEST_KEY);
    $byId = [];
    foreach ($payload['rows'] as $row) {
        $byId[$row['id']] = $row['isCurrent'];
    }
    expect_same(
        ['open_play' => false, 'summer_bash' => true],
        $byId,
        'isCurrent follows the stored Current Event, not a hardcoded open_play'
    );
}

function test_key_in_query_string_is_ignored(): void
{
    $_GET['key'] = QLIK_TEST_KEY;
    $_GET['X-Analytics-Key'] = QLIK_TEST_KEY;
    expect_same('', analytics_key_from_request(), 'A key sent only in the query string is never read');
    unset($_GET['key'], $_GET['X-Analytics-Key']);
}

test_key_in_query_string_is_ignored();
echo "PASS test_key_in_query_string_is_ignored\n";

// A server whose environment never set the key refuses every request; nothing committed can unlock it.
function test_unset_key_refuses_everything(): void
{
    putenv('ANALYTICS_KEY');
    foreach (['', 'hellothisisnotarealkey'] as $provided) {
        expect_same(401, analytics_key_conflict($provided)[0] ?? null, "With no key configured, '$provided' is refused");
    }
}

test_unset_key_refuses_everything();
echo "PASS test_unset_key_refuses_everything\n";

run_db_tests([
    'test_missing_or_wrong_key_is_refused',
    'test_unknown_event_is_not_found',
    'test_all_events_lists_every_event_ever',
    'test_single_event_filter_returns_just_that_row',
    'test_completed_count_reflects_finished_matches_only',
    'test_is_current_follows_the_stored_current_event',
]);
