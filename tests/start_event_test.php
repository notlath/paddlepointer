<?php
declare(strict_types=1);

// Super Admin starts a new Event, handler test, no web server needed:
//   php tests/start_event_test.php
// Database setup: see tests/test_db.php.

require_once __DIR__ . '/test_db.php';
require_once __DIR__ . '/../api/tournaments.php';

function user_with_role(string $role): array
{
    return ['id' => 1, 'username' => "{$role}_user", 'display_name' => ucfirst($role), 'role' => $role, 'is_active' => 1];
}

function test_super_admin_starts_a_new_event_and_it_becomes_current(PDO $pdo): void
{
    migrate($pdo);
    $superAdmin = user_with_role('super_admin');

    [$status, $payload] = start_new_event($pdo, $superAdmin, ['name' => 'Summer Bash', 'courts' => 3]);
    expect_same(200, $status, 'A Super Admin starts a new Event');
    $newId = $payload['id'] ?? null;
    expect_same(true, $newId !== null && $newId !== 'open_play', 'The new Event gets its own id');
    expect_same('Summer Bash', $payload['tournament']['name'] ?? null, 'The new Event carries the given name');
    expect_same(3, $payload['tournament']['courts'] ?? null, 'The new Event carries the given court count');
    expect_same($newId, current_event_id($pdo), 'The new Event becomes the Current Event');
    expect_same($newId, $payload['currentEventId'] ?? null, 'The reply reports the new Current Event id');
}

function test_the_previous_events_matches_are_unaffected(PDO $pdo): void
{
    migrate($pdo);
    $superAdmin = user_with_role('super_admin');
    save_tournament($pdo, $superAdmin, ['intent' => 'schedule-update', 'tournament' => [
        'id' => 'open_play', 'name' => 'Open Play', 'courts' => 2, 'matches' => [
            ['id' => 'm1', 'status' => 'completed', 'scoreA' => '11', 'scoreB' => '4', 'winner' => 'A'],
            ['id' => 'm2', 'status' => 'scheduled'],
        ],
    ]]);

    [$status, $payload] = start_new_event($pdo, $superAdmin, ['name' => 'Fall Classic', 'courts' => 4]);
    expect_same(200, $status, 'The second Event is created');
    $newId = $payload['id'];

    [, $oldRead] = read_tournament($pdo, ['id' => 'open_play']);
    expect_same(2, count($oldRead['tournament']['matches'] ?? []), "The previous Event's Match count is unchanged");
    expect_same('completed', $oldRead['tournament']['matches'][0]['status'] ?? null, "The previous Event's Match data is unchanged");

    [, $newRead] = read_tournament($pdo, ['id' => $newId]);
    expect_same(0, count($newRead['tournament']['matches'] ?? []), 'The new Event starts with no Matches');
}

function test_only_a_super_admin_may_start_a_new_event(PDO $pdo): void
{
    migrate($pdo);
    foreach (['admin', 'player', 'visitor'] as $role) {
        [$status] = start_new_event($pdo, user_with_role($role), ['name' => 'Nope', 'courts' => 2]);
        expect_same(403, $status, "A $role may not start a new Event");
    }
    [$status] = start_new_event($pdo, null, ['name' => 'Nope', 'courts' => 2]);
    expect_same(401, $status, 'A signed-out request may not start a new Event');
    expect_same('open_play', current_event_id($pdo), 'The Current Event is unchanged by refused attempts');
    expect_same(false, $pdo->query("SELECT id FROM tournaments WHERE name = 'Nope'")->fetchColumn(), 'Nothing is created by a refused attempt');
}

function test_a_new_event_requires_a_name(PDO $pdo): void
{
    migrate($pdo);
    [$status] = start_new_event($pdo, user_with_role('super_admin'), ['name' => '  ', 'courts' => 2]);
    expect_same(400, $status, 'A blank name is refused');
    expect_same('open_play', current_event_id($pdo), 'The Current Event is unchanged when the name is missing');
}

function test_duplicate_event_names_get_distinct_ids(PDO $pdo): void
{
    migrate($pdo);
    $superAdmin = user_with_role('super_admin');
    [, $first] = start_new_event($pdo, $superAdmin, ['name' => 'Weekly Mixer', 'courts' => 2]);
    [, $second] = start_new_event($pdo, $superAdmin, ['name' => 'Weekly Mixer', 'courts' => 2]);
    expect_same(true, $first['id'] !== $second['id'], 'Two Events with the same name get different ids');
    expect_same($second['id'], current_event_id($pdo), 'The most recently started Event is current');
}

run_db_tests([
    'test_super_admin_starts_a_new_event_and_it_becomes_current',
    'test_the_previous_events_matches_are_unaffected',
    'test_only_a_super_admin_may_start_a_new_event',
    'test_a_new_event_requires_a_name',
    'test_duplicate_event_names_get_distinct_ids',
]);
