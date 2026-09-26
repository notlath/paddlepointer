<?php
declare(strict_types=1);

// Access policy module: the single authority on what roles and sessions may do.
// Endpoints and handlers ask this module instead of comparing role names directly.

function can_have_password(string|array|null $userOrRole): bool
{
    $role = is_array($userOrRole) ? (string)($userOrRole['role'] ?? '') : (string)($userOrRole ?? '');
    return $role === 'admin' || $role === 'super_admin';
}

// Identifies the Super Admin row itself (e.g. to protect it), as opposed to
// checking whether a signed-in actor may perform an action.
function is_super_admin(?array $user): bool
{
    return (string)($user['role'] ?? '') === 'super_admin';
}

function can(?array $user, string $action): bool
{
    $role = (string)($user['role'] ?? '');
    $isSignedIn = $user !== null && !empty($user['is_active'] ?? 1);

    return match ($action) {
        // Super Admin only
        'manage_users',
        'reset_tournament',
        'clear_tournament_games',
        'start_new_event',
        'correct_match',
        'delete_event' => $isSignedIn && $role === 'super_admin',

        // Staff (Super Admin & Admin)
        'save_tournament',
        'update_tournament_match',
        'view_all_history',
        'view_qlik_embed',
        'view_user_counts',
        'view_players',
        'rename_player',
        'set_player_skill',
        'merge_players' => $isSignedIn && ($role === 'super_admin' || $role === 'admin'),

        // Staff & Visitor
        'save_game' => $isSignedIn && ($role === 'super_admin' || $role === 'admin' || $role === 'visitor'),

        // Any signed-in user
        'update_profile' => $isSignedIn && in_array($role, ['super_admin', 'admin', 'player', 'visitor'], true),

        // Authentication capabilities
        'have_password' => can_have_password($user),
        'visitor_sign_in' => $role === 'visitor',

        // History visibility flags
        'view_visitor_history' => $isSignedIn && $role === 'visitor',
        'view_own_history' => $isSignedIn && $role === 'player',

        // Public actions allowed for everyone (including signed out)
        'read_tournament',
        'read_history',
        'read_leaderboard' => true,

        default => false,
    };
}

function permissions_for(?array $user): array
{
    $actions = [
        'manage_users',
        'reset_tournament',
        'clear_tournament_games',
        'start_new_event',
        'save_tournament',
        'update_tournament_match',
        'save_game',
        'update_profile',
        'have_password',
        'read_tournament',
        'read_history',
        'read_leaderboard',
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
    ];

    $permissions = [];
    foreach ($actions as $action) {
        $permissions[$action] = can($user, $action);
    }
    return $permissions;
}
