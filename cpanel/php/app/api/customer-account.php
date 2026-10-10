<?php
declare(strict_types=1);

/*
 * Customer account API port.
 *
 * This module exposes only the customer-scoped session, notification, and
 * email-preference procedures whose authorization and persistence boundaries
 * are visible in the source router.  OAuth, background delivery, external
 * storage, and financial/ledger mutations are intentionally not implemented.
 */

$rows = static function (PDO $pdo, string $sql, array $params = []): array {
    $statement = $pdo->prepare($sql);
    $statement->execute(array_values($params));
    return $statement->fetchAll(PDO::FETCH_ASSOC);
};

$exec = static function (PDO $pdo, string $sql, array $params = []): PDOStatement {
    $statement = $pdo->prepare($sql);
    $statement->execute(array_values($params));
    return $statement;
};

$withTransaction = static function (PDO $pdo, callable $callback): mixed {
    $ownsTransaction = !$pdo->inTransaction();
    if ($ownsTransaction) {
        $pdo->beginTransaction();
    }
    try {
        $pdo->exec("SET time_zone = '+00:00'");
        $result = $callback();
        if ($ownsTransaction) {
            $pdo->commit();
        }
        return $result;
    } catch (Throwable $error) {
        if ($ownsTransaction && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
};

$customerId = static function (?array $user): int {
    $id = (int)($user['id'] ?? 0);
    if ($id <= 0) {
        throw new InvalidArgumentException('Customer access required');
    }
    return $id;
};

$requireRead = static function (string $method): void {
    if ($method !== 'GET') {
        throw new InvalidArgumentException('GET is required');
    }
};

$requireWrite = static function (string $method): void {
    if (!in_array($method, ['POST', 'PUT', 'PATCH'], true)) {
        throw new InvalidArgumentException('A write method is required');
    }
};

$positiveInt = static function (mixed $value, string $field): int {
    if (is_int($value)) {
        $number = $value;
    } elseif (is_string($value) && preg_match('/^[0-9]+$/', $value) === 1) {
        $parsed = filter_var($value, FILTER_VALIDATE_INT, [
            'options' => ['min_range' => 1, 'max_range' => PHP_INT_MAX],
        ]);
        if ($parsed === false) {
            throw new InvalidArgumentException($field . ' is invalid');
        }
        $number = (int)$parsed;
    } else {
        throw new InvalidArgumentException($field . ' is invalid');
    }
    if ($number <= 0) {
        throw new InvalidArgumentException($field . ' is invalid');
    }
    return $number;
};

$optionalBoolean = static function (array $input, string $field): ?bool {
    if (!array_key_exists($field, $input)) {
        return null;
    }
    if (!is_bool($input[$field])) {
        throw new InvalidArgumentException($field . ' is invalid');
    }
    return $input[$field];
};

$normaliseSession = static function (array $row): array {
    return [
        'id' => (int)$row['id'],
        'userId' => (int)$row['userId'],
        'deviceLabel' => (string)$row['deviceLabel'],
        'ipAddress' => $row['ipAddress'] ?? null,
        'countryCode' => $row['countryCode'] ?? null,
        'userAgent' => $row['userAgent'] ?? null,
        'isCurrent' => (bool)$row['isCurrent'],
        'lastSeenAt' => $row['lastSeenAt'] ?? null,
        'createdAt' => $row['createdAt'] ?? null,
    ];
};

$normaliseNotification = static function (array $row): array {
    return [
        'id' => (int)$row['id'],
        'userId' => (int)$row['userId'],
        'title' => (string)$row['title'],
        'body' => (string)$row['body'],
        'readAt' => $row['readAt'] ?? null,
        'createdAt' => $row['createdAt'] ?? null,
    ];
};

$ensureEmailPreferences = static function (PDO $pdo, int $userId) use ($rows, $exec): array {
    $found = $rows(
        $pdo,
        'SELECT id,userId,dailyTradingReports,systemAlerts,transactionAlerts,adminMessages,updatedAt
         FROM customer_email_preferences WHERE userId=? LIMIT 1',
        [$userId]
    );
    if ($found === []) {
        /* The unique userId constraint makes initialization idempotent. */
        $exec(
            $pdo,
            'INSERT INTO customer_email_preferences (userId) VALUES (?)
             ON DUPLICATE KEY UPDATE userId=VALUES(userId)',
            [$userId]
        );
        $found = $rows(
            $pdo,
            'SELECT id,userId,dailyTradingReports,systemAlerts,transactionAlerts,adminMessages,updatedAt
             FROM customer_email_preferences WHERE userId=? LIMIT 1',
            [$userId]
        );
    }
    if ($found === []) {
        throw new RuntimeException('Email preferences could not be loaded');
    }
    return $found[0];
};

$normaliseEmailPreferences = static function (array $row): array {
    return [
        'id' => (int)$row['id'],
        'userId' => (int)$row['userId'],
        'dailyTradingReports' => (bool)$row['dailyTradingReports'],
        'systemAlerts' => (bool)$row['systemAlerts'],
        'transactionAlerts' => (bool)$row['transactionAlerts'],
        'adminMessages' => (bool)$row['adminMessages'],
        'updatedAt' => $row['updatedAt'] ?? null,
    ];
};

$listSessions = static function (PDO $pdo, int $userId) use ($rows, $normaliseSession): array {
    return array_map(
        $normaliseSession,
        $rows(
            $pdo,
            'SELECT id,userId,deviceLabel,ipAddress,countryCode,userAgent,isCurrent,lastSeenAt,createdAt
             FROM customer_sessions WHERE userId=? ORDER BY lastSeenAt DESC',
            [$userId]
        )
    );
};

$listNotifications = static function (PDO $pdo, int $userId) use ($rows, $normaliseNotification): array {
    return array_map(
        $normaliseNotification,
        $rows(
            $pdo,
            'SELECT id,userId,title,body,readAt,createdAt
             FROM customer_notifications WHERE userId=? ORDER BY createdAt DESC',
            [$userId]
        )
    );
};

$session = static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $requireWrite, $withTransaction, $rows, $exec, $listSessions): array {
    $requireWrite($method);
    $userId = $customerId($user);

    if (!array_key_exists('deviceLabel', $input) || !is_string($input['deviceLabel'])) {
        throw new InvalidArgumentException('deviceLabel is invalid');
    }
    $deviceLabel = trim($input['deviceLabel']);
    if ($deviceLabel === '') {
        $deviceLabel = 'Authenticated browser';
    }
    if (strlen($deviceLabel) > 160) {
        throw new InvalidArgumentException('deviceLabel is invalid');
    }

    $countryCode = null;
    if (array_key_exists('countryCode', $input)) {
        if (!is_string($input['countryCode'])) {
            throw new InvalidArgumentException('countryCode is invalid');
        }
        $countryCode = trim($input['countryCode']);
        if (strlen($countryCode) > 8) {
            throw new InvalidArgumentException('countryCode is invalid');
        }
    }

    $forwarded = trim((string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''));
    $ipAddress = $forwarded !== '' ? trim(explode(',', $forwarded, 2)[0]) : trim((string)($_SERVER['REMOTE_ADDR'] ?? ''));
    if (strlen($ipAddress) > 128) {
        $ipAddress = substr($ipAddress, 0, 128);
    }
    $userAgent = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');

    return $withTransaction($pdo, static function () use ($pdo, $userId, $deviceLabel, $ipAddress, $countryCode, $userAgent, $rows, $exec, $listSessions): array {
        $existing = $rows(
            $pdo,
            'SELECT id FROM customer_sessions WHERE userId=? AND deviceLabel=? LIMIT 1',
            [$userId, $deviceLabel]
        );
        if ($existing !== []) {
            $exec(
                $pdo,
                'UPDATE customer_sessions
                 SET ipAddress=?,countryCode=?,userAgent=?,lastSeenAt=UTC_TIMESTAMP(),isCurrent=?
                 WHERE id=? AND userId=?',
                [$ipAddress !== '' ? $ipAddress : null, $countryCode, $userAgent !== '' ? $userAgent : null, 1, (int)$existing[0]['id'], $userId]
            );
        } else {
            $exec(
                $pdo,
                'INSERT INTO customer_sessions
                 (userId,deviceLabel,ipAddress,countryCode,userAgent,isCurrent,lastSeenAt)
                 VALUES (?,?,?,?,?,?,UTC_TIMESTAMP())',
                [$userId, $deviceLabel, $ipAddress !== '' ? $ipAddress : null, $countryCode, $userAgent !== '' ? $userAgent : null, 1]
            );
        }
        return $listSessions($pdo, $userId);
    });
};

$sessions = static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $requireRead, $withTransaction, $listSessions): array {
    $requireRead($method);
    $userId = $customerId($user);
    return $withTransaction($pdo, static fn(): array => $listSessions($pdo, $userId));
};

