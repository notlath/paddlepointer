<?php
declare(strict_types=1);

// User accounts module test (list, profile, create, update, delete users), no web server needed:
//   php tests/accounts_test.php
// Database setup: see tests/test_db.php.

require_once __DIR__ . '/test_db.php';
require_once __DIR__ . '/../api/accounts.php';

// Seeds one account per role and returns them as signed-in user rows, keyed by role.
function seed_accounts(PDO $pdo): array
{
    migrate($pdo);
    $pdo->prepare("UPDATE users SET password_hash = :hash WHERE username = 'superadmin_ac'")
        ->execute([':hash' => password_hash('master1', PASSWORD_DEFAULT)]);
    $insert = $pdo->prepare(
        "INSERT INTO users (username, display_name, role, password_hash, is_active)
         VALUES (:username, :display_name, :role, :password_hash, 1)"
    );
    foreach (['admin' => password_hash('secret1', PASSWORD_DEFAULT), 'player' => '', 'visitor' => ''] as $role => $hash) {
        $insert->execute([':username' => "{$role}_one", ':display_name' => ucfirst($role), ':role' => $role, ':password_hash' => $hash]);
    }
    $accounts = [];
    foreach ($pdo->query("SELECT * FROM users")->fetchAll() as $user) {
        $accounts[$user['role']] = $user;
    }
    return $accounts;
}

function stored_account(PDO $pdo, string $username): array
{
    $statement = $pdo->prepare("SELECT * FROM users WHERE username = :username");
    $statement->execute([':username' => $username]);
    return $statement->fetch() ?: [];
}

function expect_refused(array $result, int $status, string $error, string $label): void
{
    expect_same([$status, $error], [$result[0], $result[1]['error'] ?? null], $label);
}

function test_password_rule_by_role_and_action(PDO $pdo): void
{
    $accounts = seed_accounts($pdo);
    $superAdmin = $accounts['super_admin'];
    $tooShort = 'Password must be at least 6 characters';
    $noPassword = "Players and Visitors don't use a password";

    // Create
    foreach (['' => 'no', 'abc12' => 'a 5-character'] as $password => $label) {
        expect_refused(create_account($pdo, $superAdmin, ['username' => 'new_admin', 'role' => 'admin', 'password' => $password]), 400, $tooShort, "Creating an Admin with $label password is refused");
    }
    [$status] = create_account($pdo, $superAdmin, ['username' => 'new_admin', 'role' => 'admin', 'password' => 'abc123']);
    expect_same([201, true], [$status, password_verify('abc123', stored_account($pdo, 'new_admin')['password_hash'])], 'An Admin is created with a 6-character password');
    foreach (['player', 'visitor'] as $role) {
        expect_refused(create_account($pdo, $superAdmin, ['username' => "new_$role", 'role' => $role, 'password' => 'secret1']), 400, $noPassword, "Creating a $role with a password is refused");
        [$status] = create_account($pdo, $superAdmin, ['username' => "new_$role", 'role' => $role, 'password' => '']);
        expect_same([201, ''], [$status, stored_account($pdo, "new_$role")['password_hash']], "A $role is created with no password stored");
    }

    // Profile
    foreach (['admin', 'super_admin'] as $role) {
        $username = $accounts[$role]['username'];
        $hashBefore = stored_account($pdo, $username)['password_hash'];
        expect_refused(update_profile($pdo, $accounts[$role], ['displayName' => 'Renamed', 'password' => 'abc12']), 400, $tooShort, "A $role's short profile password is refused");
        [$status] = update_profile($pdo, $accounts[$role], ['displayName' => 'Renamed']);
        expect_same([200, $hashBefore], [$status, stored_account($pdo, $username)['password_hash']], "A $role's profile save without a password keeps it");
        [$status] = update_profile($pdo, $accounts[$role], ['displayName' => 'Renamed', 'password' => 'changed1']);
        expect_same([200, true], [$status, password_verify('changed1', stored_account($pdo, $username)['password_hash'])], "A $role can change their password on the profile");
    }
    foreach (['player', 'visitor'] as $role) {
        $username = $accounts[$role]['username'];
        expect_refused(update_profile($pdo, $accounts[$role], ['displayName' => 'Renamed', 'password' => 'secret1']), 400, $noPassword, "A $role's profile password is refused");
        expect_same([ucfirst($role), ''], [stored_account($pdo, $username)['display_name'], stored_account($pdo, $username)['password_hash']], "The refused $role profile save changes nothing");
    }
    // A Player left with a stored password by older code loses it on their next profile save.
    $pdo->prepare("UPDATE users SET password_hash = :hash WHERE username = 'player_one'")->execute([':hash' => password_hash('legacy1', PASSWORD_DEFAULT)]);
    [$status] = update_profile($pdo, $accounts['player'], ['displayName' => 'Player', 'password' => '']);
    expect_same([200, ''], [$status, stored_account($pdo, 'player_one')['password_hash']], "A Player's profile save clears a password stored by older code");

    // Update
    $update = static fn(array $target, array $changes): array => update_account($pdo, $superAdmin, $changes + [
        'id' => (int)$target['id'], 'displayName' => $target['display_name'], 'role' => $target['role'], 'isActive' => true,
    ]);
    foreach (['admin', 'super_admin'] as $role) {
        expect_refused($update(stored_account($pdo, $accounts[$role]['username']), ['password' => 'abc12']), 400, $tooShort, "Updating a $role with a short password is refused");
    }
    foreach (['player', 'visitor'] as $role) {
        expect_refused($update($accounts[$role], ['password' => 'secret1']), 400, $noPassword, "Updating a $role with a password is refused");
        expect_refused($update($accounts[$role], ['role' => 'admin']), 400, $tooShort, "Promoting a $role to Admin without a password is refused");
    }
    expect_same('player', stored_account($pdo, 'player_one')['role'], 'The refused promotion changes nothing');
    [$status] = $update($accounts['player'], ['role' => 'admin', 'password' => 'promote1']);
    expect_same([200, true], [$status, password_verify('promote1', stored_account($pdo, 'player_one')['password_hash'])], 'Promoting a Player to Admin with a password stores it');
    [$status] = $update(stored_account($pdo, 'admin_one'), ['role' => 'player']);
    expect_same([200, 'player', ''], [$status, stored_account($pdo, 'admin_one')['role'], stored_account($pdo, 'admin_one')['password_hash']], 'Demoting an Admin to Player clears the stored password');
    [$status] = $update(stored_account($pdo, 'new_admin'), ['displayName' => 'Still Admin']);
    expect_same([200, true], [$status, password_verify('abc123', stored_account($pdo, 'new_admin')['password_hash'])], 'Updating an Admin without a password keeps it');
}

