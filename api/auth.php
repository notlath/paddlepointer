<?php
declare(strict_types=1);

require_once __DIR__ . '/sign_in.php';

handle_options();

function read_json_body(): array
{
    $raw = file_get_contents('php://input') ?: '';
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

$pdo = pdo_connection();
$action = isset($_GET['action']) ? trim((string)$_GET['action']) : '';

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        [$status, $payload] = match ($action) {
            'me' => who_am_i($pdo, user_from_request($pdo)),
            'users' => list_users($pdo, user_from_request($pdo)),
            default => [404, ['ok' => false, 'error' => 'Unknown auth action']],
        };
        send_json($payload, $status);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        send_json(['ok' => false, 'error' => 'GET or POST required'], 405);
    }

    $data = read_json_body();
    [$status, $payload] = match ($action) {
        'login' => sign_in($pdo, $data, client_ip()),
        'visitor-login' => visitor_sign_in($pdo, $data, client_ip()),
        'logout' => sign_out($pdo, token_from_request()),
        'register' => [403, ['ok' => false, 'error' => 'Player self-registration is disabled. Ask a Super Admin to create the account.']],
        'profile' => update_profile($pdo, user_from_request($pdo), $data),
        'create-user' => create_account($pdo, user_from_request($pdo), $data),
        'update-user' => update_account($pdo, user_from_request($pdo), $data),
        'delete-user' => delete_account($pdo, user_from_request($pdo), $data),
        default => [404, ['ok' => false, 'error' => 'Unknown auth action']],
    };
    if ($status === 429) header('Retry-After: ' . ($action === 'visitor-login' ? VISITOR_CREATION_WINDOW : STAFF_FAILURE_WINDOW));
    send_json($payload, $status);
} catch (Throwable $error) {
    send_server_error($error);
}