$revokeSession = static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $requireWrite, $positiveInt, $withTransaction, $exec): array {
    $requireWrite($method);
    $userId = $customerId($user);
    $id = $positiveInt($input['id'] ?? null, 'id');
    return $withTransaction($pdo, static function () use ($pdo, $userId, $id, $exec): array {
        $exec(
            $pdo,
            'UPDATE customer_sessions SET isCurrent=? WHERE id=? AND userId=?',
            [0, $id, $userId]
        );
        return ['success' => true];
    });
};

$notifications = static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $requireRead, $withTransaction, $listNotifications): array {
    $requireRead($method);
    $userId = $customerId($user);
    return $withTransaction($pdo, static fn(): array => $listNotifications($pdo, $userId));
};

$markNotificationsRead = static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $requireWrite, $positiveInt, $withTransaction, $exec, $listNotifications): array {
    $requireWrite($method);
    $userId = $customerId($user);
    $notificationId = null;
    if (array_key_exists('id', $input)) {
        $notificationId = $positiveInt($input['id'], 'id');
    }
    return $withTransaction($pdo, static function () use ($pdo, $userId, $notificationId, $exec, $listNotifications): array {
        if ($notificationId !== null) {
            $exec(
                $pdo,
                'UPDATE customer_notifications SET readAt=UTC_TIMESTAMP()
                 WHERE userId=? AND id=?',
                [$userId, $notificationId]
            );
        } else {
            $exec(
                $pdo,
                'UPDATE customer_notifications SET readAt=UTC_TIMESTAMP()
                 WHERE userId=? AND readAt IS NULL',
                [$userId]
            );
        }
        return $listNotifications($pdo, $userId);
    });
};

