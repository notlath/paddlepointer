<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/players.php';

// User accounts module: listing users, editing a profile, and creating, updating and deleting users.
// Every action goes through account_password_hash(), so they all apply the same password rule.
// Handlers return [status, payload] for the endpoint to send.

function list_users(PDO $pdo, ?array $currentUser): array
{
    if ($refusal = refuse_unless_super_admin($currentUser)) {
        return $refusal;
    }

    $statement = $pdo->query(
        "SELECT id, username, display_name, role, is_active, created_at, updated_at
         FROM users
         ORDER BY FIELD(role, 'super_admin', 'admin', 'player', 'visitor'), display_name ASC, username ASC"
    );
    return [200, ['ok' => true, 'users' => array_map('public_user', $statement->fetchAll())]];
}

// Active accounts per role for the staff dashboard, plus how many are deactivated.
function read_user_counts(PDO $pdo, ?array $currentUser): array
{
    if ($currentUser === null) {
        return [401, ['ok' => false, 'error' => 'Login required']];
    }
    if (!can($currentUser, 'view_user_counts')) {
        return [403, ['ok' => false, 'error' => 'Staff access required']];
    }

    $counts = ['super_admin' => 0, 'admin' => 0, 'player' => 0, 'visitor' => 0, 'totalActive' => 0, 'totalInactive' => 0];
    foreach ($pdo->query("SELECT role, is_active, COUNT(*) AS n FROM users GROUP BY role, is_active") as $row) {
        $n = (int)$row['n'];
        if ((int)$row['is_active'] === 1) {
            if (isset($counts[$row['role']])) {
                $counts[$row['role']] += $n;
            }
            $counts['totalActive'] += $n;
        } else {
            $counts['totalInactive'] += $n;
        }
    }
    return [200, ['ok' => true, 'counts' => $counts]];
}

// Lets any signed-in user change their own display name, and staff their own password.
function update_profile(PDO $pdo, ?array $currentUser, array $data): array
{
    if (!can($currentUser, 'update_profile')) {
        return [401, ['ok' => false, 'error' => 'Login required']];
    }

    $displayName = clean_display_name((string)($data['displayName'] ?? $currentUser['display_name']));
    if ($displayName === '') {
        return [400, ['ok' => false, 'error' => 'Display name is required']];
    }

    [$error, $passwordHash] = account_password_hash((string)$currentUser['role'], (string)($data['password'] ?? ''), $currentUser);
    if ($error !== null) {
        return [400, ['ok' => false, 'error' => $error]];
    }

    $statement = $pdo->prepare("UPDATE users SET display_name = :display_name, password_hash = :password_hash WHERE id = :id");
    $statement->execute([
        ':display_name' => $displayName,
        ':password_hash' => $passwordHash,
        ':id' => (int)$currentUser['id'],
    ]);

    return [200, ['ok' => true, 'user' => public_user(find_user_by_id($pdo, (int)$currentUser['id']))]];
}

function create_account(PDO $pdo, ?array $currentUser, array $data): array
{
    if ($refusal = refuse_unless_super_admin($currentUser)) {
        return $refusal;
    }

    [$status, $result] = add_user(
        $pdo,
        (string)($data['username'] ?? ''),
        (string)($data['displayName'] ?? ''),
        (string)($data['password'] ?? ''),
        (string)($data['role'] ?? 'player')
    );
    return $status === 201 ? [201, ['ok' => true, 'user' => public_user($result)]] : [$status, $result];
}

// The Super Admin keeps their role and can't deactivate themselves.
function update_account(PDO $pdo, ?array $currentUser, array $data): array
{
    if ($refusal = refuse_unless_super_admin($currentUser)) {
        return $refusal;
    }

    $userId = (int)($data['id'] ?? 0);
    if ($userId <= 0) {
        return [400, ['ok' => false, 'error' => 'User id is required']];
    }

    $displayName = clean_display_name((string)($data['displayName'] ?? ''));
    $existing = find_user_by_id($pdo, $userId);
    if (!$existing) {
        return [404, ['ok' => false, 'error' => 'User not found']];
    }

    $role = normalize_role((string)($data['role'] ?? 'player'));
    if (is_super_admin($existing)) {
        $role = 'super_admin';
    }
    $isActive = !empty($data['isActive']) ? 1 : 0;

    if ($displayName === '') {
        return [400, ['ok' => false, 'error' => 'Display name is required']];
    }
    if ($userId === (int)$currentUser['id'] && $isActive === 0) {
        return [400, ['ok' => false, 'error' => 'You cannot deactivate your own Super Admin account']];
    }

    [$error, $passwordHash] = account_password_hash($role, (string)($data['password'] ?? ''), $existing);
    if ($error !== null) {
        return [400, ['ok' => false, 'error' => $error]];
    }

    $statement = $pdo->prepare(
        "UPDATE users
         SET display_name = :display_name,
             role = :role,
             is_active = :is_active,
             password_hash = :password_hash
         WHERE id = :id"
    );
    $statement->execute([
        ':display_name' => $displayName,
        ':role' => $role,
        ':is_active' => $isActive,
        ':password_hash' => $passwordHash,
        ':id' => $userId,
    ]);

    // A reset (or cleared) password signs the account out everywhere.
    if ($passwordHash !== (string)$existing['password_hash']) {
        $pdo->prepare("DELETE FROM user_sessions WHERE user_id = :user_id")->execute([':user_id' => $userId]);
    }

    // Promoting an account to Player, or editing one that predates account linking, links its Player,
    // the same as creating a Player login does. An already-linked account keeps its link regardless of
    // this rename (ADR 0005): the account's identity as a Player does not depend on its current name.
    if ($role === 'player' && empty($existing['player_id'])) {
        link_user_to_player($pdo, $userId, $displayName);
    }

    $user = find_user_by_id($pdo, $userId);
    if (!$user) {
        return [404, ['ok' => false, 'error' => 'User not found']];
    }
    return [200, ['ok' => true, 'user' => public_user($user)]];
}

