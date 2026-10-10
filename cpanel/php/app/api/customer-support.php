<?php
declare(strict_types=1);

/*
 * Customer support and risk-report API port.
 *
 * Only customer-scoped database operations whose authorization and persistence
 * boundaries are visible in the source are exposed here. Attachment creation
 * remains deferred because this PHP slice has no authoritative external-storage
 * ownership/verification boundary.
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

$cleanString = static function (mixed $value, string $field, int $min, int $max, bool $required = true): ?string {
    if ($value === null && !$required) {
        return null;
    }
    if (!is_string($value)) {
        throw new InvalidArgumentException($field . ' is invalid');
    }
    $value = trim($value);
    $length = strlen($value);
    if (($required && $length < $min) || $length > $max) {
        throw new InvalidArgumentException($field . ' is invalid');
    }
    return $value === '' && !$required ? null : $value;
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

$assertOwnedTicket = static function (PDO $pdo, int $userId, int $ticketId) use ($rows): array {
    $tickets = $rows(
        $pdo,
        'SELECT id,ticketNumber,customerId,subject,category,priority,status,createdAt,updatedAt
         FROM support_tickets WHERE id=? AND customerId=? LIMIT 1',
        [$ticketId, $userId]
    );
    if ($tickets === []) {
        throw new InvalidArgumentException('Ticket not found');
    }
    return $tickets[0];
};

$createRiskReport = static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $requireWrite, $cleanString, $exec, $withTransaction): array {
    $requireWrite($method);
    $userId = $customerId($user);
    $title = $cleanString($input['title'] ?? null, 'title', 3, 200);
    $requestedFor = $cleanString($input['requestedFor'] ?? null, 'requestedFor', 0, 200, false);

    return $withTransaction($pdo, static function () use ($pdo, $exec, $userId, $title, $requestedFor): array {
        $insert = $exec(
            $pdo,
            'INSERT INTO risk_reports (userId,title,requestedFor) VALUES (?,?,?)',
            [$userId, $title, $requestedFor]
        );
        return ['id' => (int)$insert->lastInsertId(), 'status' => 'requested'];
    });
};

$listRiskReports = static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $requireRead, $rows, $withTransaction): array {
    $requireRead($method);
    $userId = $customerId($user);
    return $withTransaction($pdo, static function () use ($pdo, $rows, $userId): array {
        return $rows(
            $pdo,
            'SELECT id,userId,title,requestedFor,status,summary,createdAt,updatedAt
             FROM risk_reports WHERE userId=? ORDER BY createdAt DESC',
            [$userId]
        );
    });
};

$createTicket = static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $requireWrite, $cleanString, $exec, $withTransaction): array {
    $requireWrite($method);
    $userId = $customerId($user);
    $subject = $cleanString($input['subject'] ?? null, 'subject', 3, 200);
    $body = $cleanString($input['body'] ?? null, 'body', 1, 20000);
    $category = $cleanString($input['category'] ?? 'account', 'category', 1, 40);
    $priority = $cleanString($input['priority'] ?? null, 'priority', 1, 16);
    if (!in_array($category, ['account', 'wallet', 'opportunity', 'security', 'technical'], true)) {
        throw new InvalidArgumentException('category is invalid');
    }
    if (!in_array($priority, ['low', 'normal', 'high', 'urgent'], true)) {
        throw new InvalidArgumentException('priority is invalid');
    }

    return $withTransaction($pdo, static function () use ($pdo, $exec, $userId, $subject, $body, $category, $priority): array {
        /* The ticket number is a public reference, not an authentication secret. */
        $ticketNumber = 'ARB-' . strtoupper(base_convert((string)time(), 10, 36)) . '-' . strtoupper(bin2hex(random_bytes(3)));
        $insert = $exec(
            $pdo,
            'INSERT INTO support_tickets (ticketNumber,customerId,subject,category,priority) VALUES (?,?,?,?,?)',
            [$ticketNumber, $userId, $subject, $category, $priority]
        );
        $ticketId = (int)$insert->lastInsertId();
        $exec(
            $pdo,
            'INSERT INTO support_messages (ticketId,authorId,body) VALUES (?,?,?)',
            [$ticketId, $userId, $body]
        );
        return ['ticketId' => $ticketId, 'ticketNumber' => $ticketNumber];
    });
};

