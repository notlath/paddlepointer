<?php
declare(strict_types=1);

require_once __DIR__ . '/accounts.php';

const STAFF_USERNAME_FAILURE_LIMIT = 5;
const STAFF_IP_FAILURE_LIMIT = 30;
const STAFF_FAILURE_WINDOW = 900;
const VISITOR_CREATION_LIMIT = 60;
const VISITOR_CREATION_WINDOW = 3600;

// Signs in through the Admin or Player portal. Admins and Super Admins need their password;
// Players and Visitors don't. Returns [status, payload] for the endpoint to send.
function sign_in(PDO $pdo, array $data, string $ip = ''): array
{
    $username = clean_username((string)($data['username'] ?? ''));
    $password = (string)($data['password'] ?? '');
    $user = $username !== '' ? find_user_by_username($pdo, $username) : null;

    if (!$user || empty($user['is_active'])) {
        return [401, ['ok' => false, 'error' => 'Invalid username or inactive account']];
    }

    if (can($user, 'have_password')) {
        $usernameBucket = 'staff-name:' . hash('sha256', $username);
        $ipBucket = 'staff-ip:' . $ip;
        if (rate_limit_reached($pdo, $usernameBucket, STAFF_USERNAME_FAILURE_LIMIT, STAFF_FAILURE_WINDOW)
            || rate_limit_reached($pdo, $ipBucket, STAFF_IP_FAILURE_LIMIT, STAFF_FAILURE_WINDOW)) {
            return [429, ['ok' => false, 'error' => 'Too many attempts. Try again in a few minutes.']];
        }
        if (!password_verify($password, (string)$user['password_hash'])) {
            $over = hit_rate_limit($pdo, $usernameBucket, STAFF_USERNAME_FAILURE_LIMIT, STAFF_FAILURE_WINDOW);
            $over = hit_rate_limit($pdo, $ipBucket, STAFF_IP_FAILURE_LIMIT, STAFF_FAILURE_WINDOW) || $over;
            return $over ? [429, ['ok' => false, 'error' => 'Too many attempts. Try again in a few minutes.']] : [401, ['ok' => false, 'error' => 'Invalid username or password']];
        }
    }

    return [200, user_payload_with_token($pdo, $user)];
}

// Signs in through the Visitor portal by email, creating the Visitor on first use.
function visitor_sign_in(PDO $pdo, array $data, string $ip = ''): array
{
    $email = clean_username((string)($data['email'] ?? $data['username'] ?? ''));
    $displayName = clean_display_name((string)($data['displayName'] ?? ''));

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return [400, ['ok' => false, 'error' => 'Valid email is required']];
    }

    $user = find_user_by_username($pdo, $email);
    if ($user && !can($user, 'visitor_sign_in')) {
        return [409, ['ok' => false, 'error' => 'This email is already used by another account type']];
    }
    if ($user && empty($user['is_active'])) {
        return [401, ['ok' => false, 'error' => 'Visitor account is inactive']];
    }

    if (!$user) {
        if (hit_rate_limit($pdo, 'visitor-create:' . $ip, VISITOR_CREATION_LIMIT, VISITOR_CREATION_WINDOW)) {
            return [429, ['ok' => false, 'error' => 'Too many attempts. Try again in a few minutes.']];
        }
        [$status, $result] = add_user($pdo, $email, $displayName !== '' ? $displayName : $email, '', 'visitor');
        if ($status !== 201) {
            return [$status, $result];
        }
        $user = $result;
    } elseif ($displayName !== '') {
        $statement = $pdo->prepare("UPDATE users SET display_name = :display_name WHERE id = :id");
        $statement->execute([
            ':display_name' => $displayName,
            ':id' => (int)$user['id'],
        ]);
        $user = find_user_by_username($pdo, $email);
    }

    return [200, user_payload_with_token($pdo, $user)];
}

// Ends the session behind $token, if there is one.
function sign_out(PDO $pdo, string $token): array
{
    if ($token !== '') {
        $statement = $pdo->prepare("DELETE FROM user_sessions WHERE token_hash = :token_hash");
        $statement->execute([':token_hash' => hash('sha256', $token)]);
    }
    return [200, ['ok' => true]];
}

// Reports who the current session belongs to, or no user when signed out.
function who_am_i(PDO $pdo, ?array $currentUser): array
{
    return [
        200,
        [
            'ok' => true,
            'user' => $currentUser ? public_user($currentUser) : null,
            'permissions' => permissions_for($currentUser),
            'currentEventId' => current_event_id($pdo),
        ],
    ];
}

function create_session(PDO $pdo, int $userId, string $role): string
{
    $pdo->exec("DELETE FROM user_sessions WHERE expires_at <= NOW()");
    $pdo->exec("DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL 1 DAY");

    $token = bin2hex(random_bytes(32));
    $statement = $pdo->prepare(
        "INSERT INTO user_sessions (token_hash, user_id, expires_at)
         VALUES (:token_hash, :user_id, DATE_ADD(NOW(), INTERVAL " . (in_array($role, ['admin', 'super_admin'], true) ? '12 HOUR' : '30 DAY') . "))"
    );
    $statement->execute([
        ':token_hash' => hash('sha256', $token),
        ':user_id' => $userId,
    ]);
    return $token;
}

function user_payload_with_token(PDO $pdo, array $user): array
{
    return [
        'ok' => true,
        'token' => create_session($pdo, (int)$user['id'], (string)$user['role']),
        'user' => public_user($user),
        'permissions' => permissions_for($user),
        'currentEventId' => current_event_id($pdo),
    ];
}
