<?php
declare(strict_types=1);

require_once __DIR__ . '/../access_policy.php';
require_once __DIR__ . '/../config.php';

// Returns [status, payload] for a staff member's short-lived Qlik embed token
// (ticket 11: M2M impersonation of the shared Event viewer user). The browser
// only ever receives the resulting access token, never the client secret.
// $fetchToken defaults to the real Qlik call; tests inject a stub.
function read_qlik_embed_token(?array $currentUser, ?callable $fetchToken = null): array
{
    if ($currentUser === null) {
        return [401, ['ok' => false, 'error' => 'Login required']];
    }
    if (!can($currentUser, 'view_qlik_embed')) {
        return [403, ['ok' => false, 'error' => 'Staff access required']];
    }

    $fetchToken ??= 'qlik_fetch_impersonation_token';
    $token = $fetchToken();
    if (!is_array($token) || empty($token['access_token'])) {
        return [502, ['ok' => false, 'error' => 'Could not get a Qlik token']];
    }

    return [200, [
        'ok' => true,
        'accessToken' => $token['access_token'],
        'expiresIn' => (int)($token['expires_in'] ?? 0),
    ]];
}

// Real Qlik OAuth M2M impersonation call. Returns null on any failure.
function qlik_fetch_impersonation_token(): ?array
{
    $clientId = qlik_m2m_config('QLIK_M2M_CLIENT_ID', QLIK_M2M_CLIENT_ID);
    $clientSecret = qlik_m2m_config('QLIK_M2M_CLIENT_SECRET', QLIK_M2M_CLIENT_SECRET);
    $subject = qlik_m2m_config('QLIK_EVENT_VIEWER_SUBJECT', QLIK_EVENT_VIEWER_SUBJECT);

    if ($clientId === '' || $clientSecret === '' || $subject === '') {
        error_log("Qlik M2M token request skipped: missing credentials (client_id=" . ($clientId ? 'set' : 'empty') . ", client_secret=" . ($clientSecret ? 'set' : 'empty') . ", subject=" . ($subject ? 'set' : 'empty') . ")");
        return null;
    }

    $body = json_encode([
        'client_id' => $clientId,
        'client_secret' => $clientSecret,
        'grant_type' => 'urn:qlik:oauth:user-impersonation',
        'user_lookup' => ['field' => 'subject', 'value' => $subject],
        'scope' => 'user_default',
    ]);
    if ($body === false) {
        return null;
    }

    $ch = curl_init(QLIK_TENANT_URL . '/oauth/token');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($response === false || $httpCode !== 200) {
        error_log("Qlik M2M token request failed: HTTP $httpCode - " . (string)$response);
        return null;
    }

    $decoded = json_decode((string)$response, true);
    return is_array($decoded) ? $decoded : null;
}

function qlik_m2m_config(string $envName, string $committedDefault): string
{
    $fromEnv = getenv($envName);
    return $fromEnv !== false && $fromEnv !== '' ? $fromEnv : $committedDefault;
}
