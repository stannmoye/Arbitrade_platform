<?php
declare(strict_types=1);

function dispatch_php_api(PDO $pdo, string $module, string $operation, array $input, string $method, ?array $user): array
{
    if (!preg_match('/^[a-z0-9-]{1,60}$/', $module) || !preg_match('/^[a-zA-Z0-9.-]{1,80}$/', $operation)) {
        json_response(['error' => 'Unknown API route.'], 404);
    }
    if (str_starts_with($module, 'admin-') && (!$user || $user['role'] !== 'admin')) {
        json_response(['error' => 'Administrator access required.'], $user ? 403 : 401);
    }
    if (str_starts_with($module, 'customer-') && (!$user || $user['role'] !== 'user')) {
        json_response(['error' => 'Customer access required.'], $user ? 403 : 401);
    }
    $file = __DIR__ . '/api/' . $module . '.php';
    if (!is_file($file)) {
        json_response(['error' => 'This feature has not been ported to PHP yet.'], 501);
    }
    $handlers = require $file;
    if (!is_array($handlers) || !isset($handlers[$operation]) || !is_callable($handlers[$operation])) {
        json_response(['error' => 'Unknown API operation.'], 404);
    }
    $data = $handlers[$operation]($pdo, $user, $input, $method);
    return is_array($data) ? $data : ['result' => $data];
}
