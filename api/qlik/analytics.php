<?php
declare(strict_types=1);

// Shared auth for every /api/qlik/* analytics endpoint: a key sent in a request
// header, never the query string. See docs/adr/0001-qlik-pulls-rest-no-talend.md.

require_once __DIR__ . '/../config.php';

// Set only in the environment (.env); when it is missing every request is refused.
function analytics_key(): string
{
    return (string)getenv('ANALYTICS_KEY');
}

function analytics_key_from_request(): string
{
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    foreach ($headers as $name => $value) {
        if (strtolower((string)$name) === 'x-analytics-key') {
            return trim((string)$value);
        }
    }
    return '';
}

// Returns the [status, payload] conflict to send when unauthorized, or null when the key is valid.
function analytics_key_conflict(string $providedKey): ?array
{
    $configured = analytics_key();
    if ($configured === '' || $providedKey === '' || !hash_equals($configured, $providedKey)) {
        return [401, ['ok' => false, 'error' => 'A valid analytics key is required']];
    }
    return null;
}

// True when an Event (Tournament) with this id has ever existed.
function qlik_event_exists(PDO $pdo, string $eventId): bool
{
    $statement = $pdo->prepare("SELECT id FROM tournaments WHERE id = :id LIMIT 1");
    $statement->execute([':id' => $eventId]);
    return (bool)$statement->fetch();
}

// Reformats a stored timestamp to strict ISO 8601 UTC, assuming UTC when the
// stored value carries no timezone of its own. Returns null for blank/unparsable input.
function normalize_iso_utc(?string $value): ?string
{
    $value = trim((string)$value);
    if ($value === '') {
        return null;
    }
    try {
        $date = new DateTime($value, new DateTimeZone('UTC'));
    } catch (Exception $error) {
        return null;
    }
    $date->setTimezone(new DateTimeZone('UTC'));
    return $date->format('Y-m-d\TH:i:s.v\Z');
}
