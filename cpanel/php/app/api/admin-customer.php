<?php
declare(strict_types=1);

/*
 * Administrator customer and treasury API port.
 *
 * The dispatcher authorizes admin-* modules and enforces CSRF for writes.  This
 * module keeps a second role check at the handler boundary, uses prepared SQL,
 * and only posts wallet entries through the verified balance/ledger transaction
 * used by the source adjustCustomerBalance procedure.  OAuth, email/background
 * work, external storage, and destructive customer deletion are not ported.
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

$adminId = static function (?array $user): int {
    if (($user['role'] ?? null) !== 'admin') {
        throw new InvalidArgumentException('Administrator access required');
    }
    $id = filter_var($user['id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    if ($id === false) {
        throw new InvalidArgumentException('Administrator access required');
    }
    return (int)$id;
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

$positiveInt = static function (mixed $value, string $field, int $max = 2147483647): int {
    if (is_int($value)) {
        $number = $value;
    } elseif (is_string($value) && preg_match('/^[0-9]+$/', $value) === 1) {
        $parsed = filter_var($value, FILTER_VALIDATE_INT);
        if ($parsed === false) {
            throw new InvalidArgumentException($field . ' is invalid');
        }
        $number = (int)$parsed;
    } else {
        throw new InvalidArgumentException($field . ' is invalid');
    }
    if ($number <= 0 || $number > $max) {
        throw new InvalidArgumentException($field . ' is invalid');
    }
    return $number;
};

$nonNegativeInt = static function (mixed $value, string $field, int $max = 2147483647): int {
    if (is_int($value)) {
        $number = $value;
    } elseif (is_string($value) && preg_match('/^[0-9]+$/', $value) === 1) {
        $parsed = filter_var($value, FILTER_VALIDATE_INT);
        if ($parsed === false) {
            throw new InvalidArgumentException($field . ' is invalid');
        }
        $number = (int)$parsed;
    } else {
        throw new InvalidArgumentException($field . ' is invalid');
    }
    if ($number < 0 || $number > $max) {
        throw new InvalidArgumentException($field . ' is invalid');
    }
    return $number;
};

$cleanString = static function (mixed $value, string $field, int $min, int $max): string {
    if (!is_string($value)) {
        throw new InvalidArgumentException($field . ' is invalid');
    }
    $value = trim($value);
    if (strlen($value) < $min || strlen($value) > $max) {
        throw new InvalidArgumentException($field . ' is invalid');
    }
    return $value;
};

$boolean = static function (mixed $value, string $field): bool {
    if (!is_bool($value)) {
        throw new InvalidArgumentException($field . ' is invalid');
    }
    return $value;
};

$email = static function (mixed $value): string {
    if (!is_string($value)) {
        throw new InvalidArgumentException('email is invalid');
    }
    $value = strtolower(trim($value));
    if (strlen($value) > 320 || filter_var($value, FILTER_VALIDATE_EMAIL) === false) {
        throw new InvalidArgumentException('email is invalid');
    }
    return $value;
};

$packageName = static function (mixed $value) use ($cleanString): string {
    $value = $cleanString($value, 'packageName', 1, 40);
    if (preg_match('/^[A-Za-z0-9][A-Za-z0-9 _+\-]*$/', $value) !== 1) {
        throw new InvalidArgumentException('packageName is invalid');
    }
    return $value;
};

$normaliseCustomer = static function (array $row): array {
    return [
        'id' => (int)$row['id'],
        'name' => (string)($row['name'] ?? $row['email'] ?? 'Customer'),
        'email' => (string)($row['email'] ?? ''),
        'package' => (string)($row['packageName'] ?? 'Starter'),
        'group' => (string)($row['packageName'] ?? 'Starter'),
        'status' => (string)($row['accountStatus'] ?? 'active'),
        'accountState' => (string)($row['accountStatus'] ?? 'active'),
        'opportunities' => 'Database delivery',
        'opportunitiesEnabled' => (bool)($row['opportunitiesEnabled'] ?? true),
        'autoTradeMode' => (string)($row['autoTradeMode'] ?? 'inherit'),
        'autoTradeEnabled' => (bool)($row['autoTradeEnabled'] ?? false),
        'autoTradeEffectiveEnabled' => (bool)($row['autoTradeEffectiveEnabled'] ?? false),
        'limit' => (int)($row['dailyTradeLimitMinor'] ?? 2500000),
        'kyc' => (bool)($row['kycRequired'] ?? true),
        'withdrawals' => (bool)($row['withdrawalsEnabled'] ?? false),
        'twofa' => (bool)($row['twoFactorRequired'] ?? false),
        'facial' => false,
        'tradingEnabled' => (bool)($row['tradingEnabled'] ?? true),
        'emailVerified' => (bool)($row['emailVerified'] ?? false),
        'riskTier' => (string)($row['riskTier'] ?? 'standard'),
        'adminNote' => (string)($row['adminNote'] ?? ''),
        'createdAt' => $row['createdAt'] ?? null,
    ];
};

$getSetting = static function (PDO $pdo, string $key, string $default) use ($rows): string {
    $found = $rows($pdo, 'SELECT settingValue FROM app_settings WHERE settingKey=? LIMIT 1', [$key]);
    return $found === [] ? $default : (string)$found[0]['settingValue'];
};

$enabledPackage = static function (PDO $pdo, string $name) use ($rows): void {
    $found = $rows($pdo, 'SELECT id FROM opportunity_package_policies WHERE packageName=? AND enabled=? LIMIT 1', [$name, 1]);
    if ($found === []) {
        throw new InvalidArgumentException('Package is not configured or enabled');
    }
};

$listCurrencies = static function (PDO $pdo) use ($rows, $exec): array {
    $found = $rows($pdo, 'SELECT id,code,name,symbol,scale,assetType,usdRate,rateProvider,externalCode,enabled,createdAt,updatedAt FROM currency_registry WHERE enabled=? ORDER BY id ASC', [1]);
    if ($found !== []) {
        return $found;
    }
    /* These are the source registry defaults; they do not create wallet funds. */
    $defaults = [
        ['USD', 'US Dollar', '$', 2, 'fiat', '1', 'manual', 'USD'],
        ['EUR', 'Euro', '€', 2, 'fiat', '1.08', 'manual', 'EUR'],
        ['GBP', 'British Pound', '£', 2, 'fiat', '1.27', 'manual', 'GBP'],
        ['BTC', 'Bitcoin', '₿', 8, 'crypto', '65000', 'manual', 'BTC'],
        ['ETH', 'Ethereum', 'Ξ', 8, 'crypto', '3500', 'manual', 'ETH'],
    ];
    foreach ($defaults as $currency) {
        $exec($pdo, 'INSERT INTO currency_registry (code,name,symbol,scale,assetType,usdRate,rateProvider,externalCode,enabled) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),symbol=VALUES(symbol),scale=VALUES(scale),usdRate=VALUES(usdRate),enabled=VALUES(enabled)', array_merge($currency, [1]));
    }
    return $rows($pdo, 'SELECT id,code,name,symbol,scale,assetType,usdRate,rateProvider,externalCode,enabled,createdAt,updatedAt FROM currency_registry WHERE enabled=? ORDER BY id ASC', [1]);
};