$emailPreferences = static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $requireRead, $withTransaction, $ensureEmailPreferences, $normaliseEmailPreferences): array {
    $requireRead($method);
    $userId = $customerId($user);
    return $withTransaction($pdo, static fn(): array => $normaliseEmailPreferences($ensureEmailPreferences($pdo, $userId)));
};

$updateEmailPreferences = static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $requireWrite, $withTransaction, $ensureEmailPreferences, $normaliseEmailPreferences, $optionalBoolean, $exec): array {
    $requireWrite($method);
    $userId = $customerId($user);
    $values = [];
    foreach (['dailyTradingReports', 'systemAlerts', 'transactionAlerts', 'adminMessages'] as $field) {
        $value = $optionalBoolean($input, $field);
        if ($value !== null) {
            $values[$field] = $value ? 1 : 0;
        }
    }

    return $withTransaction($pdo, static function () use ($pdo, $userId, $values, $ensureEmailPreferences, $normaliseEmailPreferences, $exec): array {
        $ensureEmailPreferences($pdo, $userId);
        if ($values !== []) {
            $assignments = [];
            $params = [];
            foreach ($values as $column => $value) {
                $assignments[] = $column . '=?';
                $params[] = $value;
            }
            $assignments[] = 'updatedAt=UTC_TIMESTAMP()';
            $exec(
                $pdo,
                'UPDATE customer_email_preferences SET ' . implode(',', $assignments) . ' WHERE userId=?',
                array_merge($params, [$userId])
            );
        }
        return $normaliseEmailPreferences($ensureEmailPreferences($pdo, $userId));
    });
};

$emailStatus = static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $requireRead, $withTransaction, $rows, $exec): array {
    $requireRead($method);
    $userId = $customerId($user);
    return $withTransaction($pdo, static function () use ($pdo, $userId, $rows, $exec): array {
        $controls = $rows(
            $pdo,
            'SELECT emailVerified FROM customer_controls WHERE userId=? LIMIT 1',
            [$userId]
        );
        if ($controls === []) {
            /* Mirrors ensureCustomerControls without fabricating any ledger data. */
            $exec(
                $pdo,
                'INSERT INTO customer_controls (userId,autoTradeEnabled,autoTradeAmountMinor,autoTradeMinRewardBps,autoTradeDailyLimit)
                 VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE userId=VALUES(userId)',
                [$userId, 1, 10000, 0, 5]
            );
            $controls = $rows(
                $pdo,
                'SELECT emailVerified FROM customer_controls WHERE userId=? LIMIT 1',
                [$userId]
            );
        }
        if ($controls === []) {
            throw new RuntimeException('Customer controls could not be loaded');
        }
        return ['emailVerified' => (bool)$controls[0]['emailVerified']];
    });
};

$handlers = [
    /* Canonical source procedure names. */
    'customer.session' => $session,
    'customer.sessions' => $sessions,
    'customer.revokeSession' => $revokeSession,
    'customer.notifications' => $notifications,
    'customer.markNotificationsRead' => $markNotificationsRead,
    'customer.emailPreferences' => $emailPreferences,
    'customer.updateEmailPreferences' => $updateEmailPreferences,
    'customer.emailStatus' => $emailStatus,
    /* Route-compatible aliases; canonical source names remain above. */
    'session' => $session,
    'sessions' => $sessions,
    'revokeSession' => $revokeSession,
    'notifications' => $notifications,
    'markNotificationsRead' => $markNotificationsRead,
    'emailPreferences' => $emailPreferences,
    'updateEmailPreferences' => $updateEmailPreferences,
    'emailStatus' => $emailStatus,
];

unset(
    $handlers['customer.session'], $handlers['session'],
    $handlers['customer.revokeSession'], $handlers['revokeSession']
);

return $handlers;
