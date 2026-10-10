<?php
declare(strict_types=1);

/*
 * Customer wallet API port.
 *
 * This module deliberately exposes only the source wallet balance/preferences
 * procedures. Funding, withdrawal, custody, OAuth, provider, and investment
 * execution flows remain absent until their authoritative providers are wired.
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

$cleanString = static function (mixed $value, string $field, int $min, int $max): string {
    if (!is_string($value)) {
        throw new InvalidArgumentException($field . ' is invalid');
    }
    $value = trim($value);
    $length = strlen($value);
    if ($length < $min || $length > $max) {
        throw new InvalidArgumentException($field . ' is invalid');
    }
    return $value;
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

$ensureWalletPreferences = static function (PDO $pdo, int $userId) use ($rows, $exec): array {
    $found = $rows(
        $pdo,
        'SELECT id,userId,tradingCurrency,swapCurrency,autoTopUpEnabled,withdrawalWhitelistEnabled,updatedAt
         FROM customer_wallet_preferences WHERE userId=? LIMIT 1',
        [$userId]
    );
    if ($found === []) {
        /* The unique userId constraint makes this initialization idempotent. */
        $exec(
            $pdo,
            'INSERT INTO customer_wallet_preferences (userId) VALUES (?)
             ON DUPLICATE KEY UPDATE userId=VALUES(userId)',
            [$userId]
        );
        $found = $rows(
            $pdo,
            'SELECT id,userId,tradingCurrency,swapCurrency,autoTopUpEnabled,withdrawalWhitelistEnabled,updatedAt
             FROM customer_wallet_preferences WHERE userId=? LIMIT 1',
            [$userId]
        );
    }
    if ($found === []) {
        throw new RuntimeException('Wallet preferences could not be loaded');
    }
    return $found[0];
};

$normalisePreference = static function (array $row): array {
    return [
        'id' => (int)$row['id'],
        'userId' => (int)$row['userId'],
        'tradingCurrency' => (string)$row['tradingCurrency'],
        'swapCurrency' => (string)$row['swapCurrency'],
        'autoTopUpEnabled' => (bool)$row['autoTopUpEnabled'],
        'withdrawalWhitelistEnabled' => (bool)$row['withdrawalWhitelistEnabled'],
        'updatedAt' => $row['updatedAt'] ?? null,
    ];
};

/*
 * Mirrors the authoritative source settlement boundary used by
 * getCustomerBalanceSummary. It only settles due, confirmed positions for the
 * authenticated customer, writes both ledger entries before changing a
 * balance, and never creates a balance or credits a missing wallet currency.
 */
$settleDueTrades = static function (PDO $pdo, int $userId) use ($rows, $exec): void {
    $due = $rows(
        $pdo,
        'SELECT id,currency,principalMinor,expectedRewardMinor
         FROM trade_positions
         WHERE userId=? AND status=?
           AND (creditAt<=UTC_TIMESTAMP()
                OR (creditAt IS NULL AND settlesAt<=UTC_TIMESTAMP()))
         FOR UPDATE',
        [$userId, 'confirmed']
    );

    foreach ($due as $trade) {
        $tradeId = (int)$trade['id'];
        $reference = 'trade-settlement:' . $tradeId;
        $existing = $rows(
            $pdo,
            'SELECT id FROM balance_ledger WHERE reference=? LIMIT 1 FOR UPDATE',
            [$reference]
        );
        if ($existing !== []) {
            continue;
        }

        $currency = strtoupper(trim((string)$trade['currency']));
        $principal = filter_var($trade['principalMinor'], FILTER_VALIDATE_INT);
        $reward = filter_var($trade['expectedRewardMinor'], FILTER_VALIDATE_INT);
        if ($currency === '' || $principal === false || $reward === false || $principal < 0 || $reward < 0) {
            throw new RuntimeException('Invalid trade settlement data');
        }
        $total = $principal + $reward;
        if ($total < $principal) {
            throw new RuntimeException('Trade settlement amount overflow');
        }

        $balance = $rows(
            $pdo,
            'SELECT id FROM customer_balances WHERE userId=? AND currency=? LIMIT 1 FOR UPDATE',
            [$userId, $currency]
        );
        /* Match the source: a settlement is not posted into an absent wallet. */
        if ($balance === []) {
            continue;
        }
        $balanceId = (int)$balance[0]['id'];

        $exec(
            $pdo,
            'INSERT INTO balance_ledger
             (userId,currency,amountMinor,entryType,reference,withdrawable)
             VALUES (?,?,?,?,?,?)',
            [$userId, $currency, $principal, 'trade_principal_release', $reference, 0]
        );
        $exec(
            $pdo,
            'INSERT INTO balance_ledger
             (userId,currency,amountMinor,entryType,reference,withdrawable)
             VALUES (?,?,?,?,?,?)',
            [$userId, $currency, $reward, 'trade_reward', $reference . ':reward', 0]
        );
        $exec(
            $pdo,
            'UPDATE customer_balances
             SET availableMinor=availableMinor+?,
                 lockedMinor=GREATEST(lockedMinor-?,0),
                 earnedMinor=earnedMinor+?,
                 updatedAt=UTC_TIMESTAMP()
             WHERE id=? AND userId=?',
            [$total, $principal, $reward, $balanceId, $userId]
        );
        $exec(
            $pdo,
            'UPDATE trade_positions
             SET status=?,settledAt=UTC_TIMESTAMP()
             WHERE id=? AND userId=? AND status=?',
            ['settled', $tradeId, $userId, 'confirmed']
        );
    }
};

