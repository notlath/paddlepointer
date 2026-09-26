<?php
declare(strict_types=1);

require_once __DIR__ . '/../config.php';

// Asks Qlik to reload the analytics app when a write has changed what it reports, through
// the triggered automation "PaddlePoint Reload on Match Finish". Its execution token can run
// that one automation and nothing else. The scheduled 15-minute reload stays as the backstop,
// so a trigger that fails is logged, never surfaced: saving a Match must not depend on Qlik.

// The trigger was sent and Qlik is reloading; we just stopped waiting for it to finish.
const QLIK_TRIGGER_TIMED_OUT = -1;

// Qlik's execute endpoint answers only when the reload has finished (~7 s), and the run
// carries on after the caller hangs up. So this waits at most 1.5 s and treats a timeout
// after the request went out as sent. Returns the HTTP status, QLIK_TRIGGER_TIMED_OUT, or 0 when
// Qlik could not be reached at all.
function qlik_post_reload_trigger(string $url, string $token): int
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => '{}',
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Execution-Token: ' . $token],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT_MS => 1500,
    ]);
    curl_exec($ch);
    $errno = curl_errno($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $requestSent = (float)curl_getinfo($ch, CURLINFO_PRETRANSFER_TIME) > 0;
    curl_close($ch);

    if ($errno === CURLE_OPERATION_TIMEDOUT && $requestSent) {
        return QLIK_TRIGGER_TIMED_OUT;
    }
    return $errno === 0 ? $status : 0;
}

// $post defaults to the real Qlik call; tests inject a stub. Returns whether the trigger was sent.
function request_qlik_reload(?callable $post = null): bool
{
    $url = (string)getenv('QLIK_RELOAD_TRIGGER_URL');
    $token = (string)getenv('QLIK_RELOAD_TRIGGER_TOKEN');
    if ($url === '' || $token === '') {
        return false;
    }

    // ponytail: no debounce; a reload takes ~8 s and Matches take minutes, so overlapping
    // triggers just queue. Add "skip if triggered in the last N seconds" if many Courts ever
    // finish within seconds of each other.
    $status = ($post ?? 'qlik_post_reload_trigger')($url, $token);
    if ($status === QLIK_TRIGGER_TIMED_OUT || ($status >= 200 && $status < 300)) {
        return true;
    }
    error_log("Qlik reload trigger not sent: " . ($status === 0 ? 'Qlik unreachable' : "HTTP $status") . " (the 15-minute schedule will catch up)");
    return false;
}

// A write only records that a reload is pending; run-pending-reload.php, run every minute by
// cron, fires it. A burst of finished Matches costs one reload and saving one never waits on Qlik.
// The mark's value is random per write so a run can tell "the write I fired for" from a newer one.
const QLIK_RELOAD_PENDING_KEY = 'qlik_reload_pending';

function mark_qlik_reload_pending(PDO $pdo): void
{
    $pdo->prepare(
        "INSERT INTO app_settings (setting_key, setting_value) VALUES (:key, :value)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)"
    )->execute([':key' => QLIK_RELOAD_PENDING_KEY, ':value' => bin2hex(random_bytes(8))]);
}

// Fires the trigger once if a reload is pending. Returns whether it did. A failed trigger leaves
// the mark for the next run; a write that landed meanwhile replaced the mark, so it survives too.
function fire_pending_qlik_reload(PDO $pdo, ?callable $post = null): bool
{
    $select = $pdo->prepare("SELECT setting_value FROM app_settings WHERE setting_key = :key");
    $select->execute([':key' => QLIK_RELOAD_PENDING_KEY]);
    $mark = $select->fetchColumn();
    if ($mark === false || !request_qlik_reload($post)) {
        return false;
    }
    $pdo->prepare("DELETE FROM app_settings WHERE setting_key = :key AND setting_value = :value")
        ->execute([':key' => QLIK_RELOAD_PENDING_KEY, ':value' => $mark]);
    return true;
}

// What endpoints call, just before send_json(), with the status they are about to send; only a
// successful write changes the analytics. Never fails the write: the 15-minute reload catches up.
function reload_qlik_after_response(int $status, ?PDO $pdo = null): void
{
    if ($status < 200 || $status >= 300) {
        return;
    }
    try {
        mark_qlik_reload_pending($pdo ?? pdo_connection());
    } catch (Throwable $error) {
        error_log('Qlik reload not marked pending: ' . $error->getMessage());
    }
}
