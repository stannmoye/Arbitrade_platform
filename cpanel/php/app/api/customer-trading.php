<?php
declare(strict_types=1);

/*
 * Customer opportunities and trades.  This port stays at the verified local
 * wallet-ledger boundary: it never claims an external execution, provider fill,
 * OAuth result, or synthetic transaction-console event.
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

$positiveInt = static function (mixed $value, string $field, int $max = 2147483647): int {
    if (is_int($value)) {
        $number = $value;
    } elseif (is_string($value) && preg_match('/^[0-9]+$/', $value) === 1) {
        $number = (int)$value;
    } else {
        throw new InvalidArgumentException($field . ' is invalid');
    }
    if ($number <= 0 || $number > $max) {
        throw new InvalidArgumentException($field . ' is invalid');
    }
    return $number;
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

$getSetting = static function (PDO $pdo, string $key, string $default) use ($rows): string {
    $found = $rows($pdo, 'SELECT settingValue FROM app_settings WHERE settingKey=? LIMIT 1', [$key]);
    return $found === [] ? $default : (string)$found[0]['settingValue'];
};

$settingInt = static function (PDO $pdo, string $key, int $default, int $min, int $max) use ($getSetting): int {
    $raw = $getSetting($pdo, $key, (string)$default);
    if (!preg_match('/^-?[0-9]+$/', $raw)) {
        return $default;
    }
    $value = (int)$raw;
    return $value >= $min && $value <= $max ? $value : $default;
};

$ensureControls = static function (PDO $pdo, int $userId) use ($rows, $exec): array {
    $found = $rows($pdo, 'SELECT * FROM customer_controls WHERE userId=? LIMIT 1', [$userId]);
    if ($found === []) {
        $exec($pdo, 'INSERT INTO customer_controls (userId,autoTradeEnabled,autoTradeAmountMinor,autoTradeMinRewardBps,autoTradeDailyLimit) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE userId=VALUES(userId)', [$userId, 1, 10000, 0, 5]);
        $found = $rows($pdo, 'SELECT * FROM customer_controls WHERE userId=? LIMIT 1', [$userId]);
    }
    if ($found === []) {
        throw new RuntimeException('Customer controls could not be loaded');
    }
    return $found[0];
};

$tradeMethods = ['session entropy', 'amount elasticity', 'route volatility', 'liquidity depth', 'customer risk curve', 'rotation index', 'weighted ensemble'];
$tradeTerms = static function (int $userId, array $offer, int $amountMinor) use ($tradeMethods): array {
    $seed = hash('sha256', $userId . ':' . (int)$offer['id'] . ':' . $amountMinor . ':' . (string)$offer['symbol'] . ':' . (string)$offer['currency'], true);
    $unit = static function (string $seed, int $offset): float {
        return ord($seed[$offset]) / 255.0;
    };
    $rotation = ($userId + (int)$offer['id']) % count($tradeMethods);
    $amountCurve = min(1.0, sqrt(max(0, $amountMinor) / 100000));
    $sessionEntropy = $unit($seed, 0);
    $routeVolatility = $unit($seed, 1);
    $liquidityDepth = $unit($seed, 2);
    $customerRisk = $unit($seed, 3);
    $rotationIndex = $unit($seed, 4);
    $score = ($sessionEntropy * .18) + ($amountCurve * .24) + ((1 - $routeVolatility) * .14) + ($liquidityDepth * .12) + ((1 - $customerRisk) * .12) + ($rotationIndex * .08) + ($unit($seed, 5) * .12);
    $rewardBps = max(1000, min(3500, 1000 + (int)floor($score * 2500)));
    $minimumMinor = max((int)($offer['minimumMinor'] ?? 10000), 10000 + ((ord($seed[6]) + $rotation * 7) % 26) * 1000);
    return ['minimumMinor' => $minimumMinor, 'rewardBps' => $rewardBps, 'method' => $tradeMethods[$rotation]];
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

/* Idempotent, customer-scoped settlement at the verified local ledger boundary. */
$settleDueTrades = static function (PDO $pdo, int $userId) use ($rows, $exec): array {
    $due = $rows($pdo, 'SELECT id,offerId,currency,principalMinor,expectedRewardMinor FROM trade_positions WHERE userId=? AND status=? AND (creditAt<=UTC_TIMESTAMP() OR (creditAt IS NULL AND settlesAt<=UTC_TIMESTAMP())) FOR UPDATE', [$userId, 'confirmed']);
    $settled = [];
    foreach ($due as $trade) {
        $tradeId = (int)$trade['id'];
        $reference = 'trade-settlement:' . $tradeId;
        if ($rows($pdo, 'SELECT id FROM balance_ledger WHERE reference=? LIMIT 1 FOR UPDATE', [$reference]) !== []) {
            continue;
        }
        $currency = strtoupper(trim((string)$trade['currency']));
        $principal = filter_var($trade['principalMinor'], FILTER_VALIDATE_INT);
        $reward = filter_var($trade['expectedRewardMinor'], FILTER_VALIDATE_INT);
        if ($currency === '' || $principal === false || $reward === false || $principal < 0 || $reward < 0 || $principal > PHP_INT_MAX - $reward) {
            throw new RuntimeException('Invalid trade settlement data');
        }
        $total = $principal + $reward;
        $balance = $rows($pdo, 'SELECT id FROM customer_balances WHERE userId=? AND currency=? LIMIT 1 FOR UPDATE', [$userId, $currency]);
        if ($balance === []) {
            continue;
        }
        $balanceId = (int)$balance[0]['id'];
        $exec($pdo, 'INSERT INTO balance_ledger (userId,currency,amountMinor,entryType,reference,withdrawable) VALUES (?,?,?,?,?,?)', [$userId, $currency, $principal, 'trade_principal_release', $reference, 0]);
        $exec($pdo, 'INSERT INTO balance_ledger (userId,currency,amountMinor,entryType,reference,withdrawable) VALUES (?,?,?,?,?,?)', [$userId, $currency, $reward, 'trade_reward', $reference . ':reward', 0]);
        $exec($pdo, 'UPDATE customer_balances SET availableMinor=availableMinor+?,lockedMinor=GREATEST(lockedMinor-?,0),earnedMinor=earnedMinor+?,updatedAt=UTC_TIMESTAMP() WHERE id=? AND userId=?', [$total, $principal, $reward, $balanceId, $userId]);
        $exec($pdo, 'UPDATE trade_positions SET status=?,settledAt=UTC_TIMESTAMP() WHERE id=? AND userId=? AND status=?', ['settled', $tradeId, $userId, 'confirmed']);
        $settled[] = ['tradeId' => $tradeId, 'offerId' => (int)$trade['offerId'], 'currency' => $currency, 'principalMinor' => $principal, 'rewardMinor' => $reward, 'totalMinor' => $total, 'reference' => $reference];
    }
    foreach ($settled as $item) {
        $event = $rows($pdo, 'SELECT id FROM opportunity_popup_events WHERE userId=? AND offerId=? ORDER BY deliveredAt DESC LIMIT 1', [$userId, $item['offerId']]);
        if ($event !== []) {
            $exec($pdo, 'UPDATE opportunity_popup_events SET settledAt=COALESCE(settledAt,UTC_TIMESTAMP()),eventStatus=?,updatedAt=UTC_TIMESTAMP() WHERE id=? AND userId=?', ['SETTLED', (int)$event[0]['id'], $userId]);
        }
    }
    if ($settled !== []) {
        /* Matches the source lifecycle boundary; no external execution is implied. */
        $exec($pdo, 'UPDATE opportunity_offers SET status=? WHERE status=?', ['closed', 'open']);
    }
    return $settled;
};

