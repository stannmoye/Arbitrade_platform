<?php
declare(strict_types=1);

/*
 * Customer Stake & Earn API port.  Only the locally verifiable product,
 * wallet-ledger, and position procedures are exposed here.  External
 * execution, OAuth, background workers, and custody operations are absent.
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
        $parsed = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => PHP_INT_MAX]]);
        if ($parsed === false) {
            throw new InvalidArgumentException($field . ' is invalid');
        }
        $number = (int)$parsed;
    } else {
        throw new InvalidArgumentException($field . ' is invalid');
    }
    if ($number <= 0 || $number > PHP_INT_MAX) {
        throw new InvalidArgumentException($field . ' is invalid');
    }
    return $number;
};

$boundedInt = static function (mixed $value, string $field, int $min, int $max): int {
    if (is_int($value)) {
        $number = $value;
    } elseif (is_string($value) && preg_match('/^-?[0-9]+$/', $value) === 1) {
        $parsed = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => $min, 'max_range' => $max]]);
        if ($parsed === false) {
            throw new InvalidArgumentException($field . ' is invalid');
        }
        $number = (int)$parsed;
    } else {
        throw new InvalidArgumentException($field . ' is invalid');
    }
    if ($number < $min || $number > $max) {
        throw new InvalidArgumentException($field . ' is invalid');
    }
    return $number;
};

$idempotencyKey = static function (mixed $value, int $userId): string {
    if (!is_string($value)) {
        throw new InvalidArgumentException('A valid idempotency key is required');
    }
    $value = trim($value);
    if (!preg_match('/^[A-Za-z0-9._:-]{8,160}$/', $value)) {
        throw new InvalidArgumentException('A valid idempotency key is required');
    }
    /* The derived key is internal only and is never returned to the caller. */
    return 'stake:' . $userId . ':' . hash('sha256', $value);
};

$ensureProducts = static function (PDO $pdo) use ($exec): void {
    $productSeed = [
        ['Core Staking', 'CORE_STAKING', 'USD', 620, 30, 10000, 100000000, 'DAILY', 30, 'MODERATE', 1],
        ['Liquidity Provision', 'LIQUIDITY', 'USD', 940, 30, 25000, 100000000, 'WEEKLY', 7, 'ELEVATED', 0],
        ['Stablecoin Lending', 'LENDING', 'USD', 840, 90, 50000, 100000000, 'MONTHLY', 30, 'MODERATE', 1],
        ['Restaking Vault', 'RESTAKING', 'USD', 1120, 180, 100000, 100000000, 'DAILY', 30, 'ELEVATED', 1],
        ['Yield Strategy', 'YIELD', 'USD', 780, 60, 10000, 100000000, 'WEEKLY', 14, 'MODERATE', 1],
        ['Real-World Asset Yield', 'RWA', 'USD', 560, 90, 100000, 100000000, 'MONTHLY', 30, 'LOW', 0],
    ];
    foreach ($productSeed as $product) {
        $exec(
            $pdo,
            "INSERT INTO stake_products
             (name,category,asset,annualRateBps,durationDays,minMinor,maxMinor,rewardFrequency,lockDays,riskLevel,status,supportsCompounding)
             VALUES (?,?,?,?,?,?,?,?,?,?,'AVAILABLE',?)
             ON DUPLICATE KEY UPDATE
               annualRateBps=VALUES(annualRateBps),durationDays=VALUES(durationDays),
               minMinor=VALUES(minMinor),maxMinor=VALUES(maxMinor),
               rewardFrequency=VALUES(rewardFrequency),lockDays=VALUES(lockDays),
               riskLevel=VALUES(riskLevel),status='AVAILABLE',
               supportsCompounding=VALUES(supportsCompounding)",
            $product
        );
    }
};

$frequencyDays = static function (string $frequency): int {
    return $frequency === 'DAILY' ? 1 : ($frequency === 'WEEKLY' ? 7 : 30);
};

$nextRewardAt = static function (DateTimeImmutable $from, string $frequency) use ($frequencyDays): string {
    return $from->modify('+' . $frequencyDays($frequency) . ' days')->format('Y-m-d H:i:s');
};

