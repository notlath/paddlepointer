<?php
declare(strict_types=1);

// Sign-in handler test (login, visitor login, logout, who am I), no web server needed:
//   php tests/sign_in_test.php
// Database setup: see tests/test_db.php.

require_once __DIR__ . '/test_db.php';
require_once __DIR__ . '/../api/sign_in.php';

function insert_user(PDO $pdo, string $username, string $role, string $password = '', bool $active = true): void
{
    $pdo->prepare(
        "INSERT INTO users (username, display_name, role, password_hash, is_active)
         VALUES (:username, :display_name, :role, :password_hash, :is_active)"
    )->execute([
        ':username' => $username,
        ':display_name' => ucfirst($username),
        ':role' => $role,
        ':password_hash' => $password === '' ? '' : password_hash($password, PASSWORD_DEFAULT),
        ':is_active' => $active ? 1 : 0,
    ]);
}

// Who the session behind $token belongs to, the way every endpoint looks it up.
function signed_in_username(PDO $pdo, string $token): ?string
{
    $_SERVER['HTTP_X_SESSION_TOKEN'] = $token;
    [, $payload] = who_am_i($pdo, user_from_request($pdo));
    return $payload['user']['username'] ?? null;
}

function test_staff_need_the_right_password_and_an_active_account(PDO $pdo): void
{
    migrate($pdo);
    $pdo->prepare("UPDATE users SET password_hash = :hash WHERE username = 'superadmin_ac'")
        ->execute([':hash' => password_hash('master1', PASSWORD_DEFAULT)]);
    insert_user($pdo, 'court_admin', 'admin', 'secret1');
    insert_user($pdo, 'old_admin', 'admin', 'secret1', false);
    insert_user($pdo, 'pedro', 'player');

    foreach (['court_admin' => 'secret1', 'superadmin_ac' => 'master1'] as $username => $password) {
        [$status, $payload] = sign_in($pdo, ['username' => $username, 'password' => 'wrong-password']);
        expect_same([401, 'Invalid username or password'], [$status, $payload['error'] ?? null], "$username needs the right password");

        [$status, $payload] = sign_in($pdo, ['username' => $username, 'password' => $password]);
        expect_same([200, $username], [$status, $payload['user']['username'] ?? null], "$username signs in with the right password");
        expect_same($username, signed_in_username($pdo, $payload['token']), "$username's token opens a session");
    }

    [$status, $payload] = sign_in($pdo, ['username' => ' Court_Admin ', 'password' => 'secret1']);
    expect_same(200, $status, 'Usernames are trimmed and lowercased before lookup');

    foreach (['old_admin' => 'an inactive account', 'nobody' => 'an unknown username'] as $username => $label) {
        [$status, $payload] = sign_in($pdo, ['username' => $username, 'password' => 'secret1']);
        expect_same([401, 'Invalid username or inactive account'], [$status, $payload['error'] ?? null], "Signing in to $label is refused");
    }

    // Player sign-in without a password is today's behaviour; the auth security review decides whether it stays.
    [$status, $payload] = sign_in($pdo, ['username' => 'pedro']);
    expect_same([200, 'player'], [$status, $payload['user']['role'] ?? null], 'A Player signs in without a password');
}

function test_visitor_sign_in(PDO $pdo): void
{
    migrate($pdo);
    insert_user($pdo, 'boss@example.com', 'admin', 'secret1');
    insert_user($pdo, 'gone@example.com', 'visitor', '', false);

    [$status, $payload] = visitor_sign_in($pdo, ['email' => 'not-an-email', 'displayName' => 'Guest']);
    expect_same([400, 'Valid email is required'], [$status, $payload['error'] ?? null], 'A visitor login needs a valid email');

    [$status, $payload] = visitor_sign_in($pdo, ['email' => ' Guest@Example.com ', 'displayName' => 'Guest One']);
    expect_same([200, 'guest@example.com', 'Guest One', 'visitor'], [$status, $payload['user']['username'] ?? null, $payload['user']['displayName'] ?? null, $payload['user']['role'] ?? null], 'The first visitor login creates the Visitor');
    expect_same('guest@example.com', signed_in_username($pdo, $payload['token']), "The new Visitor's token opens a session");
    $firstId = $payload['user']['id'];

    [$status, $payload] = visitor_sign_in($pdo, ['email' => 'guest@example.com', 'displayName' => 'Guest Renamed']);
    expect_same([200, $firstId, 'Guest Renamed'], [$status, $payload['user']['id'] ?? null, $payload['user']['displayName'] ?? null], 'A returning Visitor signs in to the same account and can rename it');
    expect_same(
        ['guest@example.com' => ''],
        $pdo->query("SELECT username, password_hash FROM users WHERE username = 'guest@example.com'")->fetchAll(PDO::FETCH_KEY_PAIR),
        'Exactly one Visitor exists, with no password stored'
    );

    [$status, $payload] = visitor_sign_in($pdo, ['username' => 'nameless@example.com']);
    expect_same([200, 'nameless@example.com'], [$status, $payload['user']['displayName'] ?? null], 'Without a display name the email is used, and username works as the email field');

    [$status, $payload] = visitor_sign_in($pdo, ['email' => 'boss@example.com', 'displayName' => 'Guest']);
    expect_same([409, 'This email is already used by another account type'], [$status, $payload['error'] ?? null], "An email belonging to another account type is refused");

    [$status, $payload] = visitor_sign_in($pdo, ['email' => 'gone@example.com']);
    expect_same([401, 'Visitor account is inactive'], [$status, $payload['error'] ?? null], 'An inactive Visitor is refused');
}