$listPolicies = static function (PDO $pdo) use ($rows, $exec): array {
    $found = $rows($pdo, 'SELECT * FROM opportunity_package_policies ORDER BY id ASC');
    if ($found !== []) {
        return $found;
    }
    $defaults = [
        ['Starter', 50, 10, 1000, 500000, 2, 2, 3000, 0, 0, 1],
        ['Growth', 100, 20, 5000, 1500000, 2, 4, 5000, 1, 2, 1],
        ['Pro', 200, 40, 10000, 3000000, 4, 6, 7000, 1, 3, 1],
        ['Institutional', 500, 100, 200000, 700000, 6, 10, 8500, 1, 3, 1],
    ];
    foreach ($defaults as $policy) {
        $exec($pdo, 'INSERT INTO opportunity_package_policies (packageName,maxPopupsPerDay,maxVisibleOffers,minimumTradeUnits,maximumTradeUnits,minHourlyTarget,normalHourlyTarget,marketInfluenceBps,burstEnabled,maxBurstSize,enabled) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE packageName=VALUES(packageName)', $policy);
    }
    return $rows($pdo, 'SELECT * FROM opportunity_package_policies ORDER BY id ASC');
};

$nativeMinorForUsdUnits = static function (int $usdUnits, array $currency): int {
    $rate = (float)$currency['usdRate'];
    $scale = (int)$currency['scale'];
    if (!is_finite($rate) || $rate <= 0) {
        throw new RuntimeException('Currency has no valid conversion rate');
    }
    $factor = 10 ** max(0, $scale);
    $value = ($usdUnits / $rate) * $factor;
    if ($value > PHP_INT_MAX || $value < 0) {
        throw new RuntimeException('Trade amount is outside supported range');
    }
    return max(1, (int)round($value, 0, PHP_ROUND_HALF_UP));
};