$rewardFor = static function (int $principal, int $annualRateBps, int $durationDays): int {
    $value = ((float)$principal * (float)$annualRateBps * (float)$durationDays) / (10000.0 * 365.0);
    if (!is_finite($value) || $value < 0 || $value > PHP_INT_MAX) {
        throw new InvalidArgumentException('Projection is outside the supported range');
    }
    return (int)floor($value);
};

$postDueRewards = static function (PDO $pdo, int $userId) use ($rows, $exec, $frequencyDays, $nextRewardAt): void {
    $positions = $rows(
        $pdo,
        "SELECT p.*,sp.annualRateBps,sp.rewardFrequency,sp.name AS productName
         FROM stake_positions p
         JOIN stake_products sp ON sp.id=p.productId
         WHERE p.userId=? AND p.status IN ('ACTIVE','REWARD_ACCRUING')
           AND p.nextRewardAt IS NOT NULL AND p.nextRewardAt<=UTC_TIMESTAMP()
         FOR UPDATE",
        [$userId]
    );
    $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    foreach ($positions as $position) {
        $frequency = (string)$position['rewardFrequency'];
        $periodSeconds = $frequencyDays($frequency) * 86400;
        $nextAt = new DateTimeImmutable((string)$position['nextRewardAt'], new DateTimeZone('UTC'));
        $periods = max(1, (int)floor(($now->getTimestamp() - $nextAt->getTimestamp()) / $periodSeconds) + 1);
        $principal = filter_var($position['principalMinor'] ?? null, FILTER_VALIDATE_INT);
        $annualRate = filter_var($position['annualRateBps'] ?? null, FILTER_VALIDATE_INT);
        $priorReward = filter_var($position['rewardMinor'] ?? null, FILTER_VALIDATE_INT);
        $rewardCount = filter_var($position['rewardCount'] ?? null, FILTER_VALIDATE_INT);
        if ($principal === false || $annualRate === false || $priorReward === false || $rewardCount === false || $principal < 0 || $annualRate < 0 || $priorReward < 0 || $rewardCount < 0) {
            throw new RuntimeException('Invalid stake reward data');
        }
        $rewardDays = $frequency === 'DAILY' ? $periods : $periods * $frequencyDays($frequency);
        $calculated = ((float)$principal * (float)$annualRate * (float)$rewardDays) / (10000.0 * 365.0);
        if (!is_finite($calculated) || $calculated < 0 || $calculated > PHP_INT_MAX) {
            throw new RuntimeException('Stake reward is outside the supported range');
        }
        $reward = max(0, (int)floor($calculated) - $priorReward);
        if ($reward === 0) {
            continue;
        }
        $positionId = (int)$position['id'];
        $asset = strtoupper(trim((string)$position['asset']));
        if ($asset === '') {
            throw new RuntimeException('Invalid stake asset');
        }
        $balance = $rows($pdo, 'SELECT id FROM customer_balances WHERE userId=? AND currency=? LIMIT 1 FOR UPDATE', [$userId, $asset]);
        /* Do not post a reward when its destination wallet cannot be verified. */
        if ($balance === []) {
            continue;
        }
        $reference = 'stake-reward:' . $positionId . ':' . ($rewardCount + 1);
        if ($rows($pdo, 'SELECT id FROM balance_ledger WHERE reference=? LIMIT 1 FOR UPDATE', [$reference]) === []) {
            $exec($pdo, 'INSERT INTO balance_ledger (userId,currency,amountMinor,entryType,reference,withdrawable) VALUES (?,?,?,?,?,?)', [$userId, $asset, $reward, 'stake_reward', $reference, 0]);
            $updated = $exec($pdo, 'UPDATE customer_balances SET availableMinor=availableMinor+?,earnedMinor=earnedMinor+?,updatedAt=UTC_TIMESTAMP() WHERE id=? AND userId=? AND currency=?', [$reward, $reward, (int)$balance[0]['id'], $userId, $asset]);
            if ($updated->rowCount() !== 1) {
                throw new RuntimeException('Stake reward wallet could not be updated');
            }
            $exec($pdo, 'INSERT INTO stake_rewards (positionId,userId,amountMinor,asset,status,calculatedAt,postedAt,ledgerReference) VALUES (?,?,?,?,?,?,?,?)', [$positionId, $userId, $reward, $asset, 'POSTED', gmdate('Y-m-d H:i:s'), gmdate('Y-m-d H:i:s'), $reference]);
            $exec($pdo, 'INSERT INTO stake_events (userId,positionId,eventType,previousState,newState,amountMinor,asset,metadataJson) VALUES (?,?,?,?,?,?,?,?)', [$userId, $positionId, 'reward.posted', 'REWARD_ACCRUING', 'REWARD_ACCRUING', $reward, $asset, json_encode(['ledgerReference' => $reference], JSON_THROW_ON_ERROR)]);
            $exec($pdo, 'INSERT INTO customer_notifications (userId,title,body) VALUES (?,?,?)', [$userId, 'Reward credited', 'A ' . $reward . ' minor-unit reward was posted to your ' . $asset . ' wallet.']);
        }
        $next = $nextRewardAt($nextAt, $frequency);
        $exec($pdo, "UPDATE stake_positions SET rewardMinor=rewardMinor+?,rewardCount=rewardCount+1,status='REWARD_ACCRUING',nextRewardAt=?,updatedAt=UTC_TIMESTAMP() WHERE id=? AND userId=?", [$reward, $next, $positionId, $userId]);
    }
};