function test_signing_out_ends_the_session(PDO $pdo): void
{
    migrate($pdo);
    insert_user($pdo, 'pedro', 'player');

    $token = sign_in($pdo, ['username' => 'pedro'])[1]['token'];
    $otherToken = sign_in($pdo, ['username' => 'pedro'])[1]['token'];
    expect_same('pedro', signed_in_username($pdo, $token), 'Who am I returns the signed-in user');

    expect_same([200, ['ok' => true]], sign_out($pdo, $token), 'Signing out succeeds');
    expect_same(null, signed_in_username($pdo, $token), 'Who am I then returns no user');
    expect_same('pedro', signed_in_username($pdo, $otherToken), 'Only that session ends');

    expect_same([200, ['ok' => true]], sign_out($pdo, ''), 'Signing out without a token still succeeds');
    expect_same([200, ['ok' => true, 'user' => null, 'permissions' => permissions_for(null), 'currentEventId' => 'open_play']], who_am_i($pdo, null), 'Who am I without a session returns no user');
}

function test_who_am_i_reports_the_current_event(PDO $pdo): void
{
    migrate($pdo);
    [, $payload] = who_am_i($pdo, null);
    expect_same('open_play', $payload['currentEventId'] ?? null, 'A fresh database reports open_play as the Current Event');

    $pdo->prepare("UPDATE app_settings SET setting_value = :value WHERE setting_key = 'current_event_id'")
        ->execute([':value' => 'summer_bash']);
    [, $payload] = who_am_i($pdo, null);
    expect_same('summer_bash', $payload['currentEventId'] ?? null, 'Who am I reflects a changed Current Event');
}

// A fresh sign-in must name the Current Event too; otherwise the app loads the default Event
// until the page is reloaded (reloads ask who_am_i).
function test_sign_in_reports_the_current_event(PDO $pdo): void
{
    migrate($pdo);
    insert_user($pdo, 'pedro', 'player');
    $pdo->prepare("UPDATE app_settings SET setting_value = :value WHERE setting_key = 'current_event_id'")
        ->execute([':value' => 'summer_bash']);

    [, $payload] = sign_in($pdo, ['username' => 'pedro']);
    expect_same('summer_bash', $payload['currentEventId'] ?? null, 'Sign-in reports the Current Event');

    [, $payload] = visitor_sign_in($pdo, ['email' => 'guest@example.com', 'displayName' => 'Guest']);
    expect_same('summer_bash', $payload['currentEventId'] ?? null, 'Visitor sign-in reports the Current Event');
}

// A token in a URL lands in server and proxy logs, so only the X-Session-Token header counts.
function test_the_session_token_is_read_from_the_header_only(PDO $pdo): void
{
    migrate($pdo);
    insert_user($pdo, 'pedro', 'player');
    $token = sign_in($pdo, ['username' => 'pedro'])[1]['token'];

    unset($_SERVER['HTTP_X_SESSION_TOKEN']);
    $_GET['token'] = $token;
    expect_same(null, user_from_request($pdo), 'A token in the query string is ignored');
    unset($_GET['token']);

    $_SERVER['HTTP_X_SESSION_TOKEN'] = $token;
    expect_same('pedro', user_from_request($pdo)['username'] ?? null, 'The X-Session-Token header signs in');
}

