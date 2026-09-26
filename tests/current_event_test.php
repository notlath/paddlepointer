<?php
declare(strict_types=1);

// Current Event storage test, no web server needed:
//   php tests/current_event_test.php
// Database setup: see tests/test_db.php.

require_once __DIR__ . '/test_db.php';
require_once __DIR__ . '/../api/db.php';

function test_migration_seeds_open_play_as_current(PDO $pdo): void
{
    migrate($pdo);
    expect_same('open_play', current_event_id($pdo), 'A fresh database defaults its Current Event to open_play');
}

function test_current_event_id_reads_back_a_stored_value(PDO $pdo): void
{
    migrate($pdo);
    $pdo->prepare("UPDATE app_settings SET setting_value = :value WHERE setting_key = 'current_event_id'")
        ->execute([':value' => 'summer_bash']);
    expect_same('summer_bash', current_event_id($pdo), 'current_event_id() reflects a changed stored value');
}

function test_set_current_event_id_changes_the_stored_value(PDO $pdo): void
{
    migrate($pdo);
    set_current_event_id($pdo, 'fall_classic');
    expect_same('fall_classic', current_event_id($pdo), 'set_current_event_id() changes what current_event_id() returns');

    set_current_event_id($pdo, 'winter_open');
    expect_same('winter_open', current_event_id($pdo), 'set_current_event_id() overwrites a previously stored value');
}

run_db_tests([
    'test_migration_seeds_open_play_as_current',
    'test_current_event_id_reads_back_a_stored_value',
    'test_set_current_event_id_changes_the_stored_value',
]);
