<?php
declare(strict_types=1);

/*
 * Copy this file to ../config.local.php (outside the public web root), then
 * enter the dedicated cPanel MySQL user's connection details there.
 */
return [
    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'name' => 'cpanel_account_arbitrade',
        'user' => 'cpanel_account_appuser',
        'password' => 'REPLACE_WITH_DATABASE_PASSWORD',
        'charset' => 'utf8mb4',
    ],
    'app' => [
        'force_https' => true,
        'session_name' => 'arbitrade_php_session',
    ],
];
