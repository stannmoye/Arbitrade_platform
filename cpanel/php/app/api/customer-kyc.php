<?php
declare(strict_types=1);

/*
 * Customer KYC API port.  This module intentionally does not issue local email/SMS
 * credentials, accept document storage keys without an ownership authority, or
 * record local/demo face outcomes.  Those provider-dependent procedures are left
 * absent from the returned operation map and therefore remain 404/deferred.
 */

$stages = ['EMAIL', 'PHONE', 'ADDRESS', 'IDENTITY_DOCUMENT', 'FACE_LIVENESS'];
$stageNames = [
    'EMAIL' => 'Email',
    'PHONE' => 'Phone',
    'ADDRESS' => 'Address',
    'IDENTITY_DOCUMENT' => 'Identity document',
    'FACE_LIVENESS' => 'Live face & liveness',
];

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

$safeJson = static function (mixed $value): string {
    try {
        $encoded = json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR);
    } catch (Throwable) {
        $encoded = '{}';
    }
    return substr($encoded ?: '{}', 0, 100000);
};

$hashValue = static fn(string $value): string => hash('sha256', $value);
$hmacValue = static function (string $value): string {
    $key = (string)(getenv('PASSWORD_PEPPER') ?: getenv('SESSION_SECRET') ?: 'development-only');
    return hash_hmac('sha256', $value, $key);
};