// Every sign-in adds a session row; expired ones are cleared at the same time so the table stays small.
function test_signing_in_clears_expired_sessions(PDO $pdo): void
{
    migrate($pdo);
    insert_user($pdo, 'pedro', 'player');
    $pdo->exec("INSERT INTO user_sessions (token_hash, user_id, expires_at)
                SELECT REPEAT('a', 64), id, DATE_SUB(NOW(), INTERVAL 1 DAY) FROM users WHERE username = 'pedro'");

    $token = sign_in($pdo, ['username' => 'pedro'])[1]['token'];

    expect_same(0, (int)$pdo->query("SELECT COUNT(*) FROM user_sessions WHERE expires_at <= NOW()")->fetchColumn(), 'Expired sessions are gone');
    expect_same('pedro', signed_in_username($pdo, $token), 'The new session works');
}

function test_default_super_admin_password_reminder(PDO $pdo): void
{
    migrate($pdo);
    $seed = find_user_by_username($pdo, 'superadmin_ac');
    expect_same(true, user_payload_with_token($pdo, $seed)['user']['usingDefaultPassword'], 'The seeded Super Admin sees the reminder at sign-in');
    expect_same(true, who_am_i($pdo, $seed)[1]['user']['usingDefaultPassword'], 'Who am I keeps the reminder');
    expect_same(false, array_key_exists('password_hash', public_user($seed)), 'The hash is not public');
    insert_user($pdo, 'another_admin', 'admin', 'secret1');
    expect_same(false, public_user(find_user_by_username($pdo, 'another_admin'))['usingDefaultPassword'], 'Other staff do not see it');
    update_profile($pdo, $seed, ['password' => 'changed1']);
    expect_same(false, public_user(find_user_by_username($pdo, 'superadmin_ac'))['usingDefaultPassword'], 'Changing the password clears the reminder');
}

function test_rate_limits_and_session_expiry(PDO $pdo): void
{
    migrate($pdo);
    insert_user($pdo, 'court_admin', 'admin', 'secret1');
    insert_user($pdo, 'pedro', 'player');
    for ($i = 0; $i < 5; $i++) {
        expect_same(401, sign_in($pdo, ['username' => 'court_admin', 'password' => 'wrong'], '192.0.2.1')[0], 'Wrong password is counted');
    }
    expect_same(429, sign_in($pdo, ['username' => 'court_admin', 'password' => 'secret1'], '192.0.2.1')[0], 'The sixth attempt is blocked before password checking');
    expect_same(200, sign_in($pdo, ['username' => 'pedro'], '192.0.2.1')[0], 'Player sign-in is unaffected');

    $admin = find_user_by_username($pdo, 'court_admin');
    $token = user_payload_with_token($pdo, $admin)['token'];
    $hash = hash('sha256', $token);
    $expires = $pdo->query("SELECT TIMESTAMPDIFF(HOUR, NOW(), expires_at) FROM user_sessions WHERE token_hash = '$hash'")->fetchColumn();
    expect_same(true, (int)$expires >= 11 && (int)$expires <= 12, 'Staff session lasts about 12 hours');
    $pdo->exec("UPDATE user_sessions SET expires_at = DATE_ADD(NOW(), INTERVAL 5 HOUR) WHERE token_hash = '$hash'");
    $_SERVER['HTTP_X_SESSION_TOKEN'] = $token;
    user_from_request($pdo);
    $extended = (int)$pdo->query("SELECT TIMESTAMPDIFF(HOUR, NOW(), expires_at) FROM user_sessions WHERE token_hash = '$hash'")->fetchColumn();
    expect_same(true, $extended >= 11 && $extended <= 12, 'Staff activity extends an expiring session');
    $player = find_user_by_username($pdo, 'pedro');
    $playerToken = user_payload_with_token($pdo, $player)['token'];
    $playerHash = hash('sha256', $playerToken);
    $playerDays = (int)$pdo->query("SELECT TIMESTAMPDIFF(DAY, NOW(), expires_at) FROM user_sessions WHERE token_hash = '$playerHash'")->fetchColumn();
    expect_same(true, $playerDays >= 29 && $playerDays <= 30, 'Player sessions last about 30 days');
}

function test_visitor_creation_limit_and_client_ip(PDO $pdo): void
{
    migrate($pdo);
    for ($i = 0; $i < 60; $i++) {
        expect_same(200, visitor_sign_in($pdo, ['email' => "visitor$i@example.com"], '192.0.2.3')[0], 'A new Visitor signs in');
    }
    expect_same(429, visitor_sign_in($pdo, ['email' => 'visitor61@example.com'], '192.0.2.3')[0], 'The 61st Visitor creation is limited');
    expect_same(200, visitor_sign_in($pdo, ['email' => 'visitor0@example.com'], '192.0.2.3')[0], 'An existing Visitor can return');

    $_SERVER['REMOTE_ADDR'] = '198.51.100.2';
    $_SERVER['HTTP_X_FORWARDED_FOR'] = '203.0.113.5, 127.0.0.1';
    expect_same('198.51.100.2', client_ip(), 'Untrusted forwarded IP is ignored');
    $_SERVER['REMOTE_ADDR'] = '127.0.0.1';
    expect_same('203.0.113.5', client_ip(), 'Loopback proxy forwards the visitor IP');
    unset($_SERVER['REMOTE_ADDR'], $_SERVER['HTTP_X_FORWARDED_FOR']);

    expect_same(false, hit_rate_limit($pdo, 'short-window', 1, 1), 'First hit is allowed');
    expect_same(true, hit_rate_limit($pdo, 'short-window', 1, 1), 'Second hit is limited');
    $pdo->exec("UPDATE rate_limits SET window_start = DATE_SUB(NOW(), INTERVAL 2 SECOND) WHERE bucket = 'short-window'");
    expect_same(false, hit_rate_limit($pdo, 'short-window', 1, 1), 'A new window allows a hit');
}

run_db_tests([
    'test_the_session_token_is_read_from_the_header_only',
    'test_signing_in_clears_expired_sessions',
    'test_default_super_admin_password_reminder',
    'test_rate_limits_and_session_expiry',
    'test_visitor_creation_limit_and_client_ip',
    'test_staff_need_the_right_password_and_an_active_account',
    'test_visitor_sign_in',
    'test_signing_out_ends_the_session',
    'test_who_am_i_reports_the_current_event',
    'test_sign_in_reports_the_current_event',
]);