$listCurrencies = static function (PDO $pdo) use ($rows, $exec): array {
    $currencyRows = $rows(
        $pdo,
        'SELECT id,code,name,symbol,scale,assetType,usdRate,rateProvider,externalCode,enabled,createdAt,updatedAt
         FROM currency_registry WHERE enabled=? ORDER BY id ASC',
        [1]
    );
    if ($currencyRows === []) {
        /* These are the source registry defaults, not synthetic wallet funds. */
        $defaults = [
            ['USD', 'US Dollar', '$', 2, 'fiat', '1', 'manual', 'USD'],
            ['EUR', 'Euro', '€', 2, 'fiat', '1.08', 'manual', 'EUR'],
            ['GBP', 'British Pound', '£', 2, 'fiat', '1.27', 'manual', 'GBP'],
            ['BTC', 'Bitcoin', '₿', 8, 'crypto', '65000', 'manual', 'BTC'],
            ['ETH', 'Ethereum', 'Ξ', 8, 'crypto', '3500', 'manual', 'ETH'],
        ];
        foreach ($defaults as $currency) {
            $exec(
                $pdo,
                'INSERT INTO currency_registry
                 (code,name,symbol,scale,assetType,usdRate,rateProvider,externalCode,enabled)
                 VALUES (?,?,?,?,?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE
                   name=VALUES(name),symbol=VALUES(symbol),scale=VALUES(scale),
                   usdRate=VALUES(usdRate),enabled=VALUES(enabled)',
                [$currency[0], $currency[1], $currency[2], $currency[3], $currency[4], $currency[5], $currency[6], $currency[7], 1]
            );
        }
        $currencyRows = $rows(
            $pdo,
            'SELECT id,code,name,symbol,scale,assetType,usdRate,rateProvider,externalCode,enabled,createdAt,updatedAt
             FROM currency_registry WHERE enabled=? ORDER BY id ASC',
            [1]
        );
    }
    return $currencyRows;
};

$balanceSummary = static function (PDO $pdo, int $userId) use ($listCurrencies, $rows, $settleDueTrades): array {
    $settleDueTrades($pdo, $userId);

    $currencyRows = $listCurrencies($pdo);
    $balanceRows = $rows(
        $pdo,
        'SELECT id,userId,currency,availableMinor,lockedMinor,promotionalMinor,earnedMinor,updatedAt
         FROM customer_balances WHERE userId=? ORDER BY id ASC',
        [$userId]
    );

    $byCurrency = [];
    foreach ($balanceRows as $balance) {
        $byCurrency[(string)$balance['currency']] = [
            'id' => (int)$balance['id'],
            'userId' => (int)$balance['userId'],
            'currency' => (string)$balance['currency'],
            'availableMinor' => (int)$balance['availableMinor'],
            'lockedMinor' => (int)$balance['lockedMinor'],
            'promotionalMinor' => (int)$balance['promotionalMinor'],
            'earnedMinor' => (int)$balance['earnedMinor'],
            'updatedAt' => $balance['updatedAt'] ?? null,
        ];
    }

    $balances = [];
    $availableUsd = 0.0;
    $lockedUsd = 0.0;
    $promotionalUsd = 0.0;
    $earnedUsd = 0.0;
    foreach ($currencyRows as $currency) {
        $code = (string)$currency['code'];
        $balance = $byCurrency[$code] ?? [
            'id' => 0,
            'userId' => $userId,
            'currency' => $code,
            'availableMinor' => 0,
            'lockedMinor' => 0,
            'promotionalMinor' => 0,
            'earnedMinor' => 0,
            'updatedAt' => null,
        ];
        $balances[] = $balance;

        $scale = (int)$currency['scale'];
        $rate = is_numeric($currency['usdRate']) ? (float)$currency['usdRate'] : 0.0;
        $factor = 10 ** max(0, $scale);
        $availableUsd += ($balance['availableMinor'] / $factor) * $rate;
        $lockedUsd += ($balance['lockedMinor'] / $factor) * $rate;
        $promotionalUsd += ($balance['promotionalMinor'] / $factor) * $rate;
        $earnedUsd += ($balance['earnedMinor'] / $factor) * $rate;
    }

    $currencies = array_map(static function (array $currency): array {
        return [
            'id' => (int)$currency['id'],
            'code' => (string)$currency['code'],
            'name' => (string)$currency['name'],
            'symbol' => (string)$currency['symbol'],
            'scale' => (int)$currency['scale'],
            'assetType' => (string)$currency['assetType'],
            'usdRate' => (string)$currency['usdRate'],
            'rateProvider' => (string)$currency['rateProvider'],
            'externalCode' => $currency['externalCode'] ?? null,
            'enabled' => (bool)$currency['enabled'],
            'createdAt' => $currency['createdAt'] ?? null,
            'updatedAt' => $currency['updatedAt'] ?? null,
        ];
    }, $currencyRows);

    return [
        'balances' => $balances,
        'currencies' => $currencies,
        'summary' => [
            'availableUsd' => $availableUsd,
            'lockedUsd' => $lockedUsd,
            'promotionalUsd' => $promotionalUsd,
            'earnedUsd' => $earnedUsd,
            'totalUsd' => $availableUsd + $lockedUsd,
        ],
    ];
};

$handlers = [
    'customer.balances' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $withTransaction, $balanceSummary): array {
        if ($method !== 'GET') {
            throw new InvalidArgumentException('GET is required');
        }
        $id = $customerId($user);
        return $withTransaction($pdo, static fn(): array => $balanceSummary($pdo, $id));
    },

    'customer.walletPreferences' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $withTransaction, $ensureWalletPreferences, $normalisePreference): array {
        if ($method !== 'GET') {
            throw new InvalidArgumentException('GET is required');
        }
        $id = $customerId($user);
        return $withTransaction($pdo, static fn(): array => $normalisePreference($ensureWalletPreferences($pdo, $id)));
    },

    'customer.updateWalletPreferences' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $withTransaction, $ensureWalletPreferences, $normalisePreference, $cleanString, $optionalBoolean, $exec): array {
        if (!in_array($method, ['POST', 'PUT', 'PATCH'], true)) {
            throw new InvalidArgumentException('A write method is required');
        }
        $id = $customerId($user);
        $values = [];
        if (array_key_exists('tradingCurrency', $input)) {
            $values['tradingCurrency'] = strtoupper($cleanString($input['tradingCurrency'], 'tradingCurrency', 2, 32));
        }
        if (array_key_exists('swapCurrency', $input)) {
            $values['swapCurrency'] = strtoupper($cleanString($input['swapCurrency'], 'swapCurrency', 2, 32));
        }
        $autoTopUp = $optionalBoolean($input, 'autoTopUpEnabled');
        if ($autoTopUp !== null) {
            $values['autoTopUpEnabled'] = $autoTopUp ? 1 : 0;
        }
        $whitelist = $optionalBoolean($input, 'withdrawalWhitelistEnabled');
        if ($whitelist !== null) {
            $values['withdrawalWhitelistEnabled'] = $whitelist ? 1 : 0;
        }

        return $withTransaction($pdo, static function () use ($pdo, $id, $values, $ensureWalletPreferences, $normalisePreference, $exec): array {
            $ensureWalletPreferences($pdo, $id);
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
                    'UPDATE customer_wallet_preferences SET ' . implode(',', $assignments) . ' WHERE userId=?',
                    array_merge($params, [$id])
                );
            }
            return $normalisePreference($ensureWalletPreferences($pdo, $id));
        });
    },
];