// Deletes an account and its sessions. The Super Admin can't be deleted.
function delete_account(PDO $pdo, ?array $currentUser, array $data): array
{
    if ($refusal = refuse_unless_super_admin($currentUser)) {
        return $refusal;
    }

    $userId = (int)($data['id'] ?? 0);
    if ($userId <= 0) {
        return [400, ['ok' => false, 'error' => 'User id is required']];
    }

    $user = find_user_by_id($pdo, $userId);
    if (!$user) {
        return [404, ['ok' => false, 'error' => 'User not found']];
    }
    if (is_super_admin($user) || $userId === (int)$currentUser['id']) {
        return [400, ['ok' => false, 'error' => 'The Super Admin account cannot be deleted']];
    }

    $pdo->beginTransaction();
    try {
        $pdo->prepare("DELETE FROM user_sessions WHERE user_id = :user_id")->execute([':user_id' => $userId]);
        $pdo->prepare("DELETE FROM users WHERE id = :id")->execute([':id' => $userId]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }

    return [200, ['ok' => true, 'id' => $userId]];
}

// Adds an account. Returns [201, the new user row] or [status, error payload].
function add_user(PDO $pdo, string $username, string $displayName, string $password, string $role): array
{
    $username = clean_username($username);
    $displayName = clean_display_name($displayName);
    $role = normalize_role($role);

    if ($username === '' || strlen($username) < 3) {
        return [400, ['ok' => false, 'error' => 'Username must be at least 3 characters']];
    }
    if ($displayName === '') {
        $displayName = $username;
    }
    [$error, $passwordHash] = account_password_hash($role, $password, null);
    if ($error !== null) {
        return [400, ['ok' => false, 'error' => $error]];
    }
    if (find_user_by_username($pdo, $username)) {
        return [409, ['ok' => false, 'error' => 'Username is already taken']];
    }

    $statement = $pdo->prepare(
        "INSERT INTO users (username, display_name, role, password_hash, is_active)
         VALUES (:username, :display_name, :role, :password_hash, 1)"
    );
    try {
        $statement->execute([
            ':username' => $username,
            ':display_name' => $displayName,
            ':role' => $role,
            ':password_hash' => $passwordHash,
        ]);
    } catch (PDOException $error) {
        if ($error->getCode() === '23000') {
            return [409, ['ok' => false, 'error' => 'Username is already taken']];
        }
        throw $error;
    }

    $userId = (int)$pdo->lastInsertId();
    if ($role === 'player') {
        link_user_to_player($pdo, $userId, $displayName);
    }

    $user = find_user_by_id($pdo, $userId);
    if (!$user) {
        return [500, ['ok' => false, 'error' => 'User could not be created']];
    }
    return [201, $user];
}

// The password rule: Admins and Super Admins need a password of at least 6 characters;
// Players and Visitors have no password, and none is stored for them.
// An empty $password means none was submitted: staff who already had a staff role keep theirs.
// Returns [error message or null, password hash to store].
function account_password_hash(string $role, string $password, ?array $existingUser): array
{
    if (!can_have_password($role)) {
        return $password === '' ? [null, ''] : ["Players and Visitors don't use a password", null];
    }
    if ($password === '') {
        return can($existingUser, 'have_password')
            ? [null, (string)$existingUser['password_hash']]
            : ['Password must be at least 6 characters', null];
    }
    if (strlen($password) < 6) {
        return ['Password must be at least 6 characters', null];
    }
    return [null, password_hash($password, PASSWORD_DEFAULT)];
}

function refuse_unless_super_admin(?array $currentUser): ?array
{
    if (!$currentUser) {
        return [401, ['ok' => false, 'error' => 'Login required']];
    }
    if (!can($currentUser, 'manage_users')) {
        return [403, ['ok' => false, 'error' => 'Super Admin access required']];
    }
    return null;
}

function find_user_by_id(PDO $pdo, int $id): ?array
{
    $statement = $pdo->prepare("SELECT * FROM users WHERE id = :id LIMIT 1");
    $statement->execute([':id' => $id]);
    $user = $statement->fetch();
    return is_array($user) ? $user : null;
}

function find_user_by_username(PDO $pdo, string $username): ?array
{
    $statement = $pdo->prepare("SELECT * FROM users WHERE username = :username LIMIT 1");
    $statement->execute([':username' => $username]);
    $user = $statement->fetch();
    return is_array($user) ? $user : null;
}

function normalize_role(string $role): string
{
    if ($role === 'admin') {
        return 'admin';
    }
    if ($role === 'visitor') {
        return 'visitor';
    }
    return 'player';
}