function test_super_admin_is_protected(PDO $pdo): void
{
    $accounts = seed_accounts($pdo);
    $superAdmin = $accounts['super_admin'];
    $self = ['id' => (int)$superAdmin['id'], 'displayName' => 'Master AC'];

    [$status, $payload] = update_account($pdo, $superAdmin, $self + ['role' => 'admin', 'isActive' => true]);
    expect_same([200, 'super_admin'], [$status, $payload['user']['role'] ?? null], 'The Super Admin cannot be demoted');

    expect_refused(update_account($pdo, $superAdmin, $self + ['role' => 'super_admin', 'isActive' => false]), 400, 'You cannot deactivate your own Super Admin account', 'The Super Admin cannot deactivate their own account');
    expect_same(1, (int)stored_account($pdo, 'superadmin_ac')['is_active'], 'The Super Admin stays active');

    expect_refused(delete_account($pdo, $superAdmin, ['id' => (int)$superAdmin['id']]), 400, 'The Super Admin account cannot be deleted', 'The Super Admin cannot be deleted');

    $pdo->prepare("INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES ('" . str_repeat('a', 64) . "', :id, DATE_ADD(NOW(), INTERVAL 1 DAY))")
        ->execute([':id' => (int)$accounts['player']['id']]);
    expect_same([200, ['ok' => true, 'id' => (int)$accounts['player']['id']]], delete_account($pdo, $superAdmin, ['id' => (int)$accounts['player']['id']]), 'Other accounts can be deleted');
    expect_same([[], 0], [stored_account($pdo, 'player_one'), (int)$pdo->query("SELECT COUNT(*) FROM user_sessions")->fetchColumn()], 'Deleting removes the account and its sessions');
}

function test_duplicate_username_is_refused(PDO $pdo): void
{
    $accounts = seed_accounts($pdo);

    expect_refused(create_account($pdo, $accounts['super_admin'], ['username' => ' Player_One ', 'role' => 'player']), 409, 'Username is already taken', 'A duplicate username is refused');
    expect_same(1, (int)$pdo->query("SELECT COUNT(*) FROM users WHERE username = 'player_one'")->fetchColumn(), 'No second account is created');
}

// A Player login creates or links its Player (ADR 0005), and never claims a Player another account
// already has.
function test_creating_a_player_login_links_its_player(PDO $pdo): void
{
    $accounts = seed_accounts($pdo);
    $superAdmin = $accounts['super_admin'];

    [$status, $payload] = create_account($pdo, $superAdmin, ['username' => 'jomar', 'displayName' => 'Jomar Ebonite', 'role' => 'player']);
    expect_same(201, $status, 'The Player login is created');
    $player = find_or_create_player($pdo, 'Jomar Ebonite');
    expect_same((int)$player['id'], (int)stored_account($pdo, 'jomar')['player_id'], 'The new account is linked to a Player of the same name');

    // A second account typed with the same name (different case/spacing) does not steal the Player.
    [$status] = create_account($pdo, $superAdmin, ['username' => 'jomar2', 'displayName' => '  jomar   ebonite  ', 'role' => 'player']);
    expect_same(201, $status, 'A second account with the same name is still created');
    expect_same(null, stored_account($pdo, 'jomar2')['player_id'], 'The second account does not claim an already-linked Player');

    // A non-Player account creates no Player.
    [$status] = create_account($pdo, $superAdmin, ['username' => 'newer_admin', 'displayName' => 'Newer Admin', 'role' => 'admin', 'password' => 'secret1']);
    expect_same(201, $status, 'An Admin account is created');
    expect_same(null, stored_account($pdo, 'newer_admin')['player_id'], 'A non-Player account has no linked Player');
}