$settleDuePositions = static function (PDO $pdo, int $userId) use ($rows, $exec): void {
    $positions = $rows($pdo, "SELECT * FROM stake_positions WHERE userId=? AND status IN ('ACTIVE','REWARD_ACCRUING','SETTLING') AND maturityAt<=UTC_TIMESTAMP() FOR UPDATE", [$userId]);
    foreach ($positions as $position) {
        $positionId = (int)$position['id'];
        $reference = 'stake-settlement:' . $positionId;
        if ($rows($pdo, 'SELECT id FROM balance_ledger WHERE reference=? LIMIT 1 FOR UPDATE', [$reference]) !== []) {
            continue;
        }
        $asset = strtoupper(trim((string)$position['asset']));
        $principal = filter_var($position['principalMinor'] ?? null, FILTER_VALIDATE_INT);
        if ($asset === '' || $principal === false || $principal < 0) {
            throw new RuntimeException('Invalid stake settlement data');
        }
        $balance = $rows($pdo, 'SELECT id FROM customer_balances WHERE userId=? AND currency=? LIMIT 1 FOR UPDATE', [$userId, $asset]);
        /* Principal is not released unless the destination wallet is present. */
        if ($balance === []) {
            continue;
        }
        $exec($pdo, 'INSERT INTO balance_ledger (userId,currency,amountMinor,entryType,reference,withdrawable) VALUES (?,?,?,?,?,?)', [$userId, $asset, $principal, 'stake_principal_release', $reference, 0]);
        $updated = $exec($pdo, 'UPDATE customer_balances SET availableMinor=availableMinor+?,lockedMinor=GREATEST(lockedMinor-?,0),updatedAt=UTC_TIMESTAMP() WHERE id=? AND userId=? AND currency=?', [$principal, $principal, (int)$balance[0]['id'], $userId, $asset]);
        if ($updated->rowCount() !== 1) {
            throw new RuntimeException('Stake settlement wallet could not be updated');
        }
        $exec($pdo, "UPDATE stake_positions SET status='COMPLETED',completedAt=UTC_TIMESTAMP(),updatedAt=UTC_TIMESTAMP() WHERE id=? AND userId=?", [$positionId, $userId]);
        $exec($pdo, 'INSERT INTO stake_events (userId,positionId,eventType,previousState,newState,amountMinor,asset,metadataJson) VALUES (?,?,?,?,?,?,?,?)', [$userId, $positionId, 'position.completed', (string)$position['status'], 'COMPLETED', $principal, $asset, json_encode(['ledgerReference' => $reference], JSON_THROW_ON_ERROR)]);
        $exec($pdo, 'INSERT INTO customer_notifications (userId,title,body) VALUES (?,?,?)', [$userId, 'Funds released', 'Your Stake & Earn position ' . (string)$position['positionCode'] . ' matured and principal was released to your wallet.']);
    }
};