$listCustomers = static function (PDO $pdo) use ($rows, $getSetting, $normaliseCustomer): array {
    $global = strtolower($getSetting($pdo, 'autoTrade.globalEnabled', 'false')) === 'true';
    $found = $rows(
        $pdo,
        'SELECT u.id,u.name,u.email,u.packageName,u.role,u.createdAt,
                c.accountStatus,c.tradingEnabled,c.opportunitiesEnabled,c.autoTradeMode,
                c.autoTradeEnabled,c.withdrawalsEnabled,c.kycRequired,c.twoFactorRequired,
                c.dailyTradeLimitMinor,c.emailVerified,c.riskTier,c.adminNote
         FROM users u LEFT JOIN customer_controls c ON c.userId=u.id
         WHERE u.role=? ORDER BY u.createdAt DESC',
        ['user']
    );
    foreach ($found as &$row) {
        $mode = (string)($row['autoTradeMode'] ?? 'inherit');
        $effective = $mode === 'enabled' || ($mode === 'inherit' && $global);
        $row['autoTradeEnabled'] = $effective;
        $row['autoTradeEffectiveEnabled'] = $effective;
    }
    unset($row);
    return array_map($normaliseCustomer, $found);
};

$handlers = [
    'adminOperations.customers' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($adminId, $requireRead, $withTransaction, $listCustomers): array {
        $requireRead($method);
        $adminId($user);
        return $withTransaction($pdo, static fn(): array => $listCustomers($pdo));
    },

    'adminOperations.audit' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($adminId, $requireRead, $withTransaction, $rows): array {
        $requireRead($method);
        $adminId($user);
        return $withTransaction($pdo, static function () use ($pdo, $rows): array {
            /* metadataJson is intentionally omitted: audit metadata can contain secrets. */
            return $rows($pdo, 'SELECT id,actorUserId,action,entityType,entityId,reason,reference,createdAt FROM v5_audit_events ORDER BY createdAt DESC LIMIT 200');
        });
    },

    'adminOperations.ledgerActivity' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($adminId, $requireRead, $withTransaction, $rows, $positiveInt): array {
        $requireRead($method);
        $adminId($user);
        $limit = array_key_exists('limit', $input) ? $positiveInt($input['limit'], 'limit', 500) : 150;
        return $withTransaction($pdo, static fn(): array => $rows($pdo, 'SELECT l.id,l.userId,u.name AS customerName,u.email AS customerEmail,l.currency,l.amountMinor,l.entryType,l.withdrawable,l.createdAt FROM balance_ledger l LEFT JOIN users u ON u.id=l.userId ORDER BY l.createdAt DESC LIMIT ' . $limit));
    },

    'adminOperations.autoTradePolicy' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($adminId, $requireRead, $withTransaction, $getSetting): array {
        $requireRead($method);
        $adminId($user);
        return $withTransaction($pdo, static fn(): array => ['globalEnabled' => strtolower($getSetting($pdo, 'autoTrade.globalEnabled', 'false')) === 'true']);
    },

    'adminOperations.updateAutoTradePolicy' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($adminId, $requireWrite, $withTransaction, $boolean, $exec, $getSetting): array {
        $actor = $adminId($user);
        $requireWrite($method);
        if (!array_key_exists('globalEnabled', $input)) {
            throw new InvalidArgumentException('globalEnabled is required');
        }
        $enabled = $boolean($input['globalEnabled'], 'globalEnabled');
        return $withTransaction($pdo, static function () use ($pdo, $actor, $enabled, $exec, $getSetting): array {
            $exec($pdo, 'INSERT INTO app_settings (settingKey,settingValue,updatedBy) VALUES (?,?,?) ON DUPLICATE KEY UPDATE settingValue=VALUES(settingValue),updatedBy=VALUES(updatedBy),updatedAt=UTC_TIMESTAMP()', ['autoTrade.globalEnabled', $enabled ? 'true' : 'false', $actor]);
            return ['globalEnabled' => strtolower($getSetting($pdo, 'autoTrade.globalEnabled', 'false')) === 'true'];
        });
    },

    'adminOperations.customerBalances' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($adminId, $requireRead, $positiveInt, $withTransaction, $rows, $listCurrencies): array {
        $requireRead($method);
        $adminId($user);
        $userId = $positiveInt($input['userId'] ?? null, 'userId');
        return $withTransaction($pdo, static function () use ($pdo, $userId, $rows, $listCurrencies): array {
            $existing = [];
            foreach ($rows($pdo, 'SELECT id,userId,currency,availableMinor,lockedMinor,promotionalMinor,earnedMinor,updatedAt FROM customer_balances WHERE userId=?', [$userId]) as $balance) {
                $existing[(string)$balance['currency']] = $balance;
            }
            $result = [];
            foreach ($listCurrencies($pdo) as $currency) {
                $code = (string)$currency['code'];
                $row = $existing[$code] ?? ['id' => 0, 'userId' => $userId, 'currency' => $code, 'availableMinor' => 0, 'lockedMinor' => 0, 'promotionalMinor' => 0, 'earnedMinor' => 0, 'updatedAt' => null];
                $result[] = ['id' => (int)$row['id'], 'userId' => (int)$row['userId'], 'currency' => $code, 'availableMinor' => (int)$row['availableMinor'], 'lockedMinor' => (int)$row['lockedMinor'], 'promotionalMinor' => (int)$row['promotionalMinor'], 'earnedMinor' => (int)$row['earnedMinor'], 'updatedAt' => $row['updatedAt'] ?? null];
            }
            return $result;
        });
    },

    'adminOperations.currencies' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($adminId, $requireRead, $withTransaction, $listCurrencies): array {
        $requireRead($method);
        $adminId($user);
        return $withTransaction($pdo, static fn(): array => $listCurrencies($pdo));
    },

    'adminOperations.upsertCurrency' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($adminId, $requireWrite, $withTransaction, $cleanString, $nonNegativeInt, $boolean, $exec, $rows): array {
        $adminId($user);
        $requireWrite($method);
        $code = strtoupper($cleanString($input['code'] ?? null, 'code', 2, 32));
        if (preg_match('/^[A-Z0-9._-]+$/', $code) !== 1) {
            throw new InvalidArgumentException('Currency code must be 2-32 letters or numbers');
        }
        $name = $cleanString($input['name'] ?? null, 'name', 2, 120);
        $symbol = $cleanString($input['symbol'] ?? null, 'symbol', 1, 16);
        $scale = $nonNegativeInt($input['scale'] ?? null, 'scale', 18);
        $assetType = $cleanString($input['assetType'] ?? null, 'assetType', 1, 10);
        if (!in_array($assetType, ['fiat', 'crypto', 'token'], true)) {
            throw new InvalidArgumentException('assetType is invalid');
        }
        $usdRate = $cleanString($input['usdRate'] ?? null, 'usdRate', 1, 64);
        if (preg_match('/^[0-9]+(?:\.[0-9]+)?$/', $usdRate) !== 1 || (float)$usdRate <= 0 || !is_finite((float)$usdRate)) {
            throw new InvalidArgumentException('USD rate must be a positive decimal');
        }
        $rateProvider = $cleanString($input['rateProvider'] ?? null, 'rateProvider', 1, 120);
        $externalCode = array_key_exists('externalCode', $input) && $input['externalCode'] !== null ? $cleanString($input['externalCode'], 'externalCode', 1, 80) : null;
        $enabled = array_key_exists('enabled', $input) ? $boolean($input['enabled'], 'enabled') : true;
        return $withTransaction($pdo, static function () use ($pdo, $code, $name, $symbol, $scale, $assetType, $usdRate, $rateProvider, $externalCode, $enabled, $exec, $rows): array {
            $exec($pdo, 'INSERT INTO currency_registry (code,name,symbol,scale,assetType,usdRate,rateProvider,externalCode,enabled) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),symbol=VALUES(symbol),scale=VALUES(scale),assetType=VALUES(assetType),usdRate=VALUES(usdRate),rateProvider=VALUES(rateProvider),externalCode=VALUES(externalCode),enabled=VALUES(enabled)', [$code, $name, $symbol, $scale, $assetType, $usdRate, $rateProvider, $externalCode, $enabled ? 1 : 0]);
            $found = $rows($pdo, 'SELECT id,code,name,symbol,scale,assetType,usdRate,rateProvider,externalCode,enabled,createdAt,updatedAt FROM currency_registry WHERE code=? LIMIT 1', [$code]);
            if ($found === []) {
                throw new RuntimeException('Currency could not be loaded after update');
            }
            return $found[0];
        });
    },

    'adminOperations.createCustomer' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($adminId, $requireWrite, $withTransaction, $cleanString, $email, $packageName, $enabledPackage, $exec, $rows): array {
        $adminId($user);
        $requireWrite($method);
        $name = $cleanString($input['name'] ?? null, 'name', 2, 160);
        $address = $email($input['email'] ?? null);
        $password = $cleanString($input['password'] ?? null, 'password', 10, 200);
        $package = $packageName($input['packageName'] ?? null);
        return $withTransaction($pdo, static function () use ($pdo, $name, $address, $password, $package, $enabledPackage, $exec, $rows): array {
            $enabledPackage($pdo, $package);
            if ($rows($pdo, 'SELECT id FROM users WHERE email=? LIMIT 1', [$address]) !== []) {
                throw new InvalidArgumentException('A customer with this email already exists');
            }
            /* PHP auth.php verifies password_hash() values; never return the hash. */
            $hash = password_hash($password, PASSWORD_DEFAULT);
            if (!is_string($hash)) {
                throw new RuntimeException('Customer password could not be secured');
            }
            $exec($pdo, 'INSERT INTO users (openId,name,email,loginMethod,role,passwordHash,packageName) VALUES (?,?,?,?,?,?,?)', ['local:customer:' . bin2hex(random_bytes(16)), $name, $address, 'password', 'user', $hash, $package]);
            $id = (int)$pdo->lastInsertId();
            $exec($pdo, 'INSERT INTO customer_controls (userId) VALUES (?)', [$id]);
            return ['id' => $id, 'email' => $address, 'name' => $name, 'packageName' => $package];
        });
    },

    'adminOperations.updateCustomer' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($adminId, $requireWrite, $withTransaction, $positiveInt, $cleanString, $email, $packageName, $enabledPackage, $exec, $rows): array {
        $adminId($user);
        $requireWrite($method);
        $id = $positiveInt($input['id'] ?? null, 'id');
        $name = $cleanString($input['name'] ?? null, 'name', 2, 160);
        $address = $email($input['email'] ?? null);
        $package = $packageName($input['packageName'] ?? null);
        return $withTransaction($pdo, static function () use ($pdo, $id, $name, $address, $package, $enabledPackage, $exec, $rows): array {
            $enabledPackage($pdo, $package);
            $existing = $rows($pdo, 'SELECT id FROM users WHERE email=? LIMIT 1', [$address]);
            if ($existing !== [] && (int)$existing[0]['id'] !== $id) {
                throw new InvalidArgumentException('That email is already used by another account');
            }
            $target = $rows($pdo, 'SELECT id FROM users WHERE id=? AND role=? LIMIT 1', [$id, 'user']);
            if ($target === []) {
                throw new InvalidArgumentException('Customer account not found');
            }
            $exec($pdo, 'UPDATE users SET name=?,email=?,packageName=? WHERE id=? AND role=?', [$name, $address, $package, $id, 'user']);
            return ['success' => true];
        });
    },

    'adminOperations.setCustomerPackage' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($adminId, $requireWrite, $withTransaction, $email, $packageName, $enabledPackage, $exec, $rows): array {
        $adminId($user);
        $requireWrite($method);
        $address = $email($input['email'] ?? null);
        $package = $packageName($input['packageName'] ?? null);
        return $withTransaction($pdo, static function () use ($pdo, $address, $package, $enabledPackage, $exec, $rows): array {
            $enabledPackage($pdo, $package);
            $target = $rows($pdo, 'SELECT id,email FROM users WHERE email=? AND role=? LIMIT 1', [$address, 'user']);
            if ($target === []) {
                throw new InvalidArgumentException('Customer account not found');
            }
            $exec($pdo, 'UPDATE users SET packageName=? WHERE id=? AND role=?', [$package, (int)$target[0]['id'], 'user']);
            return ['id' => (int)$target[0]['id'], 'email' => (string)$target[0]['email'], 'packageName' => $package];
        });
    },

    'adminOperations.updateCustomerControls' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($adminId, $requireWrite, $withTransaction, $positiveInt, $cleanString, $boolean, $nonNegativeInt, $exec, $rows): array {
        $actor = $adminId($user);
        $requireWrite($method);
        $userId = $positiveInt($input['userId'] ?? null, 'userId');
        $target = $rows($pdo, 'SELECT id FROM users WHERE id=? AND role=? LIMIT 1', [$userId, 'user']);
        if ($target === []) {
            throw new InvalidArgumentException('Customer account not found');
        }
        $values = [];
        $enum = ['accountStatus' => ['active', 'suspended', 'restricted'], 'autoTradeMode' => ['inherit', 'enabled', 'disabled']];
        foreach ($enum as $field => $allowed) {
            if (array_key_exists($field, $input)) {
                $value = $cleanString($input[$field], $field, 1, $field === 'accountStatus' ? 10 : 8);
                if (!in_array($value, $allowed, true)) {
                    throw new InvalidArgumentException($field . ' is invalid');
                }
                $values[$field] = $value;
            }
        }
        foreach (['tradingEnabled', 'opportunitiesEnabled', 'autoTradeEnabled', 'withdrawalsEnabled', 'kycRequired', 'twoFactorRequired', 'emailVerified'] as $field) {
            if (array_key_exists($field, $input)) {
                $values[$field] = $boolean($input[$field], $field) ? 1 : 0;
            }
        }
        foreach (['autoTradeAmountMinor' => 1000000000, 'autoTradeMinRewardBps' => 5000, 'autoTradeDailyLimit' => 100, 'dailyTradeLimitMinor' => 1000000000] as $field => $max) {
            if (array_key_exists($field, $input)) {
                $values[$field] = $field === 'autoTradeMinRewardBps' || $field === 'dailyTradeLimitMinor' ? $nonNegativeInt($input[$field], $field, $max) : $positiveInt($input[$field], $field, $max);
                if ($field === 'autoTradeDailyLimit' && $values[$field] < 1) {
                    throw new InvalidArgumentException($field . ' is invalid');
                }
            }
        }
        if (array_key_exists('riskTier', $input)) {
            $values['riskTier'] = $cleanString($input['riskTier'], 'riskTier', 1, 24);
        }
        if (array_key_exists('adminNote', $input)) {
            $values['adminNote'] = $cleanString($input['adminNote'], 'adminNote', 0, 2000);
        }
        if (array_key_exists('autoTradeEnabled', $input) && !array_key_exists('autoTradeMode', $values)) {
            $values['autoTradeMode'] = $values['autoTradeEnabled'] ? 'enabled' : 'disabled';
        }
        return $withTransaction($pdo, static function () use ($pdo, $userId, $actor, $values, $exec, $rows): array {
            $existing = $rows($pdo, 'SELECT id FROM customer_controls WHERE userId=? LIMIT 1', [$userId]);
            if ($existing === []) {
                $columns = ['userId', 'updatedBy'];
                $params = [$userId, $actor];
                foreach ($values as $column => $value) {
                    $columns[] = $column;
                    $params[] = $value;
                }
                $placeholders = implode(',', array_fill(0, count($columns), '?'));
                $exec($pdo, 'INSERT INTO customer_controls (' . implode(',', $columns) . ') VALUES (' . $placeholders . ')', $params);
            } elseif ($values !== []) {
                $assignments = [];
                $params = [];
                foreach ($values as $column => $value) {
                    $assignments[] = $column . '=?';
                    $params[] = $value;
                }
                $assignments[] = 'updatedBy=?';
                $params[] = $actor;
                $exec($pdo, 'UPDATE customer_controls SET ' . implode(',', $assignments) . ' WHERE userId=?', array_merge($params, [$userId]));
            } else {
                $exec($pdo, 'UPDATE customer_controls SET updatedBy=? WHERE userId=?', [$actor, $userId]);
            }
            return ['success' => true];
        });
    },

    'adminOperations.adjustCustomerBalance' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($adminId, $requireWrite, $withTransaction, $positiveInt, $cleanString, $exec, $rows): array {
        $actor = $adminId($user);
        $requireWrite($method);
        $targetId = $positiveInt($input['userId'] ?? null, 'userId');
        $currency = strtoupper($cleanString($input['currency'] ?? null, 'currency', 2, 32));
        $amount = $positiveInt($input['amountMinor'] ?? null, 'amountMinor', 2147483647);
        $mode = $cleanString($input['mode'] ?? null, 'mode', 1, 6);
        if (!in_array($mode, ['credit', 'debit'], true)) {
            throw new InvalidArgumentException('mode is invalid');
        }
        $reason = $cleanString($input['reason'] ?? null, 'reason', 3, 500);
        return $withTransaction($pdo, static function () use ($pdo, $actor, $targetId, $currency, $amount, $mode, $reason, $exec, $rows): array {
            $userWhere = $targetId === $actor ? 'u.id=?' : 'u.id=? AND u.role=?';
            $userParams = $targetId === $actor ? [$targetId] : [$targetId, 'user'];
            $target = $rows($pdo, 'SELECT u.id,u.role FROM users u WHERE ' . $userWhere . ' LIMIT 1', $userParams);
            if ($target === []) {
                throw new InvalidArgumentException('Customer account not found');
            }
            if ((string)$target[0]['role'] === 'admin' && $targetId !== $actor) {
                throw new InvalidArgumentException('Administrators may adjust only their own wallet');
            }
            $currencyRow = $rows($pdo, 'SELECT code,scale,usdRate,updatedAt FROM currency_registry WHERE code=? AND enabled=? LIMIT 1', [$currency, 1]);
            if ($currencyRow === []) {
                throw new InvalidArgumentException('Currency ' . $currency . ' is not enabled. Add it in Currency registry first.');
            }
            $currencyData = $currencyRow[0];
            $rate = (float)$currencyData['usdRate'];
            $scale = (int)$currencyData['scale'];
            if (!is_finite($rate) || $rate <= 0 || $scale < 0 || $scale > 18) {
                throw new RuntimeException('Currency has no valid conversion rate');
            }
            $balance = $rows($pdo, 'SELECT id,availableMinor,promotionalMinor FROM customer_balances WHERE userId=? AND currency=? LIMIT 1 FOR UPDATE', [$targetId, $currency]);
            $current = $balance === [] ? 0 : (int)$balance[0]['availableMinor'];
            if ($mode === 'debit' && $amount > $current) {
                throw new InvalidArgumentException('Debit exceeds available wallet balance');
            }
            if ($mode === 'credit' && $amount > PHP_INT_MAX - $current) {
                throw new InvalidArgumentException('Credit exceeds supported wallet balance');
            }
            $next = $mode === 'credit' ? $current + $amount : $current - $amount;
            $promotional = $balance === [] ? ($mode === 'credit' ? $amount : 0) : (int)$balance[0]['promotionalMinor'] + ($mode === 'credit' ? $amount : 0);
            if ($balance !== []) {
                $exec($pdo, 'UPDATE customer_balances SET availableMinor=?,promotionalMinor=?,updatedAt=UTC_TIMESTAMP() WHERE id=? AND userId=?', [$next, $promotional, (int)$balance[0]['id'], $targetId]);
            } else {
                $exec($pdo, 'INSERT INTO customer_balances (userId,currency,availableMinor,promotionalMinor,earnedMinor) VALUES (?,?,?,?,?)', [$targetId, $currency, $amount, $mode === 'credit' ? $amount : 0, 0]);
            }
            $reference = 'admin-' . $actor . '-' . $targetId . '-' . bin2hex(random_bytes(8));
            $signed = $mode === 'credit' ? $amount : -$amount;
            $exec($pdo, 'INSERT INTO balance_ledger (userId,currency,amountMinor,entryType,reference,withdrawable) VALUES (?,?,?,?,?,?)', [$targetId, $currency, $signed, 'admin_' . $mode, $reference, 0]);
            $amountUsd = ($amount / (10 ** $scale)) * $rate;
            $body = 'An administrator ' . $mode . 'ed ' . $amount . ' native ledger units to your ' . $currency . ' wallet. Reason: ' . $reason;
            $exec($pdo, 'INSERT INTO customer_notifications (userId,title,body) VALUES (?,?,?)', [$targetId, 'Wallet ' . $mode . 'ed', $body]);
            return ['success' => true, 'newAvailableMinor' => $next, 'currency' => $currency, 'amountMinor' => $amount, 'rateUsd' => $rate, 'rateUpdatedAt' => $currencyData['updatedAt'] ?? null, 'amountUsd' => $amountUsd];
        });
    },
];

unset(
    $handlers['adminOperations.upsertCurrency'],
    $handlers['adminOperations.updateAutoTradePolicy'],
    $handlers['adminOperations.updateCustomerControls'],
    $handlers['adminOperations.adjustCustomerBalance']
);

return $handlers;