$readOnlyBalanceSummary = static function (PDO $pdo, int $userId) use ($rows): array {
    $currencies = $rows(
        $pdo,
        'SELECT id,code,name,symbol,scale,assetType,usdRate,rateProvider,updatedAt
         FROM currency_registry WHERE enabled=? ORDER BY id ASC',
        [1]
    );
    $walletRows = $rows(
        $pdo,
        'SELECT id,userId,currency,availableMinor,lockedMinor,promotionalMinor,earnedMinor,updatedAt
         FROM customer_balances WHERE userId=? ORDER BY id ASC',
        [$userId]
    );
    $byCurrency = [];
    foreach ($walletRows as $wallet) {
        $byCurrency[(string)$wallet['currency']] = $wallet;
    }
    $balances = [];
    $availableUsd = 0.0;
    $lockedUsd = 0.0;
    $promotionalUsd = 0.0;
    $earnedUsd = 0.0;
    foreach ($currencies as $currency) {
        $code = (string)$currency['code'];
        $wallet = $byCurrency[$code] ?? [
            'id' => 0,
            'userId' => $userId,
            'currency' => $code,
            'availableMinor' => 0,
            'lockedMinor' => 0,
            'promotionalMinor' => 0,
            'earnedMinor' => 0,
            'updatedAt' => null,
        ];
        $wallet = [
            'id' => (int)$wallet['id'],
            'userId' => (int)$wallet['userId'],
            'currency' => $code,
            'availableMinor' => (int)$wallet['availableMinor'],
            'lockedMinor' => (int)$wallet['lockedMinor'],
            'promotionalMinor' => (int)$wallet['promotionalMinor'],
            'earnedMinor' => (int)$wallet['earnedMinor'],
            'updatedAt' => $wallet['updatedAt'] ?? null,
        ];
        $balances[] = $wallet;
        $scale = max(0, min(18, (int)$currency['scale']));
        $rate = is_numeric($currency['usdRate']) ? (float)$currency['usdRate'] : 0.0;
        if (is_finite($rate) && $rate > 0) {
            $factor = 10 ** $scale;
            $availableUsd += ($wallet['availableMinor'] / $factor) * $rate;
            $lockedUsd += ($wallet['lockedMinor'] / $factor) * $rate;
            $promotionalUsd += ($wallet['promotionalMinor'] / $factor) * $rate;
            $earnedUsd += ($wallet['earnedMinor'] / $factor) * $rate;
        }
    }
    return [
        'balances' => $balances,
        'currencies' => $currencies,
        'summary' => [
            'availableUsd' => $availableUsd,
            'lockedUsd' => $lockedUsd,
            'promotionalUsd' => $promotionalUsd,
            'earnedUsd' => $earnedUsd,
            'totalUsd' => $availableUsd + $lockedUsd,
        ],
    ];
};

$readOnlyBalancesHandler = static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $withTransaction, $readOnlyBalanceSummary): array {
    if ($method !== 'GET') {
        throw new InvalidArgumentException('GET is required');
    }
    $id = $customerId($user);
    return $withTransaction($pdo, static fn(): array => $readOnlyBalanceSummary($pdo, $id));
};
$handlers['customer.balances'] = $readOnlyBalancesHandler;
$handlers['balances'] = $readOnlyBalancesHandler;

return $handlers;