$dashboard = static function (PDO $pdo, int $userId) use ($ensureProducts, $postDueRewards, $settleDuePositions, $rows): array {
    $ensureProducts($pdo);
    $postDueRewards($pdo, $userId);
    $settleDuePositions($pdo, $userId);
    $products = $rows($pdo, "SELECT * FROM stake_products WHERE status='AVAILABLE' ORDER BY FIELD(category,'CORE_STAKING','LIQUIDITY','LENDING','RESTAKING','YIELD','RWA'),id");
    $positions = $rows($pdo, 'SELECT p.*,sp.name AS productName,sp.category,sp.rewardFrequency,sp.annualRateBps,sp.lockDays FROM stake_positions p JOIN stake_products sp ON sp.id=p.productId WHERE p.userId=? ORDER BY p.openedAt DESC', [$userId]);
    $rewards = $rows($pdo, 'SELECT r.*,p.positionCode FROM stake_rewards r JOIN stake_positions p ON p.id=r.positionId WHERE r.userId=? ORDER BY r.postedAt DESC LIMIT 50', [$userId]);
    $events = $rows($pdo, 'SELECT e.*,p.positionCode FROM stake_events e LEFT JOIN stake_positions p ON p.id=e.positionId WHERE e.userId=? ORDER BY e.createdAt DESC LIMIT 50', [$userId]);
    $balances = $rows($pdo, 'SELECT c.code AS currency,c.symbol,c.scale,c.name AS currencyName,COALESCE(b.availableMinor,0) AS availableMinor,COALESCE(b.lockedMinor,0) AS lockedMinor,COALESCE(b.promotionalMinor,0) AS promotionalMinor,COALESCE(b.earnedMinor,0) AS earnedMinor FROM currency_registry c LEFT JOIN customer_balances b ON b.currency=c.code AND b.userId=? WHERE c.enabled=? ORDER BY c.id', [$userId, 1]);
    $ledger = $rows($pdo, "SELECT COALESCE(SUM(CASE WHEN entryType='stake_reward' THEN amountMinor ELSE 0 END),0) AS rewards,COALESCE(SUM(CASE WHEN entryType IN ('stake_allocation','stake_principal_release') THEN -amountMinor ELSE 0 END),0) AS allocated FROM balance_ledger WHERE userId=?", [$userId]);
    $allocatedMinor = 0;
    $activePositions = 0;
    $completedPositions = 0;
    foreach ($positions as $position) {
        $status = (string)$position['status'];
        if (!in_array($status, ['COMPLETED', 'CANCELLED'], true)) {
            $allocatedMinor += (int)$position['principalMinor'];
        }
        if (in_array($status, ['ACTIVE', 'REWARD_ACCRUING', 'PROCESSING', 'PENDING'], true)) {
            $activePositions++;
        }
        if ($status === 'COMPLETED') {
            $completedPositions++;
        }
    }
    return [
        'products' => $products,
        'positions' => $positions,
        'rewards' => $rewards,
        'events' => $events,
        'balances' => $balances,
        'summary' => [
            'allocatedMinor' => $allocatedMinor,
            'rewardsMinor' => (int)($ledger[0]['rewards'] ?? 0),
            'activePositions' => $activePositions,
            'completedPositions' => $completedPositions,
        ],
    ];
};

