<?php
declare(strict_types=1);

function login_user(string $email, string $password): ?array
{
    $email = strtolower(trim($email));
    if ($email === '' || $password === '') {
        return null;
    }
    $stmt = app_db()->prepare('SELECT id, openId, name, email, role, passwordHash, authVersion FROM users WHERE email = :email ORDER BY id ASC LIMIT 1');
    $stmt->execute(['email' => $email]);
    $user = $stmt->fetch();
    if (!$user || !is_string($user['passwordHash'] ?? null) || !password_verify($password, $user['passwordHash'])) {
        return null;
    }
    session_regenerate_id(true);
    $_SESSION['user_id'] = (int)$user['id'];
    $_SESSION['auth_version'] = (int)($user['authVersion'] ?? 0);
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    app_db()->prepare('UPDATE users SET lastSignedIn = CURRENT_TIMESTAMP WHERE id = :id')->execute(['id' => $user['id']]);
    return public_user($user);
}

function public_user(array $user): array
{
    return [
        'id' => (int)$user['id'],
        'name' => (string)($user['name'] ?: $user['email']),
        'email' => (string)$user['email'],
        'role' => (string)$user['role'],
        'packageName' => (string)($user['packageName'] ?? 'Starter'),
    ];
}

function current_user(): ?array
{
    if (!isset($_SESSION['user_id'])) {
        return null;
    }
    $stmt = app_db()->prepare('SELECT id, name, email, role, packageName, authVersion FROM users WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => (int)$_SESSION['user_id']]);
    $user = $stmt->fetch();
    if (!$user || (int)($user['authVersion'] ?? 0) !== (int)($_SESSION['auth_version'] ?? -1)) {
        unset($_SESSION['user_id'], $_SESSION['auth_version']);
        return null;
    }
    return public_user($user);
}

function logout_user(): void
{
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $params['path'] ?: '/',
            'domain' => $params['domain'] ?? '',
            'secure' => (bool)$params['secure'],
            'httponly' => true,
            'samesite' => $params['samesite'] ?? 'Lax',
        ]);
    }
    session_destroy();
}

function require_role(string $role): array
{
    $user = current_user();
    if (!$user) {
        header('Location: /login?next=' . rawurlencode((string)($_SERVER['REQUEST_URI'] ?? '/')));
        exit;
    }
    if ($user['role'] !== $role) {
        http_response_code(403);
        exit('This account is not authorized for this portal.');
    }
    return $user;
}
