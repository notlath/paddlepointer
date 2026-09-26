<?php
declare(strict_types=1);

// Qlik embed token endpoint test, no web server needed:
//   php tests/qlik_embed_token_test.php

require_once __DIR__ . '/test_db.php';
require_once __DIR__ . '/../api/qlik/embed_token.php';

function stub_qlik_token(): array
{
    return ['access_token' => 'stub-access-token', 'expires_in' => 21600];
}

function failing_qlik_token(): ?array
{
    return null;
}

function test_signed_out_user_is_refused_a_token(PDO $pdo): void
{
    [$status, $payload] = read_qlik_embed_token(null, 'stub_qlik_token');
    expect_same([401, false], [$status, $payload['ok']], 'A signed-out request is refused with 401');
}

function test_player_and_visitor_are_refused_a_token(PDO $pdo): void
{
    foreach (['player', 'visitor'] as $role) {
        $user = ['role' => $role, 'is_active' => 1];
        [$status, $payload] = read_qlik_embed_token($user, 'stub_qlik_token');
        expect_same([403, false], [$status, $payload['ok']], "A $role is refused with 403");
    }
}

function test_admin_and_super_admin_receive_a_token(PDO $pdo): void
{
    foreach (['admin', 'super_admin'] as $role) {
        $user = ['role' => $role, 'is_active' => 1];
        [$status, $payload] = read_qlik_embed_token($user, 'stub_qlik_token');
        expect_same(
            [200, true, 'stub-access-token', 21600],
            [$status, $payload['ok'], $payload['accessToken'] ?? null, $payload['expiresIn'] ?? null],
            "A $role receives the access token and its lifetime"
        );
        expect_same(false, array_key_exists('clientSecret', $payload) || array_key_exists('client_secret', $payload), 'The client secret is never in the payload');
    }
}

function test_an_inactive_admin_is_refused_a_token(PDO $pdo): void
{
    $user = ['role' => 'admin', 'is_active' => 0];
    [$status, $payload] = read_qlik_embed_token($user, 'stub_qlik_token');
    expect_same([403, false], [$status, $payload['ok']], 'An inactive Admin is refused with 403');
}

function test_an_upstream_failure_is_reported_as_502(PDO $pdo): void
{
    $user = ['role' => 'super_admin', 'is_active' => 1];
    [$status, $payload] = read_qlik_embed_token($user, 'failing_qlik_token');
    expect_same([502, false], [$status, $payload['ok']], "A failed Qlik token exchange is reported, not silently swallowed");
}

// The M2M credentials live in the gitignored .env; before this, PHP never read it and every
// staff token request failed with "missing credentials".
function test_dotenv_supplies_credentials_without_overriding_the_real_environment(PDO $pdo): void
{
    $file = tempnam(sys_get_temp_dir(), 'env');
    file_put_contents($file, "# comment\nPP_DOTENV_A=from-file\nPP_DOTENV_B=\"quoted value\"\nPP_DOTENV_C=file-loses\n\nnot a pair\n");
    putenv('PP_DOTENV_C=real-env-wins');
    load_dotenv($file);
    unlink($file);
    expect_same(
        ['from-file', 'quoted value', 'real-env-wins'],
        [getenv('PP_DOTENV_A'), getenv('PP_DOTENV_B'), getenv('PP_DOTENV_C')],
        '.env fills unset variables, strips quotes, and never overrides a real environment variable'
    );
    load_dotenv($file); // a missing file is not an error
}

run_db_tests([
    'test_dotenv_supplies_credentials_without_overriding_the_real_environment',
    'test_signed_out_user_is_refused_a_token',
    'test_player_and_visitor_are_refused_a_token',
    'test_admin_and_super_admin_receive_a_token',
    'test_an_inactive_admin_is_refused_a_token',
    'test_an_upstream_failure_is_reported_as_502',
]);
