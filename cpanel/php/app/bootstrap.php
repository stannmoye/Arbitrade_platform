<?php
declare(strict_types=1);

$CPANEL_APP_ROOT = dirname(__DIR__);
$configPath = getenv('ARBITRADE_CONFIG') ?: $CPANEL_APP_ROOT . '/config.local.php';
if (!is_file($configPath)) {
    http_response_code(500);
    exit('Application configuration is missing. Follow cpanel/php/README.md.');
}
$config = require $configPath;
$db = $config['db'] ?? [];
foreach (['host', 'name', 'user', 'password'] as $required) {
    if (!isset($db[$required]) || $db[$required] === '' || $db[$required] === 'REPLACE_WITH_DATABASE_PASSWORD') {
        http_response_code(500);
        exit('Database configuration is incomplete.');
    }
}
$charset = $db['charset'] ?? 'utf8mb4';
$port = (int)($db['port'] ?? 3306);
$dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s', $db['host'], $port, $db['name'], $charset);
try {
    $pdo = new PDO($dsn, $db['user'], $db['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci",
    ]);
} catch (Throwable $e) {
    error_log('[Arbitrade PHP] Database connection failed: ' . $e->getMessage());
    http_response_code(503);
    exit('Database connection failed. Verify the cPanel database name, user, password, and privileges.');
}

$appConfig = $config['app'] ?? [];
$secure = (bool)($appConfig['force_https'] ?? true);
if (!$secure) {
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
session_name((string)($appConfig['session_name'] ?? 'arbitrade_php_session'));
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $secure,
    'httponly' => true,
    'samesite' => 'Lax',
]);
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Cache-Control: no-store');

function app_db(): PDO
{
    global $pdo;
    return $pdo;
}

function json_response(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function csrf_token(): string
{
    if (!isset($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function csrf_is_valid(): bool
{
    $submitted = (string)($_POST['_csrf'] ?? $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    return isset($_SESSION['csrf_token']) && $submitted !== '' && hash_equals((string)$_SESSION['csrf_token'], $submitted);
}

function h(mixed $value): string
{
    return htmlspecialchars((string)($value ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