$normaliseTrade = static function (array $row): array {
    foreach (['id', 'userId', 'offerId', 'principalMinor', 'expectedRewardMinor'] as $field) {
        if (array_key_exists($field, $row)) {
            $row[$field] = (int)$row[$field];
        }
    }
    return $row;
};

$opportunities = static function (PDO $pdo, ?array $user, array $input, string $method) use ($requireRead, $customerId, $withTransaction, $rows, $exec, $ensureControls, $settleDueTrades, $getSetting, $settingInt, $listPolicies, $listCurrencies, $tradeTerms, $nativeMinorForUsdUnits): array {
    $requireRead($method);
    $userId = $customerId($user);
    return $withTransaction($pdo, static function () use ($pdo, $userId, $rows, $exec, $ensureControls, $settleDueTrades, $getSetting, $settingInt, $listPolicies, $listCurrencies, $tradeTerms, $nativeMinorForUsdUnits): array {
        $settled = $settleDueTrades($pdo, $userId);
        $policySettings = [
            'popupMinGapSeconds' => $settingInt($pdo, 'opportunity.popup.minGapSeconds', 45, 0, 604800),
            'popupDisplaySeconds' => $settingInt($pdo, 'opportunity.popup.displaySeconds', 8, 1, 3600),
            'popupMaxPerHour' => $settingInt($pdo, 'opportunity.popup.maxPerHour', 12, 1, 10000),
            'popupPreAlertProbabilityBps' => $settingInt($pdo, 'opportunity.popup.preAlertProbabilityBps', 1500, 0, 10000),
            'popupPreAlertSeconds' => $settingInt($pdo, 'opportunity.popup.preAlertSeconds', 4, 0, 3600),
            'popupWithdrawalProbabilityBps' => $settingInt($pdo, 'opportunity.popup.withdrawalProbabilityBps', 1200, 0, 10000),
            'popupJitterSeconds' => $settingInt($pdo, 'opportunity.popup.jitterSeconds', 90, 0, 604800),
        ];
        $settlementDelay = $settingInt($pdo, 'trade.settlementDelaySeconds', 900, 1, 604800);
        $creditDelay = $settingInt($pdo, 'trade.creditDelaySeconds', 0, 0, 604800);
        $cooldown = $settingInt($pdo, 'trade.interTradeCooldownSeconds', 30, 0, 604800);
        $blockUntilSettled = strtolower($getSetting($pdo, 'trade.blockOpportunitiesUntilSettled', 'true')) === 'true';
        $controls = $ensureControls($pdo, $userId);
        $userRow = $rows($pdo, 'SELECT packageName FROM users WHERE id=? LIMIT 1', [$userId]);
        $packageName = (string)($userRow[0]['packageName'] ?? 'Starter');
        $baseDelivery = ['packageName' => $packageName, 'maxPopupsPerDay' => 0, 'maxVisibleOffers' => 0, 'enabled' => false, 'autoTradeEnabled' => false, 'settlementDelaySeconds' => $settlementDelay, 'cooldownSeconds' => $cooldown];
        $base = ['offers' => [], 'missed' => $rows($pdo, 'SELECT * FROM missed_opportunities WHERE userId=? AND status=? ORDER BY createdAt DESC LIMIT 50', [$userId, 'MISSED']), 'autoTrades' => [], 'settled' => $settled];
        $confirmed = $blockUntilSettled ? $rows($pdo, 'SELECT id,settlesAt FROM trade_positions WHERE status=? ORDER BY settlesAt ASC LIMIT 1', ['confirmed']) : [];
        if ($confirmed !== []) {
            $base['delivery'] = $baseDelivery + ['pausedUntilSettled' => true, 'outstandingTrades' => count($confirmed), 'nextSettlementAt' => $confirmed[0]['settlesAt'] ?? null, 'popupPolicy' => $policySettings];
            return $base;
        }
        if ($cooldown > 0) {
            $recent = $rows($pdo, 'SELECT settledAt FROM trade_positions WHERE userId=? AND status=? AND UTC_TIMESTAMP() < DATE_ADD(settledAt, INTERVAL ? SECOND) ORDER BY settledAt DESC LIMIT 1', [$userId, 'settled', $cooldown]);
            if ($recent !== []) {
                $until = strtotime((string)$recent[0]['settledAt']) + $cooldown;
                $base['delivery'] = $baseDelivery + ['cooldownActive' => true, 'cooldownUntil' => gmdate('Y-m-d H:i:s', $until), 'outstandingTrades' => 0, 'popupPolicy' => $policySettings];
                return $base;
            }
        }
        $policies = $listPolicies($pdo);
        $packagePolicy = null;
        foreach ($policies as $candidate) {
            if ((string)$candidate['packageName'] === $packageName) { $packagePolicy = $candidate; break; }
        }
        if ($packagePolicy === null || !(bool)$packagePolicy['enabled'] || !(bool)$controls['opportunitiesEnabled'] || (string)$controls['accountStatus'] !== 'active') {
            $base['delivery'] = $baseDelivery + ['popupPolicy' => $policySettings];
            return $base;
        }
        $globalLimit = $settingInt($pdo, 'opportunity.maxPopupsPerDay', 50, 1, 500);
        $emergency = $settingInt($pdo, 'opportunity.globalEmergencyCeilingPerDay', 500, 1, 500);
        $maxPopups = min((int)$packagePolicy['maxPopupsPerDay'], $globalLimit, $emergency);
        $currencies = $listCurrencies($pdo);
        $currencyByCode = [];
        foreach ($currencies as $currency) { $currencyByCode[(string)$currency['code']] = $currency; }
        $offers = $rows($pdo, 'SELECT * FROM opportunity_offers WHERE status=? AND opensAt<=UTC_TIMESTAMP() AND closesAt>UTC_TIMESTAMP() ORDER BY closesAt ASC LIMIT 5000', ['open']);
        $rules = $rows($pdo, 'SELECT * FROM customer_opportunity_rules WHERE userId=? LIMIT 1', [$userId]);
        $allowedAssets = array_filter(array_map('trim', explode(',', strtoupper((string)($rules[0]['allowedAssets'] ?? '')))));
        $nowMinutes = (int)gmdate('G') * 60 + (int)gmdate('i');
        $quietStart = (string)($rules[0]['quietHoursStart'] ?? '00:00');
        $quietEnd = (string)($rules[0]['quietHoursEnd'] ?? '00:00');
        $quietToMinutes = static function (string $time): int { [$hours, $minutes] = array_pad(array_map('intval', explode(':', $time)), 2, 0); return max(0, min(1439, $hours * 60 + $minutes)); };
        $qs = $quietToMinutes($quietStart); $qe = $quietToMinutes($quietEnd);
        $inQuiet = $qs === $qe ? false : ($qs < $qe ? ($nowMinutes >= $qs && $nowMinutes < $qe) : ($nowMinutes >= $qs || $nowMinutes < $qe));
        $quotaDay = gmdate('Y-m-d');
        $delivered = $rows($pdo, 'SELECT offerId FROM opportunity_delivery_events WHERE userId=? AND quotaDay=?', [$userId, $quotaDay]);
        $deliveredIds = [];
        foreach ($delivered as $item) { $deliveredIds[(int)$item['offerId']] = true; }
        $resultOffers = [];
        $visible = min((int)$packagePolicy['maxVisibleOffers'], $maxPopups);
        foreach ($offers as $offer) {
            if (count($resultOffers) >= $visible) break;
            $currencyCode = strtoupper((string)$offer['currency']);
            if ($allowedAssets !== [] && !in_array($currencyCode, $allowedAssets, true)) continue;
            if ($inQuiet) continue;
            if (!isset($currencyByCode[$currencyCode])) continue;
            $currency = $currencyByCode[$currencyCode];
            $packageMinimum = $nativeMinorForUsdUnits((int)$packagePolicy['minimumTradeUnits'], $currency);
            $packageMaximum = $nativeMinorForUsdUnits((int)$packagePolicy['maximumTradeUnits'], $currency);
            $terms = $tradeTerms($userId, $offer, max((int)$offer['minimumMinor'], $packageMinimum));
            $minimum = max((int)$offer['minimumMinor'], $packageMinimum, (int)$terms['minimumMinor']);
            if ($minimum > $packageMaximum) continue;
            $eventRows = $rows($pdo, 'SELECT id FROM opportunity_popup_events WHERE userId=? AND offerId=? AND quotaDay=? LIMIT 1', [$userId, (int)$offer['id'], $quotaDay]);
            $eventId = $eventRows === [] ? null : (int)$eventRows[0]['id'];
            $newDelivery = !isset($deliveredIds[(int)$offer['id']]);
            if ($newDelivery && count($deliveredIds) < $maxPopups && strtolower($getSetting($pdo, 'opportunity.drainMode', 'false')) !== 'true') {
                $exec($pdo, 'INSERT INTO opportunity_delivery_events (userId,offerId,quotaDay) VALUES (?,?,?) ON DUPLICATE KEY UPDATE deliveredAt=UTC_TIMESTAMP()', [$userId, (int)$offer['id'], $quotaDay]);
                $exec($pdo, 'INSERT INTO opportunity_popup_events (eventKey,userId,offerId,quotaDay,packageName,symbol,currency,minimumMinor,expectedRewardBps,balanceAvailableMinor,balanceStatus,marketObservedAt,marketSnapshotJson,eventStatus,deliveredAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,\'DELIVERED\',UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE updatedAt=UTC_TIMESTAMP()', [$userId . ':' . (int)$offer['id'] . ':' . $quotaDay, $userId, (int)$offer['id'], $quotaDay, $packageName, (string)$offer['symbol'], $currencyCode, $minimum, (int)$terms['rewardBps'], 0, 'unknown', $offer['marketObservedAt'] ?? null, json_encode(['symbol' => $offer['symbol'], 'venueFrom' => $offer['venueFrom'], 'venueTo' => $offer['venueTo'], 'marketValueUsd' => $offer['marketValueUsd'] ?? null, 'observedAt' => $offer['marketObservedAt'] ?? null], JSON_UNESCAPED_SLASHES)]);
                $deliveredIds[(int)$offer['id']] = true;
                $eventRows = $rows($pdo, 'SELECT id FROM opportunity_popup_events WHERE userId=? AND offerId=? AND quotaDay=? LIMIT 1', [$userId, (int)$offer['id'], $quotaDay]);
                $eventId = $eventRows === [] ? null : (int)$eventRows[0]['id'];
            }
            $offer['minimumMinor'] = $minimum;
            $offer['packageMinimumTradeMinor'] = $packageMinimum;
            $offer['packageMaximumTradeMinor'] = $packageMaximum;
            $offer['currencyRateUsd'] = (float)$currency['usdRate'];
            $offer['currencyRateUpdatedAt'] = $currency['updatedAt'] ?? null;
            $offer['expectedRewardBps'] = (int)$terms['rewardBps'];
            $offer['calculationMethod'] = (string)$terms['method'];
            $offer['deliveryEventId'] = $eventId;
            $offer['popupEligible'] = $newDelivery && isset($deliveredIds[(int)$offer['id']]);
            $resultOffers[] = $offer;
        }
        $base['offers'] = $resultOffers;
        $base['delivery'] = ['packageName' => $packageName, 'maxPopupsPerDay' => $maxPopups, 'maxVisibleOffers' => $visible, 'emergencyCeiling' => $emergency, 'drainMode' => strtolower($getSetting($pdo, 'opportunity.drainMode', 'false')) === 'true', 'enabled' => true, 'autoTradeEnabled' => false, 'autoTradeDeferred' => true, 'settlementDelaySeconds' => $settlementDelay, 'cooldownSeconds' => $cooldown, 'rateProfile' => ['minHourlyTarget' => (int)$packagePolicy['minHourlyTarget'], 'normalHourlyTarget' => (int)$packagePolicy['normalHourlyTarget'], 'marketInfluenceBps' => (int)$packagePolicy['marketInfluenceBps'], 'burstEnabled' => (bool)$packagePolicy['burstEnabled'], 'maxBurstSize' => (int)$packagePolicy['maxBurstSize'], 'formulaCooling' => false], 'popupPolicy' => $policySettings];
        return $base;
    });
};

