<?php
declare(strict_types=1);

// Access policy module test, no web server needed:
//   php tests/access_policy_test.php
// Database setup: see tests/test_db.php (unused here, but run_db_tests expects the same test shape).

require_once __DIR__ . '/test_db.php';
require_once __DIR__ . '/../api/sign_in.php';

const ALL_ACTIONS = [
    'manage_users',
    'reset_tournament',
    'clear_tournament_games',
    'start_new_event',
    'save_tournament',
    'update_tournament_match',
    'save_game',
    'update_profile',
    'have_password',
    'visitor_sign_in',
    'view_all_history',
    'view_visitor_history',
    'view_own_history',
    'view_qlik_embed',
    'view_players',
    'rename_player',
    'set_player_skill',
    'merge_players',
    'correct_match',
    'delete_event',
    'read_tournament',
    'read_history',
    'read_leaderboard',
];

// What each role/session may do today; everything else in ALL_ACTIONS is refused.
const ALLOWED_BY_ROLE = [
    'super_admin' => ['manage_users', 'reset_tournament', 'clear_tournament_games', 'start_new_event', 'correct_match', 'delete_event', 'save_tournament', 'update_tournament_match', 'view_all_history', 'view_qlik_embed', 'view_players', 'rename_player', 'set_player_skill', 'merge_players', 'save_game', 'update_profile', 'have_password'],
    'admin' => ['save_tournament', 'update_tournament_match', 'view_all_history', 'view_qlik_embed', 'view_players', 'rename_player', 'set_player_skill', 'merge_players', 'save_game', 'update_profile', 'have_password'],
    'player' => ['update_profile', 'view_own_history'],
    'visitor' => ['save_game', 'update_profile', 'visitor_sign_in', 'view_visitor_history'],
    'signed_out' => [],
];

const PUBLIC_ACTIONS = ['read_tournament', 'read_history', 'read_leaderboard'];

function test_role_action_table(PDO $pdo): void
{
    foreach (ALLOWED_BY_ROLE as $role => $allowed) {
        $user = $role === 'signed_out' ? null : ['role' => $role, 'is_active' => 1];
        $expectedAllowed = array_merge($allowed, PUBLIC_ACTIONS);
        foreach (ALL_ACTIONS as $action) {
            $expected = in_array($action, $expectedAllowed, true);
            expect_same($expected, can($user, $action), "$role " . ($expected ? 'may' : 'may not') . " $action");
        }
    }
}

function test_public_actions_allow_signed_out_and_every_role(PDO $pdo): void
{
    foreach ([null, ['role' => 'super_admin', 'is_active' => 1], ['role' => 'admin', 'is_active' => 1], ['role' => 'player', 'is_active' => 1], ['role' => 'visitor', 'is_active' => 1]] as $user) {
        foreach (PUBLIC_ACTIONS as $action) {
            expect_same(true, can($user, $action), ($user['role'] ?? 'signed_out') . " may $action");
        }
    }
}

function test_who_am_i_reports_permissions(PDO $pdo): void
{
    migrate($pdo);
    $superAdmin = ['id' => 1, 'username' => 'boss', 'display_name' => 'Boss', 'role' => 'super_admin', 'is_active' => 1];
    [, $payload] = who_am_i($pdo, $superAdmin);
    expect_same(true, $payload['permissions']['manage_users'] ?? null, "who_am_i's permissions reflect the session's role");
    expect_same(false, $payload['permissions']['view_own_history'] ?? null, "who_am_i's permissions refuse actions outside the role");
}

function test_an_inactive_account_may_do_nothing_but_the_public_actions(PDO $pdo): void
{
    $inactiveSuperAdmin = ['role' => 'super_admin', 'is_active' => 0];
    foreach (ALL_ACTIONS as $action) {
        if (in_array($action, PUBLIC_ACTIONS, true) || $action === 'have_password' || $action === 'visitor_sign_in') {
            continue;
        }
        expect_same(false, can($inactiveSuperAdmin, $action), "An inactive Super Admin may not $action");
    }
}

run_db_tests([
    'test_role_action_table',
    'test_public_actions_allow_signed_out_and_every_role',
    'test_who_am_i_reports_permissions',
    'test_an_inactive_account_may_do_nothing_but_the_public_actions',
]);