$listTickets = static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $requireRead, $rows, $withTransaction): array {
    $requireRead($method);
    $userId = $customerId($user);
    return $withTransaction($pdo, static fn(): array => $rows(
        $pdo,
        'SELECT id,ticketNumber,customerId,subject,category,priority,status,createdAt,updatedAt
         FROM support_tickets WHERE customerId=? ORDER BY updatedAt DESC',
        [$userId]
    ));
};

$listTicketMessages = static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $requireRead, $positiveInt, $assertOwnedTicket, $rows, $withTransaction): array {
    $requireRead($method);
    $userId = $customerId($user);
    $ticketId = $positiveInt($input['ticketId'] ?? null, 'ticketId');
    return $withTransaction($pdo, static function () use ($pdo, $userId, $ticketId, $assertOwnedTicket, $rows): array {
        $assertOwnedTicket($pdo, $userId, $ticketId);
        return $rows(
            $pdo,
            'SELECT m.id,m.ticketId,m.authorId,u.name AS authorName,u.role AS authorRole,m.body,m.createdAt
             FROM support_messages m
             LEFT JOIN users u ON u.id=m.authorId
             WHERE m.ticketId=? ORDER BY m.createdAt ASC',
            [$ticketId]
        );
    });
};

$replyTicket = static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $requireWrite, $positiveInt, $cleanString, $assertOwnedTicket, $exec, $withTransaction): array {
    $requireWrite($method);
    $userId = $customerId($user);
    $ticketId = $positiveInt($input['ticketId'] ?? null, 'ticketId');
    $body = $cleanString($input['body'] ?? null, 'body', 1, 20000);

    return $withTransaction($pdo, static function () use ($pdo, $userId, $ticketId, $body, $assertOwnedTicket, $exec): array {
        $ticket = $assertOwnedTicket($pdo, $userId, $ticketId);
        if ((string)$ticket['status'] === 'closed') {
            throw new InvalidArgumentException('Closed tickets cannot receive customer replies; open a new ticket');
        }
        $exec($pdo, 'INSERT INTO support_messages (ticketId,authorId,body) VALUES (?,?,?)', [$ticketId, $userId, $body]);
        $exec($pdo, 'UPDATE support_tickets SET status=?,updatedAt=UTC_TIMESTAMP() WHERE id=? AND customerId=?', ['open', $ticketId, $userId]);
        return ['success' => true];
    });
};

$getUploadPolicy = static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $requireRead, $rows, $withTransaction): array {
    $requireRead($method);
    $customerId($user);
    return $withTransaction($pdo, static function () use ($pdo, $rows): array {
        $maxRows = $rows($pdo, 'SELECT settingValue FROM app_settings WHERE settingKey=? LIMIT 1', ['ticket.maxAttachmentMb']);
        $max = $maxRows === [] ? 25.0 : (float)$maxRows[0]['settingValue'];
        if (!is_finite($max) || $max <= 0) {
            $max = 25.0;
        }
        $typesRows = $rows($pdo, 'SELECT settingValue FROM app_settings WHERE settingKey=? LIMIT 1', ['ticket.allowedMimeTypes']);
        $types = [];
        if ($typesRows !== []) {
            foreach (explode(',', (string)$typesRows[0]['settingValue']) as $type) {
                $type = trim($type);
                if ($type !== '') {
                    $types[] = $type;
                }
            }
        }
        return ['maxAttachmentMb' => min($max, 100.0), 'allowedMimeTypes' => $types];
    });
};

$handlers = [
    /* Canonical source procedure names. */
    'customer.requestRiskReport' => $createRiskReport,
    'customer.riskReports' => $listRiskReports,
    'customer.createTicket' => $createTicket,
    'customer.tickets' => $listTickets,
    'customer.ticketMessages' => $listTicketMessages,
    'customer.replyTicket' => $replyTicket,
    'customer.uploadPolicy' => $getUploadPolicy,
    /* Route-compatible aliases; canonical source names remain above. */
    'requestRiskReport' => $createRiskReport,
    'riskReports' => $listRiskReports,
    'createTicket' => $createTicket,
    'tickets' => $listTickets,
    'ticketMessages' => $listTicketMessages,
    'replyTicket' => $replyTicket,
    'uploadPolicy' => $getUploadPolicy,
];

return $handlers;