$handlers = [
    'customer.stakeEarn.dashboard' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $requireRead, $withTransaction, $dashboard): array {
        $requireRead($method);
        $id = $customerId($user);
        return $withTransaction($pdo, static fn(): array => $dashboard($pdo, $id));
    },

    'customer.stakeEarn.allocate' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $requireWrite, $positiveInt, $idempotencyKey, $withTransaction, $rows, $exec, $nextRewardAt): array {
        $requireWrite($method);
        $userId = $customerId($user);
        $productId = $positiveInt($input['productId'] ?? null, 'productId');
        $amountMinor = $positiveInt($input['amountMinor'] ?? null, 'amountMinor');
        $key = $idempotencyKey($input['idempotencyKey'] ?? null, $userId);

        return $withTransaction($pdo, static function () use ($pdo, $userId, $productId, $amountMinor, $key, $rows, $exec, $nextRewardAt): array {
            $prior = $rows($pdo, 'SELECT resultJson FROM v5_idempotency_keys WHERE userId=? AND keyValue=? LIMIT 1 FOR UPDATE', [$userId, $key]);
            if ($prior !== []) {
                if (!is_string($prior[0]['resultJson'] ?? null) || $prior[0]['resultJson'] === '') {
                    throw new RuntimeException('Stored stake result is invalid');
                }
                try {
                    $decoded = json_decode($prior[0]['resultJson'], true, 512, JSON_THROW_ON_ERROR);
                } catch (Throwable) {
                    throw new RuntimeException('Stored stake result is invalid');
                }
                if (!is_array($decoded)) {
                    throw new RuntimeException('Stored stake result is invalid');
                }
                return $decoded;
            }
            $productRows = $rows($pdo, "SELECT * FROM stake_products WHERE id=? AND status='AVAILABLE' FOR UPDATE", [$productId]);
            if ($productRows === []) {
                throw new InvalidArgumentException('Stake product is not available');
            }
            $product = $productRows[0];
            $minMinor = filter_var($product['minMinor'] ?? null, FILTER_VALIDATE_INT);
            $maxMinor = filter_var($product['maxMinor'] ?? null, FILTER_VALIDATE_INT);
            $durationDays = filter_var($product['durationDays'] ?? null, FILTER_VALIDATE_INT);
            if ($minMinor === false || $maxMinor === false || $durationDays === false || $minMinor < 0 || $maxMinor < $minMinor || $durationDays <= 0 || $amountMinor < $minMinor || $amountMinor > $maxMinor) {
                throw new InvalidArgumentException('Allocation amount is outside this product\'s limits');
            }
            $asset = strtoupper(trim((string)($product['asset'] ?? '')));
            $frequency = (string)($product['rewardFrequency'] ?? '');
            if ($asset === '' || !in_array($frequency, ['DAILY', 'WEEKLY', 'MONTHLY'], true)) {
                throw new RuntimeException('Stake product data is invalid');
            }
            $balanceRows = $rows($pdo, 'SELECT * FROM customer_balances WHERE userId=? AND currency=? FOR UPDATE', [$userId, $asset]);
            if ($balanceRows === []) {
                throw new InvalidArgumentException('Insufficient available wallet balance');
            }
            $available = filter_var($balanceRows[0]['availableMinor'] ?? null, FILTER_VALIDATE_INT);
            if ($available === false || $available < $amountMinor) {
                throw new InvalidArgumentException('Insufficient available wallet balance');
            }
            $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
            $maturity = $now->modify('+' . $durationDays . ' days');
            $positionCode = 'STK-' . strtoupper(bin2hex(random_bytes(4)));
            $reference = 'stake-allocation:' . $positionCode;
            $exec($pdo, 'INSERT INTO balance_ledger (userId,currency,amountMinor,entryType,reference,withdrawable) VALUES (?,?,?,?,?,?)', [$userId, $asset, -$amountMinor, 'stake_allocation', $reference, 0]);
            $updated = $exec($pdo, 'UPDATE customer_balances SET availableMinor=availableMinor-?,lockedMinor=lockedMinor+?,updatedAt=UTC_TIMESTAMP() WHERE id=? AND userId=? AND currency=? AND availableMinor>=?', [$amountMinor, $amountMinor, (int)$balanceRows[0]['id'], $userId, $asset, $amountMinor]);
            if ($updated->rowCount() !== 1) {
                throw new RuntimeException('Stake allocation wallet could not be updated');
            }
            $exec($pdo, "INSERT INTO stake_positions (positionCode,userId,productId,asset,principalMinor,rewardMinor,status,openedAt,updatedAt,maturityAt,nextRewardAt,originalLedgerReference) VALUES (?,?,?,?,?,0,'ACTIVE',UTC_TIMESTAMP(),UTC_TIMESTAMP(),?,?,?)", [$positionCode, $userId, (int)$product['id'], $asset, $amountMinor, $maturity->format('Y-m-d H:i:s'), $nextRewardAt($now, $frequency), $reference]);
            $positionId = (int)$pdo->lastInsertId();
            if ($positionId <= 0) {
                throw new RuntimeException('Stake position could not be created');
            }
            $exec($pdo, "INSERT INTO stake_transactions (transactionCode,userId,positionId,type,amountMinor,asset,status,ledgerReference,idempotencyKey) VALUES (?,?,?,?,?,?, 'COMPLETED', ?, ?)", ['TX-' . strtoupper(bin2hex(random_bytes(5))), $userId, $positionId, 'STAKE_ALLOCATION', $amountMinor, $asset, $reference, $key]);
            $exec($pdo, 'INSERT INTO stake_events (userId,positionId,eventType,previousState,newState,amountMinor,asset,metadataJson) VALUES (?,?,?,?,?,?,?,?)', [$userId, $positionId, 'position.created', 'PENDING', 'ACTIVE', $amountMinor, $asset, json_encode(['ledgerReference' => $reference, 'productId' => (int)$product['id']], JSON_THROW_ON_ERROR)]);
            $exec($pdo, 'INSERT INTO customer_notifications (userId,title,body) VALUES (?,?,?)', [$userId, 'Allocation confirmed', 'Your ' . (string)$product['name'] . ' allocation is active. Funds were reserved through the wallet ledger.']);
            $result = ['positionId' => $positionId, 'positionCode' => $positionCode, 'status' => 'ACTIVE', 'asset' => $asset, 'principalMinor' => $amountMinor, 'maturityAt' => $maturity->format('Y-m-d\TH:i:s.v\Z'), 'ledgerReference' => $reference];
            $exec($pdo, 'INSERT INTO v5_idempotency_keys (userId,keyValue,command,resultJson) VALUES (?,?,?,?)', [$userId, $key, 'stake.allocate', json_encode($result, JSON_THROW_ON_ERROR)]);
            return $result;
        });
    },

    'customer.stakeEarn.cancel' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $requireWrite, $positiveInt, $idempotencyKey, $withTransaction, $rows, $exec): array {
        $requireWrite($method);
        $userId = $customerId($user);
        $positionId = $positiveInt($input['positionId'] ?? null, 'positionId');
        $key = $idempotencyKey($input['idempotencyKey'] ?? null, $userId);

        return $withTransaction($pdo, static function () use ($pdo, $userId, $positionId, $key, $rows, $exec): array {
            $prior = $rows($pdo, 'SELECT resultJson FROM v5_idempotency_keys WHERE userId=? AND keyValue=? LIMIT 1 FOR UPDATE', [$userId, $key]);
            if ($prior !== []) {
                if (!is_string($prior[0]['resultJson'] ?? null) || $prior[0]['resultJson'] === '') {
                    throw new RuntimeException('Stored stake result is invalid');
                }
                try {
                    $decoded = json_decode($prior[0]['resultJson'], true, 512, JSON_THROW_ON_ERROR);
                } catch (Throwable) {
                    throw new RuntimeException('Stored stake result is invalid');
                }
                if (!is_array($decoded)) {
                    throw new RuntimeException('Stored stake result is invalid');
                }
                return $decoded;
            }
            $positionRows = $rows($pdo, 'SELECT * FROM stake_positions WHERE id=? AND userId=? FOR UPDATE', [$positionId, $userId]);
            if ($positionRows === [] || !in_array((string)$positionRows[0]['status'], ['ACTIVE', 'REWARD_ACCRUING'], true)) {
                throw new InvalidArgumentException('This position cannot be cancelled');
            }
            $position = $positionRows[0];
            $maturity = new DateTimeImmutable((string)$position['maturityAt'], new DateTimeZone('UTC'));
            if ($maturity->getTimestamp() < time()) {
                throw new InvalidArgumentException('Matured positions must be settled');
            }
            $asset = strtoupper(trim((string)$position['asset']));
            $principal = filter_var($position['principalMinor'] ?? null, FILTER_VALIDATE_INT);
            if ($asset === '' || $principal === false || $principal < 0) {
                throw new RuntimeException('Invalid stake cancellation data');
            }
            $balanceRows = $rows($pdo, 'SELECT id FROM customer_balances WHERE userId=? AND currency=? LIMIT 1 FOR UPDATE', [$userId, $asset]);
            if ($balanceRows === []) {
                throw new RuntimeException('Stake cancellation wallet could not be verified');
            }
            $reference = 'stake-cancellation:' . $positionId;
            if ($rows($pdo, 'SELECT id FROM balance_ledger WHERE reference=? LIMIT 1 FOR UPDATE', [$reference]) !== []) {
                throw new RuntimeException('Stake cancellation was already posted');
            }
            $exec($pdo, 'INSERT INTO balance_ledger (userId,currency,amountMinor,entryType,reference,withdrawable) VALUES (?,?,?,?,?,?)', [$userId, $asset, $principal, 'stake_cancellation_release', $reference, 0]);
            $updated = $exec($pdo, 'UPDATE customer_balances SET availableMinor=availableMinor+?,lockedMinor=GREATEST(lockedMinor-?,0),updatedAt=UTC_TIMESTAMP() WHERE id=? AND userId=? AND currency=?', [$principal, $principal, (int)$balanceRows[0]['id'], $userId, $asset]);
            if ($updated->rowCount() !== 1) {
                throw new RuntimeException('Stake cancellation wallet could not be updated');
            }
            $exec($pdo, "UPDATE stake_positions SET status='CANCELLED',completedAt=UTC_TIMESTAMP(),updatedAt=UTC_TIMESTAMP() WHERE id=? AND userId=?", [$positionId, $userId]);
            $exec($pdo, 'INSERT INTO stake_events (userId,positionId,eventType,previousState,newState,amountMinor,asset,metadataJson) VALUES (?,?,?,?,?,?,?,?)', [$userId, $positionId, 'position.cancelled', (string)$position['status'], 'CANCELLED', $principal, $asset, json_encode(['ledgerReference' => $reference], JSON_THROW_ON_ERROR)]);
            $result = ['positionId' => $positionId, 'status' => 'CANCELLED', 'ledgerReference' => $reference];
            $exec($pdo, 'INSERT INTO v5_idempotency_keys (userId,keyValue,command,resultJson) VALUES (?,?,?,?)', [$userId, $key, 'stake.cancel', json_encode($result, JSON_THROW_ON_ERROR)]);
            return $result;
        });
    },

    'customer.stakeEarn.project' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $requireRead, $positiveInt, $boundedInt, $rewardFor): array {
        $requireRead($method);
        $customerId($user);
        $amountMinor = $positiveInt($input['amountMinor'] ?? null, 'amountMinor');
        $annualRateBps = $boundedInt($input['annualRateBps'] ?? null, 'annualRateBps', 0, 100000);
        $durationDays = $positiveInt($input['durationDays'] ?? null, 'durationDays');
        if (array_key_exists('compounding', $input) && !is_bool($input['compounding'])) {
            throw new InvalidArgumentException('compounding is invalid');
        }
        $reward = $rewardFor($amountMinor, $annualRateBps, $durationDays);
        if ($amountMinor > PHP_INT_MAX - $reward) {
            throw new InvalidArgumentException('Projection is outside the supported range');
        }
        return ['projectedRewardMinor' => $reward, 'projectedEndingMinor' => $amountMinor + $reward, 'estimatedFeesMinor' => 0, 'isProjection' => true];
    },
];

$handlers = [];

return $handlers;