$trades = static function (PDO $pdo, ?array $user, array $input, string $method) use ($requireRead, $customerId, $withTransaction, $settleDueTrades, $rows, $normaliseTrade): array {
    $requireRead($method);
    $userId = $customerId($user);
    return $withTransaction($pdo, static function () use ($pdo, $userId, $settleDueTrades, $rows, $normaliseTrade): array {
        $settleDueTrades($pdo, $userId);
        $found = $rows($pdo, 'SELECT * FROM trade_positions WHERE userId=? ORDER BY confirmedAt ASC', [$userId]);
        return array_map($normaliseTrade, $found);
    });
};

$invest = static function (PDO $pdo, ?array $user, array $input, string $method) use ($requireWrite, $customerId, $positiveInt, $withTransaction, $rows, $exec, $getSetting, $listCurrencies, $tradeTerms, $nativeMinorForUsdUnits): array {
    $requireWrite($method);
    $userId = $customerId($user);
    $offerId = $positiveInt($input['offerId'] ?? null, 'offerId');
    $amountMinor = $positiveInt($input['amountMinor'] ?? null, 'amountMinor');
    return $withTransaction($pdo, static function () use ($pdo, $userId, $offerId, $amountMinor, $rows, $exec, $getSetting, $listCurrencies, $tradeTerms, $nativeMinorForUsdUnits): array {
        $block = strtolower($getSetting($pdo, 'trade.blockOpportunitiesUntilSettled', 'true')) === 'true';
        if ($block && $rows($pdo, 'SELECT id FROM trade_positions WHERE status=? LIMIT 1', ['confirmed']) !== []) {
            throw new RuntimeException('A previous trade is still awaiting settlement');
        }
        $offerRows = $rows($pdo, 'SELECT * FROM opportunity_offers WHERE id=? AND status=? AND closesAt>UTC_TIMESTAMP() LIMIT 1 FOR UPDATE', [$offerId, 'open']);
        if ($offerRows === []) throw new InvalidArgumentException('This opportunity is no longer open');
        $offer = $offerRows[0];
        $userRows = $rows($pdo, 'SELECT packageName FROM users WHERE id=? LIMIT 1', [$userId]);
        $packageName = (string)($userRows[0]['packageName'] ?? 'Starter');
        $policyRows = $rows($pdo, 'SELECT * FROM opportunity_package_policies WHERE packageName=? LIMIT 1', [$packageName]);
        if ($policyRows === []) throw new RuntimeException('Customer package policy is not configured');
        $currencyRows = $rows($pdo, 'SELECT scale,usdRate,updatedAt FROM currency_registry WHERE code=? LIMIT 1', [(string)$offer['currency']]);
        if ($currencyRows === []) throw new RuntimeException('Currency ' . (string)$offer['currency'] . ' is not configured');
        $currency = $currencyRows[0];
        $rate = (float)$currency['usdRate'];
        if (!is_finite($rate) || $rate <= 0) throw new RuntimeException('Currency has no valid conversion rate');
        $packageMinimum = $nativeMinorForUsdUnits((int)$policyRows[0]['minimumTradeUnits'], $currency);
        $packageMaximum = max($packageMinimum, $nativeMinorForUsdUnits((int)$policyRows[0]['maximumTradeUnits'], $currency));
        $terms = $tradeTerms($userId, $offer, $amountMinor);
        $minimum = max($packageMinimum, (int)$terms['minimumMinor']);
        if ($amountMinor < $minimum || $amountMinor > $packageMaximum || $amountMinor < (int)$offer['minimumMinor']) throw new InvalidArgumentException('Trade amount is outside the configured bounds');
        if ($rows($pdo, 'SELECT id FROM trade_positions WHERE userId=? AND offerId=? LIMIT 1', [$userId, $offerId]) !== []) throw new InvalidArgumentException('This opportunity has already been allocated');
        $balances = $rows($pdo, 'SELECT id,availableMinor FROM customer_balances WHERE userId=? AND currency=? LIMIT 1 FOR UPDATE', [$userId, (string)$offer['currency']]);
        if ($balances === [] || (int)$balances[0]['availableMinor'] < $amountMinor) throw new InvalidArgumentException('Insufficient available balance');
        $reward = (int)floor($amountMinor * (int)$terms['rewardBps'] / 10000);
        $update = $exec($pdo, 'UPDATE customer_balances SET availableMinor=availableMinor-?,lockedMinor=lockedMinor+?,updatedAt=UTC_TIMESTAMP() WHERE id=? AND userId=? AND availableMinor>=?', [$amountMinor, $amountMinor, (int)$balances[0]['id'], $userId, $amountMinor]);
        if ($update->rowCount() !== 1) throw new InvalidArgumentException('Insufficient available balance');
        $reference = 'trade-' . $offerId . '-' . $userId . '-' . (string)round(microtime(true) * 1000);
        $exec($pdo, 'INSERT INTO balance_ledger (userId,currency,amountMinor,entryType,reference,withdrawable) VALUES (?,?,?,?,?,?)', [$userId, (string)$offer['currency'], -$amountMinor, 'trade_reservation', $reference, 0]);
        $delay = $settingInt = (int)$getSetting($pdo, 'trade.settlementDelaySeconds', '900');
        if ($delay < 1 || $delay > 604800) $delay = 900;
        $creditDelay = (int)$getSetting($pdo, 'trade.creditDelaySeconds', '0');
        if ($creditDelay < 0 || $creditDelay > 604800) $creditDelay = 0;
        $settlesAt = gmdate('Y-m-d H:i:s', time() + $delay);
        $creditAt = gmdate('Y-m-d H:i:s', time() + $delay + $creditDelay);
        $insert = $exec($pdo, 'INSERT INTO trade_positions (userId,offerId,currency,principalMinor,expectedRewardMinor,status,confirmedAt,settlesAt,creditAt) VALUES (?,?,?,?,?,?,?,?,?)', [$userId, $offerId, (string)$offer['currency'], $amountMinor, $reward, 'confirmed', gmdate('Y-m-d H:i:s'), $settlesAt, $creditAt]);
        return ['tradeId' => (int)$insert->lastInsertId(), 'rewardMinor' => $reward, 'rewardBps' => (int)$terms['rewardBps'], 'minimumMinor' => (int)$terms['minimumMinor'], 'calculationMethod' => (string)$terms['method'], 'settlesAt' => $settlesAt, 'creditAt' => $creditAt, 'currency' => (string)$offer['currency'], 'amountMinor' => $amountMinor, 'rateUsd' => $rate, 'rateUpdatedAt' => $currency['updatedAt'] ?? null, 'amountUsd' => ($amountMinor / (10 ** max(0, (int)$currency['scale']))) * $rate];
    });
};

