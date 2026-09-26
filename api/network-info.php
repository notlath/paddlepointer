<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

handle_options();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    send_json(['ok' => false, 'error' => 'GET required'], 405);
}

$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$port = (int)($_SERVER['SERVER_PORT'] ?? 80);
$portPart = ($scheme === 'http' && $port === 80) || ($scheme === 'https' && $port === 443) ? '' : ':' . $port;
$scriptName = str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? ''));
$basePath = preg_replace('#/api/network-info\.php$#', '', $scriptName) ?: '';

// The server's LAN addresses help phones on the same Wi-Fi reach a laptop-hosted app. Anyone arriving
// from the internet gets only the public URL; the hostname and private IPs are not theirs to see.
$remote = (string)($_SERVER['REMOTE_ADDR'] ?? '');
$isLocalRequest = is_private_ipv4($remote) || $remote === '127.0.0.1' || $remote === '::1';

$ips = [];
$hostname = $isLocalRequest ? gethostname() : false;
if ($hostname) {
    $resolved = gethostbynamel($hostname);
    if (is_array($resolved)) {
        foreach ($resolved as $ip) {
            if (is_private_ipv4($ip)) {
                $ips[] = $ip;
            }
        }
    }
}

$serverAddress = (string)($_SERVER['SERVER_ADDR'] ?? '');
if ($isLocalRequest && is_private_ipv4($serverAddress)) {
    $ips[] = $serverAddress;
}

$ips = array_values(array_unique($ips));
$urls = array_map(static fn (string $ip): string => "{$scheme}://{$ip}{$portPart}{$basePath}/", $ips);
$fallbackHost = (string)($_SERVER['HTTP_HOST'] ?? 'localhost');
$fallbackUrl = "{$scheme}://{$fallbackHost}{$basePath}/";

send_json([
    'ok' => true,
    'hostname' => $hostname ?: null,
    'ips' => $ips,
    'urls' => $urls,
    'preferredUrl' => $urls[0] ?? $fallbackUrl,
]);

function is_private_ipv4(string $ip): bool
{
    if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        return false;
    }

    if ($ip === '127.0.0.1') {
        return false;
    }

    return preg_match('/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/', $ip) === 1;
}