/* The audit hash chain is locked while the surrounding operation transaction is open. */
$audit = static function (
    PDO $pdo,
    string $event,
    ?int $profileId,
    ?int $customerId,
    ?int $actorId,
    string $actorType,
    ?string $result = null,
    ?string $reason = null,
    ?string $sessionId = null,
    ?string $provider = null,
    ?string $providerVersion = null,
    mixed $payload = null
) use ($safeJson, $hashValue): void {
    $ownsTransaction = !$pdo->inTransaction();
    if ($ownsTransaction) {
        $pdo->beginTransaction();
    }
    try {
        $pdo->exec("SET time_zone = '+00:00'");
        $previous = $pdo->query('SELECT recordHash FROM kyc_audit_logs ORDER BY id DESC LIMIT 1 FOR UPDATE')->fetchColumn();
        $previousHash = is_string($previous) && $previous !== '' ? $previous : 'GENESIS';
        $createdAt = (string)$pdo->query("SELECT DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z')")->fetchColumn();
        if ($createdAt === '') {
            $createdAt = gmdate('Y-m-d\\TH:i:s.000\\Z');
        }
        $payloadJson = $safeJson($payload ?? []);
        $recordHash = $hashValue(implode('|', [
            $previousHash,
            $event,
            $profileId ?? '',
            $customerId ?? '',
            $actorId ?? '',
            $actorType,
            $result ?? '',
            $reason ?? '',
            $sessionId ?? '',
            $createdAt,
            $payloadJson,
        ]));
        $sqlTimestamp = str_replace(['T', '.000Z'], [' ', ''], $createdAt);
        $statement = $pdo->prepare(
            'INSERT INTO kyc_audit_logs
             (event,profileId,customerId,actorId,actorType,result,reason,sessionId,provider,providerVersion,payloadJson,previousHash,recordHash,createdAt)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
        );
        $statement->execute([
            $event,
            $profileId,
            $customerId,
            $actorId,
            $actorType,
            $result,
            $reason,
            $sessionId,
            $provider,
            $providerVersion,
            $payloadJson,
            $previousHash,
            $recordHash,
            $sqlTimestamp,
        ]);
        if ($ownsTransaction) {
            $pdo->commit();
        }
    } catch (Throwable $error) {
        if ($ownsTransaction && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
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

$stageRows = static function (PDO $pdo, int $profileId) use ($rows): array {
    return $rows(
        $pdo,
        'SELECT s.stageCode,s.state,s.source,s.verifiedAt,s.failureReason,
                k.name,k.description,k.whyRequired,k.`rank`
         FROM kyc_stage_states s
         JOIN kyc_stages k ON k.code=s.stageCode
         WHERE s.profileId=? ORDER BY k.`rank`',
        [$profileId]
    );
};

$overall = static function (array $stageStateRows): string {
    foreach ($stageStateRows as $stage) {
        if (($stage['state'] ?? '') === 'REVIEW_REQUIRED') {
            return 'REVIEW_REQUIRED';
        }
    }
    foreach ($stageStateRows as $stage) {
        if (($stage['state'] ?? '') === 'REJECTED') {
            return 'REJECTED';
        }
    }
    foreach ($stageStateRows as $stage) {
        if (($stage['state'] ?? '') === 'FAILED') {
            return 'RETRY_AVAILABLE';
        }
    }
    if ($stageStateRows !== [] && count(array_filter($stageStateRows, static fn(array $stage): bool => ($stage['state'] ?? '') === 'VERIFIED')) === count($stageStateRows)) {
        return 'VERIFIED';
    }
    foreach ($stageStateRows as $stage) {
        if (in_array(($stage['state'] ?? ''), ['IN_PROGRESS', 'PROCESSING'], true)) {
            return 'IN_PROGRESS';
        }
    }
    return 'NOT_STARTED';
};

$levelFor = static function (array $stageStateRows): string {
    $verified = [];
    foreach ($stageStateRows as $stage) {
        if (($stage['state'] ?? '') === 'VERIFIED') {
            $verified[(string)$stage['stageCode']] = true;
        }
    }
    if (isset($verified['FACE_LIVENESS'])) return 'L4';
    if (isset($verified['IDENTITY_DOCUMENT'])) return 'L3';
    if (isset($verified['ADDRESS'])) return 'L2';
    if (isset($verified['PHONE'])) return 'L1';
    return 'L0';
};

$syncProfile = static function (PDO $pdo, int $profileId) use ($stageRows, $levelFor, $overall, $exec): array {
    $currentStages = $stageRows($pdo, $profileId);
    $level = $levelFor($currentStages);
    $status = $overall($currentStages);
    $exec($pdo, 'UPDATE kyc_profiles SET currentLevel=?,overallStatus=? WHERE id=?', [$level, $status, $profileId]);
    return ['level' => $level, 'status' => $status, 'stages' => $currentStages];
};

$profileFor = static function (PDO $pdo, int $userId) use ($rows, $exec, $audit): array {
    $found = $rows($pdo, 'SELECT * FROM kyc_profiles WHERE userId=? LIMIT 1 FOR UPDATE', [$userId]);
    if ($found !== []) {
        return $found[0];
    }
    $insert = $exec($pdo, 'INSERT INTO kyc_profiles (userId) VALUES (?)', [$userId]);
    $profileId = (int)$insert->lastInsertId();
    foreach (['EMAIL', 'PHONE', 'ADDRESS', 'IDENTITY_DOCUMENT', 'FACE_LIVENESS'] as $stage) {
        $exec($pdo, 'INSERT INTO kyc_stage_states (profileId,stageCode) VALUES (?,?)', [$profileId, $stage]);
    }
    $audit($pdo, 'KYC_STARTED', $profileId, $userId, $userId, 'CUSTOMER', 'PASS');
    $created = $rows($pdo, 'SELECT * FROM kyc_profiles WHERE id=? LIMIT 1', [$profileId]);
    if ($created === []) {
        throw new RuntimeException('KYC profile could not be created');
    }
    return $created[0];
};

$assertStageReady = static function (PDO $pdo, int $profileId, string $stage) use ($stages, $stageNames, $rows): void {
    $index = array_search($stage, $stages, true);
    if ($index === false) {
        throw new InvalidArgumentException('Unknown KYC stage');
    }
    if ($index === 0) {
        return;
    }
    $required = array_slice($stages, 0, $index);
    $placeholders = implode(',', array_fill(0, count($required), '?'));
    $states = $rows($pdo, "SELECT stageCode,state FROM kyc_stage_states WHERE profileId=? AND stageCode IN ($placeholders)", array_merge([$profileId], $required));
    $byStage = [];
    foreach ($states as $state) {
        $byStage[(string)$state['stageCode']] = (string)$state['state'];
    }
    foreach ($required as $requiredStage) {
        if (($byStage[$requiredStage] ?? null) !== 'VERIFIED') {
            throw new InvalidArgumentException('Complete ' . ($stageNames[$requiredStage] ?? $requiredStage) . ' before continuing to ' . ($stageNames[$stage] ?? $stage) . '.');
        }
    }
};

$ensureTransition = static function (string $from, string $to): void {
    $allowed = [
        'NOT_STARTED' => ['IN_PROGRESS'],
        'IN_PROGRESS' => ['PROCESSING', 'FAILED', 'REVIEW_REQUIRED'],
        'PROCESSING' => ['VERIFIED', 'FAILED', 'REVIEW_REQUIRED'],
        'REVIEW_REQUIRED' => ['VERIFIED', 'REJECTED'],
        'FAILED' => ['RETRY_AVAILABLE'],
        'RETRY_AVAILABLE' => ['IN_PROGRESS'],
        'VERIFIED' => ['EXPIRED'],
        'EXPIRED' => ['IN_PROGRESS'],
    ];
    if (!in_array($to, $allowed[$from] ?? [], true)) {
        throw new InvalidArgumentException('Illegal KYC transition');
    }
};

$transition = static function (PDO $pdo, int $profileId, int $userId, string $stage, string $next, string $source, ?string $reason = null, ?string $sessionId = null) use ($rows, $exec, $ensureTransition, $audit, $syncProfile): array {
    $currentRows = $rows($pdo, 'SELECT state FROM kyc_stage_states WHERE profileId=? AND stageCode=? FOR UPDATE', [$profileId, $stage]);
    if ($currentRows === []) {
        throw new InvalidArgumentException('Unknown KYC stage');
    }
    $current = (string)$currentRows[0]['state'];
    $ensureTransition($current, $next);
    $verifiedAt = $next === 'VERIFIED' ? gmdate('Y-m-d H:i:s') : null;
    $exec($pdo, 'UPDATE kyc_stage_states SET state=?,source=?,verifiedAt=?,failureReason=?,lastAttemptAt=UTC_TIMESTAMP() WHERE profileId=? AND stageCode=?', [$next, $source, $verifiedAt, $reason, $profileId, $stage]);
    if ($next === 'REVIEW_REQUIRED') {
        $exec($pdo, 'INSERT INTO kyc_manual_reviews (profileId,stageCode,status,reason) VALUES (?,?,?,?)', [$profileId, $stage, 'OPEN', $reason ?: 'Evidence requires manual review']);
    }
    $event = $next === 'VERIFIED' ? 'STAGE_APPROVED' : ($next === 'REJECTED' ? 'STAGE_REJECTED' : $stage . '_STATE_CHANGED');
    $actorId = $source === 'ADMIN' ? null : $userId;
    $actorType = $source === 'ADMIN' ? 'ADMIN' : 'CUSTOMER';
    $audit($pdo, $event, $profileId, $userId, $actorId, $actorType, $next, $reason, $sessionId);
    return $syncProfile($pdo, $profileId);
};

$prepareStage = static function (PDO $pdo, int $profileId, int $userId, string $stage) use ($assertStageReady, $rows, $transition): void {
    $assertStageReady($pdo, $profileId, $stage);
    $current = $rows($pdo, 'SELECT state FROM kyc_stage_states WHERE profileId=? AND stageCode=? FOR UPDATE', [$profileId, $stage]);
    $state = (string)($current[0]['state'] ?? '');
    if (in_array($state, ['NOT_STARTED', 'RETRY_AVAILABLE'], true)) {
        $transition($pdo, $profileId, $userId, $stage, 'IN_PROGRESS', 'AUTOMATED');
    }
};

$cleanString = static function (mixed $value, string $field, int $min, int $max, bool $required = true): ?string {
    if ($value === null && !$required) return null;
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

$customerId = static function (?array $user): int {
    $id = (int)($user['id'] ?? 0);
    if ($id <= 0) throw new InvalidArgumentException('Customer access required');
    return $id;
};

$center = static function (PDO $pdo, int $userId) use ($profileFor, $syncProfile, $rows): array {
    $profile = $profileFor($pdo, $userId);
    $current = $syncProfile($pdo, (int)$profile['id']);
    $consent = $rows($pdo, 'SELECT purpose,version,consentedAt FROM kyc_consents WHERE profileId=? ORDER BY id DESC LIMIT 1', [(int)$profile['id']]);
    return [
        'profile' => [
            'id' => (int)$profile['id'],
            'userId' => (int)$profile['userId'],
            'overallStatus' => $current['status'],
            'currentLevel' => $current['level'],
            'riskLevel' => (string)($profile['riskLevel'] ?? 'LOW_RISK'),
            'grandfathered' => (bool)($profile['grandfathered'] ?? false),
            'createdAt' => $profile['createdAt'] ?? null,
            'updatedAt' => $profile['updatedAt'] ?? null,
        ],
        'stages' => array_map(static function (array $stage): array {
            return [
                'stageCode' => (string)$stage['stageCode'],
                'state' => (string)$stage['state'],
                'source' => $stage['source'] ?? null,
                'verifiedAt' => $stage['verifiedAt'] ?? null,
                'failureReason' => $stage['failureReason'] ?? null,
                'name' => $stage['name'] ?? null,
                'description' => $stage['description'] ?? null,
                'whyRequired' => $stage['whyRequired'] ?? null,
                'rank' => (int)($stage['rank'] ?? 0),
            ];
        }, $current['stages']),
        'consent' => $consent[0] ?? null,
        'providerVerificationAvailable' => false,
    ];
};

$handlers = [
    'customer.kycCenter' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $withTransaction, $center): array {
        if ($method !== 'GET') throw new InvalidArgumentException('GET is required');
        $id = $customerId($user);
        return $withTransaction($pdo, static fn(): array => $center($pdo, $id));
    },

    'customer.kycStartStage' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $cleanString, $stages, $profileFor, $assertStageReady, $rows, $exec, $transition, $audit, $safeJson, $withTransaction): array {
        if (!in_array($method, ['POST', 'PUT', 'PATCH'], true)) throw new InvalidArgumentException('A write method is required');
        $id = $customerId($user);
        $stage = $cleanString($input['stage'] ?? null, 'stage', 1, 40);
        if (!in_array($stage, $stages, true)) throw new InvalidArgumentException('Unknown KYC stage');
        $idempotencyKey = $cleanString($input['idempotencyKey'] ?? null, 'idempotencyKey', 8, 160);
        $deviceMetadata = $input['deviceMetadata'] ?? [];
        if (!is_array($deviceMetadata)) throw new InvalidArgumentException('deviceMetadata is invalid');
        return $withTransaction($pdo, static function () use ($pdo, $id, $stage, $idempotencyKey, $deviceMetadata, $profileFor, $assertStageReady, $rows, $exec, $transition, $audit, $safeJson): array {
            $profile = $profileFor($pdo, $id);
            $profileId = (int)$profile['id'];
            $assertStageReady($pdo, $profileId, $stage);
            $prior = $rows($pdo, 'SELECT id,sessionId,profileId,stageCode,status FROM kyc_attempts WHERE idempotencyKey=? LIMIT 1', [$idempotencyKey]);
            if ($prior !== []) {
                if ((int)$prior[0]['profileId'] !== $profileId) throw new InvalidArgumentException('Idempotency key has already been used');
                return [
                    'sessionId' => (string)$prior[0]['sessionId'],
                    'attemptId' => (int)$prior[0]['id'],
                    'stage' => (string)$prior[0]['stageCode'],
                    'status' => (string)$prior[0]['status'],
                    'expiresInSeconds' => 1200,
                ];
            }
            $sessionId = bin2hex(random_bytes(24));
            $exec($pdo, 'INSERT INTO kyc_verification_sessions (id,profileId,expiresAt,deviceMetadata) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 20 MINUTE),?)', [$sessionId, $profileId, $safeJson($deviceMetadata)]);
            $attempt = $exec($pdo, 'INSERT INTO kyc_attempts (sessionId,profileId,stageCode,idempotencyKey) VALUES (?,?,?,?)', [$sessionId, $profileId, $stage, $idempotencyKey]);
            $current = $rows($pdo, 'SELECT state FROM kyc_stage_states WHERE profileId=? AND stageCode=? FOR UPDATE', [$profileId, $stage]);
            if (in_array((string)($current[0]['state'] ?? ''), ['NOT_STARTED', 'RETRY_AVAILABLE'], true)) {
                $transition($pdo, $profileId, $id, $stage, 'IN_PROGRESS', 'AUTOMATED', null, $sessionId);
            }
            $audit($pdo, 'KYC_STAGE_STARTED', $profileId, $id, $id, 'CUSTOMER', 'PROCESSING', null, $sessionId);
            return ['sessionId' => $sessionId, 'attemptId' => (int)$attempt->lastInsertId(), 'stage' => $stage, 'expiresInSeconds' => 1200];
        });
    },

    'customer.kycVerifyEmail' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $cleanString, $profileFor, $rows, $exec, $transition, $withTransaction, $hashValue): array {
        if (!in_array($method, ['POST', 'PUT', 'PATCH'], true)) throw new InvalidArgumentException('A write method is required');
        $id = $customerId($user);
        $token = $cleanString($input['token'] ?? null, 'token', 8, 128);
        return $withTransaction($pdo, static function () use ($pdo, $id, $token, $profileFor, $rows, $exec, $transition, $hashValue): array {
            $profile = $profileFor($pdo, $id);
            $profileId = (int)$profile['id'];
            $found = $rows($pdo, 'SELECT id,tokenHash,attempts FROM kyc_email_verifications WHERE profileId=? AND usedAt IS NULL AND expiresAt>UTC_TIMESTAMP() ORDER BY id DESC LIMIT 1 FOR UPDATE', [$profileId]);
            if ($found === [] || (int)$found[0]['attempts'] >= 5) throw new InvalidArgumentException('Invalid or expired email verification token');
            if (!hash_equals((string)$found[0]['tokenHash'], $hashValue((string)$token))) {
                $exec($pdo, 'UPDATE kyc_email_verifications SET attempts=attempts+1 WHERE id=? AND usedAt IS NULL', [(int)$found[0]['id']]);
                throw new InvalidArgumentException('Invalid or expired email verification token');
            }
            $used = $exec($pdo, 'UPDATE kyc_email_verifications SET usedAt=UTC_TIMESTAMP() WHERE id=? AND usedAt IS NULL', [(int)$found[0]['id']]);
            if ($used->rowCount() !== 1) throw new InvalidArgumentException('Invalid or expired email verification token');
            $exec($pdo, 'UPDATE customer_controls SET emailVerified=1 WHERE userId=?', [$id]);
            $state = $transition($pdo, $profileId, $id, 'EMAIL', 'VERIFIED', 'AUTOMATED');
            return ['success' => true, 'level' => $state['level'], 'status' => $state['status']];
        });
    },

    'customer.kycVerifyPhone' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $cleanString, $profileFor, $assertStageReady, $rows, $exec, $transition, $withTransaction, $hmacValue): array {
        if (!in_array($method, ['POST', 'PUT', 'PATCH'], true)) throw new InvalidArgumentException('A write method is required');
        $id = $customerId($user);
        $otp = $cleanString($input['otp'] ?? null, 'otp', 6, 6);
        if (!preg_match('/^\d{6}$/', (string)$otp)) throw new InvalidArgumentException('otp is invalid');
        return $withTransaction($pdo, static function () use ($pdo, $id, $otp, $profileFor, $assertStageReady, $rows, $exec, $transition, $hmacValue): array {
            $profile = $profileFor($pdo, $id);
            $profileId = (int)$profile['id'];
            $assertStageReady($pdo, $profileId, 'PHONE');
            $found = $rows($pdo, 'SELECT id,otpHmac,attempts FROM kyc_phone_verifications WHERE profileId=? AND usedAt IS NULL AND expiresAt>UTC_TIMESTAMP() ORDER BY id DESC LIMIT 1 FOR UPDATE', [$profileId]);
            if ($found === [] || (int)$found[0]['attempts'] >= 5) throw new InvalidArgumentException('Invalid or expired phone verification code');
            $supplied = $hmacValue($profileId . ':' . $otp);
            if (!hash_equals((string)$found[0]['otpHmac'], $supplied)) {
                $exec($pdo, 'UPDATE kyc_phone_verifications SET attempts=attempts+1 WHERE id=? AND usedAt IS NULL', [(int)$found[0]['id']]);
                throw new InvalidArgumentException('Invalid or expired phone verification code');
            }
            $used = $exec($pdo, 'UPDATE kyc_phone_verifications SET usedAt=UTC_TIMESTAMP() WHERE id=? AND usedAt IS NULL', [(int)$found[0]['id']]);
            if ($used->rowCount() !== 1) throw new InvalidArgumentException('Invalid or expired phone verification code');
            $state = $transition($pdo, $profileId, $id, 'PHONE', 'VERIFIED', 'AUTOMATED');
            return ['success' => true, 'level' => $state['level'], 'status' => $state['status']];
        });
    },

    'customer.kycSubmitAddress' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $cleanString, $profileFor, $prepareStage, $exec, $transition, $withTransaction, $center): array {
        if (!in_array($method, ['POST', 'PUT', 'PATCH'], true)) throw new InvalidArgumentException('A write method is required');
        $id = $customerId($user);
        $country = strtoupper((string)$cleanString($input['countryCode'] ?? null, 'countryCode', 2, 8));
        $stateProvince = $cleanString($input['stateProvince'] ?? null, 'stateProvince', 0, 120, false);
        $city = $cleanString($input['city'] ?? null, 'city', 1, 120);
        $district = $cleanString($input['district'] ?? null, 'district', 0, 120, false);
        $addressLine = $cleanString($input['addressLine'] ?? null, 'addressLine', 3, 255);
        $postalCode = $cleanString($input['postalCode'] ?? null, 'postalCode', 0, 40, false);
        $addressMethod = strtoupper((string)($input['method'] ?? 'DECLARATION'));
        if (!in_array($addressMethod, ['DECLARATION', 'PROOF_DOCUMENT', 'ADMIN', 'PROVIDER'], true)) throw new InvalidArgumentException('method is invalid');
        return $withTransaction($pdo, static function () use ($pdo, $id, $country, $stateProvince, $city, $district, $addressLine, $postalCode, $addressMethod, $profileFor, $prepareStage, $exec, $transition, $center): array {
            $profile = $profileFor($pdo, $id);
            $profileId = (int)$profile['id'];
            $prepareStage($pdo, $profileId, $id, 'ADDRESS');
            $exec($pdo, 'INSERT INTO kyc_address_verifications (profileId,countryCode,stateProvince,city,district,addressLine,postalCode,method,status) VALUES (?,?,?,?,?,?,?,?,?)', [$profileId, $country, $stateProvince, $city, $district, $addressLine, $postalCode, $addressMethod, 'MANUAL_REVIEW']);
            $transition($pdo, $profileId, $id, 'ADDRESS', 'REVIEW_REQUIRED', 'AUTOMATED', 'Address declarations require verification');
            return $center($pdo, $id);
        });
    },

    'customer.kycConsent' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $cleanString, $profileFor, $exec, $audit, $withTransaction): array {
        if (!in_array($method, ['POST', 'PUT', 'PATCH'], true)) throw new InvalidArgumentException('A write method is required');
        $id = $customerId($user);
        $purpose = $cleanString($input['purpose'] ?? null, 'purpose', 3, 120);
        $version = $cleanString($input['version'] ?? null, 'version', 1, 40);
        $ip = filter_var($_SERVER['REMOTE_ADDR'] ?? null, FILTER_VALIDATE_IP) ?: null;
        if (is_string($ip)) $ip = substr($ip, 0, 128);
        return $withTransaction($pdo, static function () use ($pdo, $id, $purpose, $version, $ip, $profileFor, $exec, $audit): array {
            $profile = $profileFor($pdo, $id);
            $profileId = (int)$profile['id'];
            $exec($pdo, 'INSERT INTO kyc_consents (profileId,purpose,version,ipAddress) VALUES (?,?,?,?)', [$profileId, $purpose, $version, $ip]);
            $audit($pdo, 'CONSENT_RECORDED', $profileId, $id, $id, 'CUSTOMER', 'PASS', null, null, null, ['purpose' => $purpose, 'version' => $version]);
            return ['success' => true, 'purpose' => $purpose, 'version' => $version, 'consentedAt' => gmdate('Y-m-d H:i:s')];
        });
    },
];