$settle = static function (PDO $pdo, ?array $user, array $input, string $method) use ($requireWrite, $customerId, $positiveInt, $withTransaction, $rows, $settleDueTrades): array {
    $requireWrite($method);
    $userId = $customerId($user);
    $tradeId = $positiveInt($input['tradeId'] ?? null, 'tradeId');
    return $withTransaction($pdo, static function () use ($pdo, $userId, $tradeId, $rows, $settleDueTrades): array {
        $owned = $rows($pdo, 'SELECT id FROM trade_positions WHERE id=? AND userId=? LIMIT 1', [$tradeId, $userId]);
        if ($owned === []) throw new InvalidArgumentException('Trade not found');
        $settled = $settleDueTrades($pdo, $userId);
        $found = false;
        foreach ($settled as $item) if ((int)$item['tradeId'] === $tradeId) { $found = true; break; }
        return ['settled' => $found];
    });
};

$popupLifecycle = static function (PDO $pdo, ?array $user, array $input, string $method) use ($requireWrite, $customerId, $positiveInt, $cleanString, $withTransaction, $rows, $exec): array {
    $requireWrite($method);
    $userId = $customerId($user);
    $eventId = $positiveInt($input['eventId'] ?? null, 'eventId');
    $action = strtolower($cleanString($input['action'] ?? null, 'action', 5, 10));
    $allowed = ['noticed' => ['NOTICED', 'noticedAt'], 'opened' => ['OPENED', 'openedAt'], 'dismissed' => ['DISMISSED', 'dismissedAt'], 'withdrawn' => ['WITHDRAWN', 'withdrawnAt'], 'traded' => ['TRADED', 'tradedAt'], 'settled' => ['SETTLED', 'settledAt']];
    if (!isset($allowed[$action])) throw new InvalidArgumentException('Unknown opportunity lifecycle action');
    return $withTransaction($pdo, static function () use ($pdo, $userId, $eventId, $action, $allowed, $rows, $exec): array {
        $event = $rows($pdo, 'SELECT id FROM opportunity_popup_events WHERE id=? AND userId=? LIMIT 1', [$eventId, $userId]);
        if ($event === []) throw new InvalidArgumentException('Opportunity event not found');
        $column = $allowed[$action][1];
        $exec($pdo, 'UPDATE opportunity_popup_events SET ' . $column . '=COALESCE(' . $column . ',UTC_TIMESTAMP()),eventStatus=?,updatedAt=UTC_TIMESTAMP() WHERE id=? AND userId=?', [$allowed[$action][0], $eventId, $userId]);
        return ['success' => true, 'eventId' => $eventId, 'action' => $action];
    });
};

