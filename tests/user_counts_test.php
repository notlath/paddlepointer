<?php
declare(strict_types=1);

require_once __DIR__ . '/test_db.php';
require_once __DIR__ . '/../api/accounts.php';

function seed_users_for_counts(PDO $pdo): array
{
    migrate($pdo);
    $pdo->exec("DELETE FROM users WHERE username != 'superadmin_ac'");

    $insert = $pdo->prepare(
        "INSERT INTO users (username, display_name, role, password_hash, is_active)
         VALUES (:username, :display_name, :role, :password_hash, :is_active)"
    );

    // 1 Super Admin (seeded), add 2 active admins, 1 inactive admin, 3 active players, 2 active visitors
    $insert->execute([':username' => 'admin_1', ':display_name' => 'Admin 1', ':role' => 'admin', ':password_hash' => 'x', ':is_active' => 1]);
    $insert->execute([':username' => 'admin_2', ':display_name' => 'Admin 2', ':role' => 'admin', ':password_hash' => 'x', ':is_active' => 1]);
    $insert->execute([':username' => 'admin_off', ':display_name' => 'Admin Off', ':role' => 'admin', ':password_hash' => 'x', ':is_active' => 0]);

    $insert->execute([':username' => 'player_1', ':display_name' => 'Player 1', ':role' => 'player', ':password_hash' => '', ':is_active' => 1]);
    $insert->execute([':username' => 'player_2', ':display_name' => 'Player 2', ':role' => 'player', ':password_hash' => '', ':is_active' => 1]);
    $insert->execute([':username' => 'player_3', ':display_name' => 'Player 3', ':role' => 'player', ':password_hash' => '', ':is_active' => 1]);

    $insert->execute([':username' => 'vis_1', ':display_name' => 'Visitor 1', ':role' => 'visitor', ':password_hash' => '', ':is_active' => 1]);
    $insert->execute([':username' => 'vis_2', ':display_name' => 'Visitor 2', ':role' => 'visitor', ':password_hash' => '', ':is_active' => 1]);

    $accounts = [];
    foreach ($pdo->query("SELECT * FROM users")->fetchAll() as $user) {
        $accounts[$user['username']] = $user;
    }
    return $accounts;
}

function test_signed_out_refused_user_counts(PDO $pdo): void
{
    seed_users_for_counts($pdo);
    [$status, $payload] = read_user_counts($pdo, null);
    expect_same([401, false], [$status, $payload['ok']], 'Signed out request refused with 401');
}

function test_player_and_visitor_refused_user_counts(PDO $pdo): void
{
    $users = seed_users_for_counts($pdo);
    foreach (['player_1', 'vis_1', 'admin_off'] as $key) {
        [$status, $payload] = read_user_counts($pdo, $users[$key]);
        expect_same([403, false], [$status, $payload['ok']], "User $key refused with 403");
    }
}

function test_staff_receives_accurate_user_counts(PDO $pdo): void
{
    $users = seed_users_for_counts($pdo);
    foreach (['superadmin_ac', 'admin_1'] as $key) {
        [$status, $payload] = read_user_counts($pdo, $users[$key]);
        expect_same([200, true], [$status, $payload['ok']], "Staff $key receives 200");
        $counts = $payload['counts'];
        expect_same(1, $counts['super_admin'], 'Super Admin count is 1');
        expect_same(2, $counts['admin'], 'Active Admin count is 2');
        expect_same(3, $counts['player'], 'Active Player count is 3');
        expect_same(2, $counts['visitor'], 'Active Visitor count is 2');
        expect_same(8, $counts['totalActive'], 'Total active users is 8 (1 SA + 2 A + 3 P + 2 V)');
        expect_same(1, $counts['totalInactive'], 'Total inactive users is 1');
    }
}

run_db_tests([
    'test_signed_out_refused_user_counts',
    'test_player_and_visitor_refused_user_counts',
    'test_staff_receives_accurate_user_counts',
]);