/* The public dispatcher accepts a single operation path segment, so expose the
 * source router procedure names as well as the namespaced compatibility keys. */
$handlers['kycCenter'] = $handlers['customer.kycCenter'];
$handlers['kycStartStage'] = $handlers['customer.kycStartStage'];
$handlers['kycVerifyEmail'] = $handlers['customer.kycVerifyEmail'];
$handlers['kycVerifyPhone'] = $handlers['customer.kycVerifyPhone'];
$handlers['kycSubmitAddress'] = $handlers['customer.kycSubmitAddress'];
$handlers['kycConsent'] = $handlers['customer.kycConsent'];

$readOnlyCenter = static function (PDO $pdo, int $userId) use ($rows): array {
    $profiles = $rows($pdo, 'SELECT id,userId,overallStatus,currentLevel,riskLevel,grandfathered,createdAt,updatedAt FROM kyc_profiles WHERE userId=? LIMIT 1', [$userId]);
    if ($profiles === []) {
        $definitions = $rows($pdo, 'SELECT code,name,description,whyRequired,`rank` FROM kyc_stages WHERE enabled=? ORDER BY `rank`', [1]);
        $items = [];
        foreach ($definitions as $stage) {
            $items[] = [
                'stageCode' => (string)$stage['code'],
                'state' => 'NOT_STARTED',
                'source' => null,
                'verifiedAt' => null,
                'failureReason' => null,
                'name' => (string)$stage['name'],
                'description' => $stage['description'],
                'whyRequired' => $stage['whyRequired'],
                'rank' => (int)$stage['rank'],
            ];
        }
        return ['profile' => null, 'stages' => $items, 'consent' => null, 'providerVerificationAvailable' => false];
    }
    $profile = $profiles[0];
    $stageRows = $rows(
        $pdo,
        'SELECT s.stageCode,s.state,s.source,s.verifiedAt,s.failureReason,k.name,k.description,k.whyRequired,k.`rank`
         FROM kyc_stage_states s JOIN kyc_stages k ON k.code=s.stageCode
         WHERE s.profileId=? ORDER BY k.`rank`',
        [(int)$profile['id']]
    );
    $consentRows = $rows($pdo, 'SELECT purpose,version,createdAt FROM kyc_consents WHERE profileId=? ORDER BY id DESC LIMIT 1', [(int)$profile['id']]);
    return [
        'profile' => $profile,
        'stages' => $stageRows,
        'consent' => $consentRows[0] ?? null,
        'providerVerificationAvailable' => false,
    ];
};
$readOnlyCenterHandler = static function (PDO $pdo, ?array $user, array $input, string $method) use ($customerId, $withTransaction, $readOnlyCenter): array {
    if ($method !== 'GET') {
        throw new InvalidArgumentException('GET is required');
    }
    $id = $customerId($user);
    return $withTransaction($pdo, static fn(): array => $readOnlyCenter($pdo, $id));
};
$handlers['customer.kycCenter'] = $readOnlyCenterHandler;
$handlers['kycCenter'] = $readOnlyCenterHandler;
unset(
    $handlers['customer.kycStartStage'], $handlers['kycStartStage'],
    $handlers['customer.kycVerifyEmail'], $handlers['kycVerifyEmail'],
    $handlers['customer.kycVerifyPhone'], $handlers['kycVerifyPhone'],
    $handlers['customer.kycSubmitAddress'], $handlers['kycSubmitAddress'],
    $handlers['customer.kycConsent'], $handlers['kycConsent']
);

return $handlers;