// Promoting an existing account to Player links its Player too, the same as creating one does —
// otherwise a promoted account would see none of its own History (games.php's history_visibility_where).
function test_promoting_an_account_to_player_links_its_player(PDO $pdo): void
{
    $accounts = seed_accounts($pdo);
    $superAdmin = $accounts['super_admin'];
    $visitor = $accounts['visitor'];

    [$status, $payload] = update_account($pdo, $superAdmin, [
        'id' => (int)$visitor['id'], 'displayName' => 'Vicente Reyes', 'role' => 'player', 'isActive' => true,
    ]);
    expect_same(200, $status, 'The account is promoted to Player');
    $playerId = stored_account($pdo, $visitor['username'])['player_id'];
    expect_same((int)find_or_create_player($pdo, 'Vicente Reyes')['id'], (int)$playerId, 'Promoting to Player links a Player of the same name');

    // Editing the now-linked account again, under a different name, does not steal a second Player
    // or drop the existing link (ADR 0005: the account keeps its Player across renames).
    [$status] = update_account($pdo, $superAdmin, [
        'id' => (int)$visitor['id'], 'displayName' => 'Vince R.', 'role' => 'player', 'isActive' => true,
    ]);
    expect_same(200, $status, 'The account is saved again');
    expect_same($playerId, stored_account($pdo, $visitor['username'])['player_id'], 'The existing link survives a further rename');
}

function test_only_the_super_admin_manages_users(PDO $pdo): void
{
    $accounts = seed_accounts($pdo);
    $target = ['id' => (int)$accounts['visitor']['id'], 'displayName' => 'Changed', 'role' => 'visitor', 'isActive' => false];
    $actions = [
        'list' => static fn(?array $user) => list_users($pdo, $user),
        'create' => static fn(?array $user) => create_account($pdo, $user, ['username' => 'sneaky', 'role' => 'player']),
        'update' => static fn(?array $user) => update_account($pdo, $user, $target),
        'delete' => static fn(?array $user) => delete_account($pdo, $user, ['id' => (int)$accounts['visitor']['id']]),
    ];

    foreach ($actions as $name => $action) {
        expect_refused($action(null), 401, 'Login required', "Signed-out $name is refused");
        foreach (['admin', 'player', 'visitor'] as $role) {
            expect_refused($action($accounts[$role]), 403, 'Super Admin access required', "An $role may not $name users");
        }
    }
    expect_same([false, 'Visitor', 1], [
        (bool)stored_account($pdo, 'sneaky'),
        stored_account($pdo, 'visitor_one')['display_name'],
        (int)stored_account($pdo, 'visitor_one')['is_active'],
    ], 'Refused actions change nothing');

    [$status, $payload] = list_users($pdo, $accounts['super_admin']);
    expect_same([200, ['superadmin_ac', 'admin_one', 'player_one', 'visitor_one']], [$status, array_column($payload['users'], 'username')], 'The Super Admin lists users, Super Admin first');
    expect_refused(update_profile($pdo, null, ['displayName' => 'Nobody']), 401, 'Login required', 'Editing a profile needs a signed-in user');
}

// A Super Admin resets a password (or demotes an Admin, which clears it) when an account may be
// compromised, so that account's open sessions end; an edit that keeps the password keeps them.
function test_changing_an_accounts_password_ends_its_sessions(PDO $pdo): void
{
    $accounts = seed_accounts($pdo);
    $adminId = (int)$accounts['admin']['id'];
    $countSessions = static fn(): int => (int)$pdo->query("SELECT COUNT(*) FROM user_sessions WHERE user_id = $adminId")->fetchColumn();
    $pdo->exec("INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES (REPEAT('b', 64), $adminId, DATE_ADD(NOW(), INTERVAL 1 DAY))");

    $edit = ['id' => $adminId, 'displayName' => 'Renamed', 'role' => 'admin', 'isActive' => true];
    [$status] = update_account($pdo, $accounts['super_admin'], $edit);
    expect_same([200, 1], [$status, $countSessions()], 'Renaming keeps the sessions');

    [$status] = update_account($pdo, $accounts['super_admin'], $edit + ['password' => 'fresh-secret']);
    expect_same([200, 0], [$status, $countSessions()], 'A new password ends the sessions');

    $pdo->exec("INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES (REPEAT('c', 64), $adminId, DATE_ADD(NOW(), INTERVAL 1 DAY))");
    [$status] = update_account($pdo, $accounts['super_admin'], ['role' => 'player'] + $edit);
    expect_same([200, 0], [$status, $countSessions()], 'Demoting to Player clears the password and ends the sessions');
}

run_db_tests([
    'test_changing_an_accounts_password_ends_its_sessions',
    'test_password_rule_by_role_and_action',
    'test_super_admin_is_protected',
    'test_duplicate_username_is_refused',
    'test_creating_a_player_login_links_its_player',
    'test_promoting_an_account_to_player_links_its_player',
    'test_only_the_super_admin_manages_users',
]);
