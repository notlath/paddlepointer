<?php
declare(strict_types=1);

// Shared harness for tests that need a disposable MySQL/MariaDB server.
// Connection via env: PP_TEST_DB_HOST (127.0.0.1), PP_TEST_DB_PORT (3307), PP_TEST_DB_USER (root), PP_TEST_DB_PASS ('').
// Each test gets its own empty paddlepoint_test_* database, dropped afterwards.

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../api/db.php';

function expect_same(mixed $expected, mixed $actual, string $label): void
{
    if ($expected !== $actual) {
        throw new RuntimeException(sprintf(
            "%s\n  expected: %s\n  actual:   %s",
            $label,
            var_export($expected, true),
            var_export($actual, true)
        ));
    }
}

function run_db_tests(array $tests): never
{
    $host = getenv('PP_TEST_DB_HOST') ?: '127.0.0.1';
    $port = (int)(getenv('PP_TEST_DB_PORT') ?: 3307);
    $user = getenv('PP_TEST_DB_USER') ?: 'root';
    $pass = getenv('PP_TEST_DB_PASS') ?: '';
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ];

    $server = new PDO("mysql:host=$host;port=$port;charset=utf8mb4", $user, $pass, $options);
    $failed = false;
    foreach ($tests as $test) {
        $dbName = 'paddlepoint_test_' . bin2hex(random_bytes(4));
        $server->exec("CREATE DATABASE `$dbName` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        try {
            $test(new PDO("mysql:host=$host;port=$port;dbname=$dbName;charset=utf8mb4", $user, $pass, $options));
            echo "PASS $test\n";
        } catch (Throwable $error) {
            $failed = true;
            echo "FAIL $test\n", $error->getMessage(), "\n";
        } finally {
            $server->exec("DROP DATABASE `$dbName`");
        }
    }
    exit($failed ? 1 : 0);
}
