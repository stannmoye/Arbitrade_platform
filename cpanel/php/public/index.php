<?php
declare(strict_types=1);
require dirname(__DIR__) . '/app/bootstrap.php';
require dirname(__DIR__) . '/app/auth.php';
require dirname(__DIR__) . '/app/api-dispatch.php';

$path = parse_url((string)($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/';
$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));

function portal_login_page(string $hint = 'customer', string $message = ''): never
{
    $csrf = csrf_token();
    require dirname(__DIR__) . '/views/login.php';
    exit;
}

function asset_balances(int $userId): array
{
    $stmt = app_db()->prepare(
        'SELECT b.currency, b.availableMinor, b.lockedMinor, b.promotionalMinor, b.earnedMinor,
                COALESCE(c.name, b.currency) AS currencyName, COALESCE(c.symbol, b.currency) AS currencySymbol,
                COALESCE(c.scale, 2) AS currencyScale
         FROM customer_balances b
         LEFT JOIN currency_registry c ON c.code = b.currency
         WHERE b.userId = :userId
         ORDER BY c.assetType, c.name, b.currency'
    );
    $stmt->execute(['userId' => $userId]);
    return $stmt->fetchAll();
}

function amount_label(int|float|string $minor, int $scale, string $symbol): string
{
    $scale = max(0, min(8, $scale));
    $value = ((float)$minor) / (10 ** $scale);
    return $symbol . number_format($value, $scale, '.', ',');
}

try {
    if ($path === '/api/health' && $method === 'GET') {
        app_db()->query('SELECT 1')->fetchColumn();
        json_response(['status' => 'ok', 'database' => 'connected']);
    }

    if ($path === '/api/auth/me' && $method === 'GET') {
        json_response(['user' => current_user()]);
    }

    if (preg_match('#^/api/php/([a-z0-9-]+)/([a-zA-Z0-9.-]+)$#', $path, $match)) {
        if (!in_array($method, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], true)) {
            json_response(['error' => 'Method not allowed.'], 405);
        }
        $input = $_GET;
        if (str_contains((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) {
            $decoded = json_decode((string)file_get_contents('php://input'), true);
            $input = is_array($decoded) ? $decoded : [];
            if (isset($input['_csrf'])) $_POST['_csrf'] = (string)$input['_csrf'];
        } elseif ($method !== 'GET') {
            $input = $_POST;
        }
        if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true) && !csrf_is_valid()) {
            json_response(['error' => 'Invalid or expired CSRF token.'], 419);
        }
        try {
            $data = dispatch_php_api(app_db(), $match[1], $match[2], $input, $method, current_user());
            json_response(['data' => $data]);
        } catch (InvalidArgumentException $e) {
            json_response(['error' => $e->getMessage()], 400);
        } catch (Throwable $e) {
            error_log('[Arbitrade PHP API] ' . $e->getMessage());
            json_response(['error' => 'The request could not be completed.'], 500);
        }
    }

    if (($path === '/login' || $path === '/api/auth/login') && $method === 'POST') {
        if (!csrf_is_valid()) {
            if ($path === '/api/auth/login') json_response(['error' => 'Session expired. Refresh and try again.'], 419);
            http_response_code(419);
            portal_login_page('customer', 'Your sign-in form expired. Please try again.');
        }
        $email = (string)($_POST['email'] ?? '');
        $password = (string)($_POST['password'] ?? '');
        if (str_contains((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) {
            $input = json_decode((string)file_get_contents('php://input'), true) ?: [];
            $email = (string)($input['email'] ?? '');
            $password = (string)($input['password'] ?? '');
        }
        $user = login_user($email, $password);
        if (!$user) {
            if ($path === '/api/auth/login') json_response(['error' => 'Invalid email or password.'], 401);
            http_response_code(401);
            portal_login_page((string)($_POST['portal_hint'] ?? 'customer'), 'Invalid email or password.');
        }
        if ($path === '/api/auth/login') json_response(['user' => $user]);
        header('Location: ' . ($user['role'] === 'admin' ? '/ops-console-7f3a' : '/customer'), true, 303);
        exit;
    }

    if (($path === '/logout' || $path === '/api/auth/logout') && $method === 'POST') {
        if (!csrf_is_valid()) {
            if ($path === '/api/auth/logout') json_response(['error' => 'Invalid CSRF token.'], 419);
            http_response_code(419);
            exit('Session expired. Please refresh the page.');
        }
        logout_user();
        if ($path === '/api/auth/logout') json_response(['success' => true]);
        header('Location: /login', true, 303);
        exit;
    }

    if (($path === '/' || $path === '/login') && $method === 'GET') {
        $user = current_user();
        if ($user) {
            header('Location: ' . ($user['role'] === 'admin' ? '/ops-console-7f3a' : '/customer'), true, 303);
            exit;
        }
        $hint = (string)($_GET['next'] ?? '');
        portal_login_page(str_contains($hint, 'ops-console') ? 'admin' : 'customer');
    }

    if ($path === '/customer' && $method === 'GET') {
        $user = require_role('user');
        $balances = asset_balances($user['id']);
        $ledgerStmt = app_db()->prepare(
            'SELECT l.currency, l.amountMinor, l.entryType, l.reference, l.createdAt,
                    COALESCE(c.symbol, l.currency) AS currencySymbol, COALESCE(c.scale, 2) AS currencyScale
             FROM balance_ledger l LEFT JOIN currency_registry c ON c.code = l.currency
             WHERE l.userId = :userId ORDER BY l.createdAt DESC, l.id DESC LIMIT 8'
        );
        $ledgerStmt->execute(['userId' => $user['id']]);
        $ledger = $ledgerStmt->fetchAll();
        $notificationStmt = app_db()->prepare('SELECT COUNT(*) FROM customer_notifications WHERE userId = :userId AND readAt IS NULL');
        $notificationStmt->execute(['userId' => $user['id']]);
        $unreadCount = (int)$notificationStmt->fetchColumn();
        $csrf = csrf_token();
        require dirname(__DIR__) . '/views/customer.php';
        exit;
    }

    if ($path === '/ops-console-7f3a' && $method === 'GET') {
        $user = require_role('admin');
        $stats = [
            'customers' => (int)app_db()->query("SELECT COUNT(*) FROM users WHERE role = 'user'")->fetchColumn(),
            'admins' => (int)app_db()->query("SELECT COUNT(*) FROM users WHERE role = 'admin'")->fetchColumn(),
            'openTickets' => (int)app_db()->query("SELECT COUNT(*) FROM support_tickets WHERE status IN ('open','answered')")->fetchColumn(),
        ];
        $customers = app_db()->query("SELECT id, name, email, role, packageName, createdAt FROM users ORDER BY id DESC LIMIT 50")->fetchAll();
        $csrf = csrf_token();
        require dirname(__DIR__) . '/views/admin.php';
        exit;
    }

    if ($path === '/favicon.ico') {
        http_response_code(204);
        exit;
    }
    http_response_code(404);
    echo 'Not found';
} catch (Throwable $e) {
    error_log('[Arbitrade PHP] Request failed: ' . $e->getMessage());
    if (str_starts_with($path, '/api/')) json_response(['error' => 'The request could not be completed.'], 500);
    http_response_code(500);
    echo 'The request could not be completed. Please check the application logs.';
}