$autoTradeSettings = static function (PDO $pdo, ?array $user, array $input, string $method) use ($requireRead, $customerId, $withTransaction, $ensureControls, $getSetting): array {
    $requireRead($method);
    $userId = $customerId($user);
    return $withTransaction($pdo, static function () use ($pdo, $userId, $ensureControls, $getSetting): array {
        $controls = $ensureControls($pdo, $userId);
        $global = strtolower($getSetting($pdo, 'autoTrade.globalEnabled', 'false')) === 'true';
        $mode = (string)($controls['autoTradeMode'] ?? 'inherit');
        $effective = $mode === 'enabled' || ($mode === 'inherit' && $global);
        return ['autoTradeEnabled' => $effective, 'autoTradeMode' => $mode, 'globalAutoTradeEnabled' => $global, 'autoTradeAmountMinor' => (int)$controls['autoTradeAmountMinor'], 'autoTradeMinRewardBps' => (int)$controls['autoTradeMinRewardBps'], 'autoTradeDailyLimit' => (int)$controls['autoTradeDailyLimit'], 'tradingEnabled' => (bool)$controls['tradingEnabled'], 'opportunitiesEnabled' => (bool)$controls['opportunitiesEnabled'], 'accountStatus' => (string)$controls['accountStatus'], 'dailyTradeLimitMinor' => (int)$controls['dailyTradeLimitMinor'], 'automaticExecutionDeferred' => true];
    });
};

$handlers = [
    'customer.opportunities' => $opportunities,
    'customer.trades' => $trades,
    'customer.invest' => $invest,
    'customer.settle' => $settle,
    'customer.popupLifecycle' => $popupLifecycle,
    'customer.autoTradeSettings' => $autoTradeSettings,
    /* Route-compatible aliases; source procedure names above remain canonical. */
    'opportunities' => $opportunities,
    'trades' => $trades,
    'invest' => $invest,
    'settle' => $settle,
    'popupLifecycle' => $popupLifecycle,
    'autoTradeSettings' => $autoTradeSettings,
];

$readOnlyTrades = static function (PDO $pdo, ?array $user, array $input, string $method) use ($requireRead, $customerId, $withTransaction, $rows, $normaliseTrade): array {
    $requireRead($method);
    $userId = $customerId($user);
    return $withTransaction($pdo, static function () use ($pdo, $userId, $rows, $normaliseTrade): array {
        $found = $rows($pdo, 'SELECT * FROM trade_positions WHERE userId=? ORDER BY confirmedAt ASC', [$userId]);
        return array_map($normaliseTrade, $found);
    });
};
$handlers['customer.trades'] = $readOnlyTrades;
$handlers['trades'] = $readOnlyTrades;
unset(
    $handlers['customer.opportunities'], $handlers['opportunities'],
    $handlers['customer.invest'], $handlers['invest'],
    $handlers['customer.settle'], $handlers['settle'],
    $handlers['customer.popupLifecycle'], $handlers['popupLifecycle'],
    $handlers['customer.autoTradeSettings'], $handlers['autoTradeSettings']
);

return $handlers;
