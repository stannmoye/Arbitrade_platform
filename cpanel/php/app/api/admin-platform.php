<?php
declare(strict_types=1);

/*
 * PHP port of the administrator KYC/risk procedures. The API dispatcher owns
 * module role and CSRF enforcement; handlers retain a role check and validate
 * every input. No provider, OAuth, storage, email, background, or ledger write
 * is performed here.
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
    $owns = !$pdo->inTransaction();
    if ($owns) {
        $pdo->beginTransaction();
    }
    try {
        $pdo->exec("SET time_zone = '+00:00'");
        $result = $callback();
        if ($owns) {
            $pdo->commit();
        }
        return $result;
    } catch (Throwable $error) {
        if ($owns && $pdo->inTransaction()) {
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
    if ($number < 1 || $number > $max) {
        throw new InvalidArgumentException($field . ' is invalid');
    }
    return $number;
};

$intInRange = static function (mixed $value, string $field, int $min, int $max): int {
    if (is_int($value)) {
        $number = $value;
    } elseif (is_string($value) && preg_match('/^-?[0-9]+$/', $value) === 1) {
        $parsed = filter_var($value, FILTER_VALIDATE_INT);
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

$floatInRange = static function (mixed $value, string $field, float $min, float $max): float {
    if (!is_int($value) && !is_float($value) && !(is_string($value) && preg_match('/^-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)$/', $value) === 1)) {
        throw new InvalidArgumentException($field . ' is invalid');
    }
    $number = (float)$value;
    if (!is_finite($number) || $number < $min || $number > $max) {
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

$stageCodes = ['EMAIL', 'PHONE', 'ADDRESS', 'IDENTITY_DOCUMENT', 'FACE_LIVENESS'];
$coreStages = ['EMAIL', 'PHONE', 'ADDRESS', 'IDENTITY_DOCUMENT'];
$stageNames = [
    'EMAIL' => 'Email',
    'PHONE' => 'Phone',
    'ADDRESS' => 'Address',
    'IDENTITY_DOCUMENT' => 'Identity document',
    'FACE_LIVENESS' => 'Live face & liveness',
];

$assertStageReady = static function (PDO $pdo, int $profileId, string $stage, array $stageCodes) use ($rows): void {
    $index = array_search($stage, $stageCodes, true);
    if ($index === false) {
        throw new InvalidArgumentException('Unknown KYC stage');
    }
    if ($index === 0) {
        return;
    }
    $required = array_slice($stageCodes, 0, $index);
    $placeholders = implode(',', array_fill(0, count($required), '?'));
    $found = $rows($pdo, "SELECT stageCode,state FROM kyc_stage_states WHERE profileId=? AND stageCode IN ($placeholders)", array_merge([$profileId], $required));
    $states = [];
    foreach ($found as $item) {
        $states[(string)$item['stageCode']] = (string)$item['state'];
    }
    foreach ($required as $requiredStage) {
        if (($states[$requiredStage] ?? null) !== 'VERIFIED') {
            throw new InvalidArgumentException('Complete ' . ($stageNames[$requiredStage] ?? $requiredStage) . ' before continuing to ' . ($stageNames[$stage] ?? $stage) . '.');
        }
    }
};

$audit = static function (PDO $pdo, string $event, ?int $profileId, ?int $customerId, ?int $actorId, string $actorType, ?string $result = null, ?string $reason = null, ?array $payload = null) use ($rows, $exec): void {
    $previousRows = $rows($pdo, 'SELECT recordHash FROM kyc_audit_logs ORDER BY id DESC LIMIT 1 FOR UPDATE');
    $previous = (string)($previousRows[0]['recordHash'] ?? 'GENESIS');
    $createdRows = $rows($pdo, "SELECT DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z') AS createdAtIso");
    $createdAtIso = (string)($createdRows[0]['createdAtIso'] ?? gmdate('Y-m-d\TH:i:s.000\Z'));
    $payloadJson = json_encode($payload ?? new stdClass(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($payloadJson === false) {
        $payloadJson = '{}';
    }
    $parts = [$previous, $event, $profileId, $customerId, $actorId, $actorType, $result, $reason, '', $createdAtIso, $payloadJson];
    $recordHash = hash('sha256', implode('|', array_map(static fn(mixed $part): string => $part === null ? '' : (string)$part, $parts)));
    $createdAt = str_replace(['T', '.000Z'], [' ', ''], $createdAtIso);
    $exec($pdo, 'INSERT INTO kyc_audit_logs (event,profileId,customerId,actorId,actorType,result,reason,sessionId,provider,providerVersion,payloadJson,previousHash,recordHash,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [$event, $profileId, $customerId, $actorId, $actorType, $result, $reason, null, null, null, $payloadJson, $previous, $recordHash, $createdAt]);
};

$transition = static function (PDO $pdo, int $profileId, int $customerId, string $stage, string $next, string $reason, array $stageCodes) use ($rows, $exec, $audit): void {
    $currentRows = $rows($pdo, 'SELECT state FROM kyc_stage_states WHERE profileId=? AND stageCode=? FOR UPDATE', [$profileId, $stage]);
    if ($currentRows === []) {
        throw new InvalidArgumentException('Unknown KYC stage');
    }
    $current = (string)$currentRows[0]['state'];
    $allowed = [
        'REVIEW_REQUIRED' => ['VERIFIED', 'REJECTED'],
    ];
    if (!in_array($next, $allowed[$current] ?? [], true)) {
        throw new InvalidArgumentException('Illegal KYC transition ' . $current . ' → ' . $next);
    }
    $verifiedAt = $next === 'VERIFIED' ? gmdate('Y-m-d H:i:s') : null;
    $exec($pdo, 'UPDATE kyc_stage_states SET state=?,source=?,verifiedAt=?,failureReason=?,lastAttemptAt=NOW() WHERE profileId=? AND stageCode=?', [$next, 'ADMIN', $verifiedAt, $reason, $profileId, $stage]);
    $event = $next === 'VERIFIED' ? 'STAGE_APPROVED' : 'STAGE_REJECTED';
    $audit($pdo, $event, $profileId, $customerId, null, 'ADMIN', $next, $reason);
    $stageRows = $rows($pdo, 'SELECT stageCode,state FROM kyc_stage_states WHERE profileId=?', [$profileId]);
    $level = 'L0';
    foreach ($stageRows as $stageRow) {
        if ((string)$stageRow['state'] === 'VERIFIED') {
            $level = match ((string)$stageRow['stageCode']) {
                'PHONE' => max($level, 'L1'),
                'ADDRESS' => max($level, 'L2'),
                'IDENTITY_DOCUMENT' => max($level, 'L3'),
                'FACE_LIVENESS' => max($level, 'L4'),
                default => $level,
            };
        }
    }
    $status = 'NOT_STARTED';
    $states = array_map(static fn(array $row): string => (string)$row['state'], $stageRows);
    if (in_array('REVIEW_REQUIRED', $states, true)) {
        $status = 'REVIEW_REQUIRED';
    } elseif (in_array('REJECTED', $states, true)) {
        $status = 'REJECTED';
    } elseif (in_array('FAILED', $states, true)) {
        $status = 'RETRY_AVAILABLE';
    } elseif ($states !== [] && count(array_filter($states, static fn(string $state): bool => $state === 'VERIFIED')) === count($states)) {
        $status = 'VERIFIED';
    } elseif (array_intersect($states, ['IN_PROGRESS', 'PROCESSING']) !== []) {
        $status = 'IN_PROGRESS';
    }
    $exec($pdo, 'UPDATE kyc_profiles SET currentLevel=?,overallStatus=? WHERE id=?', [$level, $status, $profileId]);
};

$emailConfigured = static function (PDO $pdo) use ($rows): bool {
    $providerRows = $rows($pdo, 'SELECT settingKey,settingValue FROM app_settings WHERE settingKey IN (?, ?, ?, ?)', ['email.provider', 'email.fromAddress', 'email.smtp', 'email.mode']);
    $settings = [];
    foreach ($providerRows as $row) {
        $settings[(string)$row['settingKey']] = (string)$row['settingValue'];
    }
    if (isset($settings['email.provider']) && strtolower($settings['email.provider']) === 'disabled') {
        return false;
    }
    $from = trim($settings['email.fromAddress'] ?? '');
    if ($from === '' || filter_var($from, FILTER_VALIDATE_EMAIL) === false) {
        return false;
    }
    $smtp = [];
    if (!empty($settings['email.smtp'])) {
        $decoded = json_decode($settings['email.smtp'], true);
        if (is_array($decoded)) {
            $smtp = $decoded;
        }
    }
    $mode = strtolower((string)($smtp['mode'] ?? $settings['email.mode'] ?? 'direct'));
    if ($mode === 'external') {
        $host = trim((string)($smtp['host'] ?? ''));
        $port = filter_var($smtp['port'] ?? null, FILTER_VALIDATE_INT);
        $hasAuth = trim((string)($smtp['user'] ?? '')) === '' || !empty($smtp['passwordCipher']) || !empty($smtp['password']);
        return $host !== '' && $port !== false && $port > 0 && $port <= 65535 && $hasAuth;
    }
    return is_executable('/usr/sbin/sendmail') || is_executable('/usr/lib/sendmail');
};

$getCenter = static function (PDO $pdo, int $userId) use ($rows): array {
    $profile = $rows($pdo, 'SELECT * FROM kyc_profiles WHERE userId=? LIMIT 1', [$userId])[0] ?? null;
    if ($profile === null) {
        throw new InvalidArgumentException('KYC profile not found');
    }
    $stages = $rows($pdo, 'SELECT s.stageCode,s.state,s.source,s.verifiedAt,s.failureReason,k.name,k.description,k.whyRequired,k.`rank` FROM kyc_stage_states s JOIN kyc_stages k ON k.code=s.stageCode WHERE s.profileId=? ORDER BY k.`rank`', [(int)$profile['id']]);
    $consent = $rows($pdo, 'SELECT purpose,version,consentedAt FROM kyc_consents WHERE profileId=? ORDER BY id DESC LIMIT 1', [(int)$profile['id']])[0] ?? null;
    return [
        'profile' => $profile,
        'stages' => $stages,
        'consent' => $consent,
        'demoOnly' => false,
        'customerMessages' => [
            'email' => 'Verify your email address so we can confirm that you control this account.',
            'phone' => 'Verify your phone number to protect your account and enable secure account recovery.',
            'address' => 'Provide your residential address so we can establish where you live.',
        ],
    ];
};

$handlers = [
    'adminDashboard' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($adminId, $requireRead, $withTransaction, $rows): array {
        $adminId($user);
        $requireRead($method);
        return $withTransaction($pdo, static function () use ($pdo, $rows): array {
            $count = $rows($pdo, "SELECT COUNT(*) total, SUM(CASE WHEN COALESCE(p.overallStatus,'NOT_STARTED')='NOT_STARTED' THEN 1 ELSE 0 END) notStarted, SUM(CASE WHEN p.overallStatus='IN_PROGRESS' THEN 1 ELSE 0 END) inProgress, SUM(CASE WHEN p.overallStatus='VERIFIED' THEN 1 ELSE 0 END) verified, SUM(CASE WHEN p.riskLevel IN ('HIGH_RISK','CRITICAL_REVIEW') THEN 1 ELSE 0 END) highRisk FROM users u LEFT JOIN kyc_profiles p ON p.userId=u.id WHERE u.role='user'")[0] ?? [];
            $review = $rows($pdo, "SELECT COUNT(*) manualReview FROM kyc_stage_states s JOIN kyc_profiles p ON p.id=s.profileId JOIN users u ON u.id=p.userId WHERE u.role='user' AND s.state='REVIEW_REQUIRED'")[0] ?? [];
            $metrics = $rows($pdo, "SELECT s.stageCode,COUNT(*) started, SUM(CASE WHEN s.state='VERIFIED' THEN 1 ELSE 0 END) verified, SUM(CASE WHEN s.state='REVIEW_REQUIRED' THEN 1 ELSE 0 END) inReview, SUM(CASE WHEN s.state IN ('IN_PROGRESS','PROCESSING') THEN 1 ELSE 0 END) inProgress FROM kyc_stage_states s JOIN kyc_profiles p ON p.id=s.profileId JOIN users u ON u.id=p.userId WHERE u.role='user' GROUP BY s.stageCode");
            foreach (['total', 'notStarted', 'inProgress', 'verified', 'highRisk'] as $key) {
                $count[$key] = (int)($count[$key] ?? 0);
            }
            $count['manualReview'] = (int)($review['manualReview'] ?? 0);
            return array_merge($count, ['stageMetrics' => $metrics]);
        });
    },

    'adminQueue' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($adminId, $requireRead, $withTransaction, $rows, $stageNames): array {
        $adminId($user);
        $requireRead($method);
        return $withTransaction($pdo, static function () use ($pdo, $rows, $stageNames): array {
            $profiles = $rows($pdo, "SELECT p.id profileId,p.userId,p.overallStatus,p.currentLevel,p.riskLevel,p.updatedAt,u.email,u.name FROM kyc_profiles p JOIN users u ON u.id=p.userId WHERE u.role='user' AND EXISTS (SELECT 1 FROM kyc_stage_states s WHERE s.profileId=p.id AND s.state='REVIEW_REQUIRED') ORDER BY p.updatedAt DESC LIMIT 200");
            $queue = [];
            foreach ($profiles as $profile) {
                $stages = $rows($pdo, 'SELECT s.stageCode,s.state,k.name FROM kyc_stage_states s JOIN kyc_stages k ON k.code=s.stageCode WHERE s.profileId=? ORDER BY k.`rank`', [(int)$profile['profileId']]);
                foreach ($stages as $stage) {
                    if ((string)$stage['state'] !== 'REVIEW_REQUIRED') {
                        continue;
                    }
                    $evidence = null;
                    if ($stage['stageCode'] === 'ADDRESS') {
                        $evidence = $rows($pdo, 'SELECT countryCode,stateProvince,city,method,status,createdAt FROM kyc_address_verifications WHERE profileId=? ORDER BY id DESC LIMIT 1', [(int)$profile['profileId']])[0] ?? null;
                    } elseif ($stage['stageCode'] === 'IDENTITY_DOCUMENT') {
                        $evidence = $rows($pdo, 'SELECT documentType,countryCode,status,createdAt FROM kyc_documents WHERE profileId=? ORDER BY id DESC LIMIT 1', [(int)$profile['profileId']])[0] ?? null;
                    } elseif ($stage['stageCode'] === 'FACE_LIVENESS') {
                        $evidence = $rows($pdo, 'SELECT outcome,provider,confidence,createdAt FROM kyc_liveness_checks WHERE profileId=? ORDER BY id DESC LIMIT 1', [(int)$profile['profileId']])[0] ?? null;
                    }
                    $queue[] = ['profileId' => (int)$profile['profileId'], 'userId' => (int)$profile['userId'], 'name' => $profile['name'], 'email' => $profile['email'], 'overallStatus' => $profile['overallStatus'], 'currentLevel' => $profile['currentLevel'], 'riskLevel' => $profile['riskLevel'], 'updatedAt' => $profile['updatedAt'], 'stageCode' => (string)$stage['stageCode'], 'stageName' => $stage['name'] ?: ($stageNames[(string)$stage['stageCode']] ?? (string)$stage['stageCode']), 'stageState' => (string)$stage['state'], 'reviewEvidence' => $evidence];
                }
            }
            return $queue;
        });
    },

    'adminCustomerDirectory' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($adminId, $requireRead, $withTransaction, $rows, $positiveInt): array {
        $adminId($user);
        $requireRead($method);
        $page = array_key_exists('page', $input) ? $positiveInt($input['page'], 'page') : 1;
        $pageSize = array_key_exists('pageSize', $input) ? $positiveInt($input['pageSize'], 'pageSize', 100) : 25;
        $pageSize = max(10, min(100, $pageSize));
        $search = '';
        if (array_key_exists('search', $input)) {
            if (!is_string($input['search'])) {
                throw new InvalidArgumentException('search is invalid');
            }
            $search = substr(trim($input['search']), 0, 100);
        }
        $allowed = ['NOT_STARTED', 'IN_PROGRESS', 'VERIFIED', 'REVIEW_REQUIRED', 'RETRY_AVAILABLE', 'REJECTED'];
        $status = $input['status'] ?? '';
        if ($status !== '' && (!is_string($status) || !in_array($status, $allowed, true))) {
            throw new InvalidArgumentException('status is invalid');
        }
        return $withTransaction($pdo, static function () use ($pdo, $rows, $page, $pageSize, $search, $status): array {
            $where = "WHERE u.role='user'";
            $params = [];
            if ($search !== '') {
                $where .= " AND (COALESCE(u.name,'') LIKE ? ESCAPE '\\\\' OR COALESCE(u.email,'') LIKE ? ESCAPE '\\\\')";
                $escaped = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $search);
                $params[] = '%' . $escaped . '%';
                $params[] = '%' . $escaped . '%';
            }
            if ($status !== '') {
                $where .= " AND COALESCE(p.overallStatus,'NOT_STARTED')=?";
                $params[] = $status;
            }
            $count = (int)($rows($pdo, "SELECT COUNT(*) total FROM users u LEFT JOIN kyc_profiles p ON p.userId=u.id $where", $params)[0]['total'] ?? 0);
            $offset = ($page - 1) * $pageSize;
            $customers = $rows($pdo, "SELECT u.id customerId,u.email,u.name,u.packageName,p.id profileId,COALESCE(p.overallStatus,'NOT_STARTED') overallStatus,COALESCE(p.currentLevel,'L0') currentLevel,p.riskLevel,p.updatedAt FROM users u LEFT JOIN kyc_profiles p ON p.userId=u.id $where ORDER BY u.id DESC LIMIT " . $pageSize . ' OFFSET ' . $offset, $params);
            $profileIds = array_values(array_filter(array_map(static fn(array $row): int => (int)($row['profileId'] ?? 0), $customers), static fn(int $id): bool => $id > 0));
            $states = [];
            if ($profileIds !== []) {
                $placeholders = implode(',', array_fill(0, count($profileIds), '?'));
                foreach ($rows($pdo, "SELECT p.userId,s.stageCode,s.state,s.verifiedAt FROM kyc_profiles p JOIN kyc_stage_states s ON s.profileId=p.id WHERE p.id IN ($placeholders)", $profileIds) as $state) {
                    $states[(int)$state['userId']][(string)$state['stageCode']] = $state;
                }
            }
            $items = [];
            foreach ($customers as $customer) {
                $customerId = (int)$customer['customerId'];
                $customerStates = $states[$customerId] ?? [];
                $stages = [];
                foreach (['EMAIL', 'PHONE', 'ADDRESS', 'IDENTITY_DOCUMENT', 'FACE_LIVENESS'] as $code) {
                    $stages[] = ['stageCode' => $code, 'name' => ['EMAIL' => 'Email', 'PHONE' => 'Phone', 'ADDRESS' => 'Address', 'IDENTITY_DOCUMENT' => 'Identity document', 'FACE_LIVENESS' => 'Live face & liveness'][$code], 'state' => (string)($customerStates[$code]['state'] ?? 'NOT_STARTED'), 'verifiedAt' => $customerStates[$code]['verifiedAt'] ?? null, 'required' => in_array($code, ['EMAIL', 'PHONE', 'ADDRESS', 'IDENTITY_DOCUMENT'], true)];
                }
                $coreCompleted = count(array_filter($stages, static fn(array $stage): bool => $stage['required'] && $stage['state'] === 'VERIFIED'));
                $nextStage = null;
                foreach ($stages as $stage) {
                    if ($stage['required'] && $stage['state'] !== 'VERIFIED') {
                        $nextStage = $stage['stageCode'];
                        break;
                    }
                }
                $items[] = ['customerId' => $customerId, 'profileId' => $customer['profileId'] ? (int)$customer['profileId'] : null, 'email' => $customer['email'], 'name' => $customer['name'], 'packageName' => $customer['packageName'], 'overallStatus' => $customer['overallStatus'], 'currentLevel' => $customer['currentLevel'], 'riskLevel' => $customer['riskLevel'] ?: 'LOW_RISK', 'updatedAt' => $customer['updatedAt'], 'stages' => $stages, 'coreCompleted' => $coreCompleted, 'coreRequired' => 4, 'nextStage' => $nextStage];
            }
            return ['items' => $items, 'total' => $count, 'page' => $page, 'pageSize' => $pageSize, 'pages' => max(1, (int)ceil($count / $pageSize))];
        });
    },

    'getAdminKycSettings' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($adminId, $requireRead, $withTransaction, $rows, $emailConfigured, $coreStages): array {
        $adminId($user);
        $requireRead($method);
        return $withTransaction($pdo, static function () use ($pdo, $rows, $emailConfigured, $coreStages): array {
            $stages = $rows($pdo, 'SELECT code,name,description,whyRequired,`rank`,enabled FROM kyc_stages ORDER BY `rank`');
            $settingRows = $rows($pdo, 'SELECT settingKey,settingValue,updatedAt FROM kyc_settings ORDER BY settingKey');
            $providerRows = $rows($pdo, 'SELECT capability,provider,enabled,healthStatus FROM kyc_provider_configs ORDER BY capability,priority');
            $raw = [];
            foreach ($settingRows as $item) {
                $raw[(string)$item['settingKey']] = $item['settingValue'];
            }
            $num = static function (array $raw, string $key, float|int $fallback): float|int {
                return array_key_exists($key, $raw) && is_numeric($raw[$key]) ? (float)$raw[$key] : $fallback;
            };
            $registry = [];
            $screening = false;
            foreach ($providerRows as $provider) {
                $entry = ['capability' => $provider['capability'], 'provider' => $provider['provider'], 'enabled' => (bool)$provider['enabled'], 'healthStatus' => $provider['healthStatus']];
                $registry[] = $entry;
                if ($entry['enabled'] && $entry['healthStatus'] === 'HEALTHY') {
                    $screening = true;
                }
            }
            $email = $emailConfigured($pdo);
            foreach ($stages as &$stage) {
                $stage['required'] = in_array((string)$stage['code'], $coreStages, true);
                $stage['enabled'] = (bool)$stage['enabled'];
            }
            unset($stage);
            return ['draftOnly' => true, 'stages' => $stages, 'settings' => ['emailExpiryMinutes' => (int)$num($raw, 'email_expiry_minutes', 15), 'phoneExpiryMinutes' => (int)$num($raw, 'phone_expiry_minutes', 10), 'rawRetentionDays' => (int)$num($raw, 'retention_raw_days', 1), 'extractedRetentionDays' => (int)$num($raw, 'retention_extracted_days', 365), 'resultRetentionDays' => (int)$num($raw, 'retention_results_days', 2555), 'faceMatchPassThreshold' => $num($raw, 'face_match_pass_threshold', 0.82), 'faceMatchReviewThreshold' => $num($raw, 'face_match_review_threshold', 0.68), 'reviewSlaHours' => (int)$num($raw, 'review_sla_hours', 24)], 'providers' => ['email' => ['configured' => $email, 'label' => $email ? 'Configured' : 'Not configured'], 'phone' => ['configured' => false, 'label' => 'SMS provider not configured'], 'identityDocument' => ['configured' => false, 'label' => 'Secure capture provider not configured'], 'faceLiveness' => ['configured' => false, 'label' => 'Liveness provider not configured'], 'screening' => ['configured' => $screening, 'label' => $providerRows !== [] ? 'Provider registry present; verify health before activation' : 'Screening provider not configured'], 'registry' => $registry]];
        });
    },

    'updateAdminKycSettings' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($adminId, $requireWrite, $withTransaction, $intInRange, $floatInRange, $exec, $audit): array {
        $actor = $adminId($user);
        $requireWrite($method);
        $values = ['email_expiry_minutes' => $intInRange($input['emailExpiryMinutes'] ?? null, 'emailExpiryMinutes', 5, 60), 'phone_expiry_minutes' => $intInRange($input['phoneExpiryMinutes'] ?? null, 'phoneExpiryMinutes', 1, 30), 'retention_raw_days' => $intInRange($input['rawRetentionDays'] ?? null, 'rawRetentionDays', 1, 30), 'retention_extracted_days' => $intInRange($input['extractedRetentionDays'] ?? null, 'extractedRetentionDays', 30, 3650), 'retention_results_days' => $intInRange($input['resultRetentionDays'] ?? null, 'resultRetentionDays', 365, 3650), 'face_match_pass_threshold' => $floatInRange($input['faceMatchPassThreshold'] ?? null, 'faceMatchPassThreshold', 0.7, 0.99), 'face_match_review_threshold' => $floatInRange($input['faceMatchReviewThreshold'] ?? null, 'faceMatchReviewThreshold', 0.5, 0.98), 'review_sla_hours' => $intInRange($input['reviewSlaHours'] ?? null, 'reviewSlaHours', 1, 168)];
        if ($values['face_match_review_threshold'] >= $values['face_match_pass_threshold']) {
            throw new InvalidArgumentException('The review threshold must be lower than the pass threshold.');
        }
        return $withTransaction($pdo, static function () use ($pdo, $actor, $values, $exec, $audit): array {
            foreach ($values as $key => $value) {
                $exec($pdo, 'INSERT INTO kyc_settings (settingKey,settingValue,updatedBy) VALUES (?,?,?) ON DUPLICATE KEY UPDATE settingValue=VALUES(settingValue),updatedBy=VALUES(updatedBy),updatedAt=UTC_TIMESTAMP()', [$key, (string)$value, $actor]);
            }
            $audit($pdo, 'KYC_POLICY_DRAFT_UPDATED', null, null, $actor, 'ADMIN', 'SAVED', 'Saved KYC settings; provider-backed automated verification is not configured', $values);
            return ['success' => true];
        });
    },

    'adminAuditEvents' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($adminId, $requireRead, $withTransaction, $rows): array {
        $adminId($user);
        $requireRead($method);
        return $withTransaction($pdo, static fn(): array => $rows($pdo, 'SELECT l.id,l.event,l.profileId,l.customerId,l.actorId,l.actorType,l.result,l.reason,l.createdAt,actor.email actorEmail,customer.email customerEmail FROM kyc_audit_logs l LEFT JOIN users actor ON actor.id=l.actorId LEFT JOIN users customer ON customer.id=l.customerId ORDER BY l.id DESC LIMIT 100'));
    },

    'adminDecision' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($adminId, $requireWrite, $withTransaction, $positiveInt, $cleanString, $rows, $exec, $assertStageReady, $transition, $stageCodes, $getCenter): array {
        $actor = $adminId($user);
        $requireWrite($method);
        $profileId = $positiveInt($input['profileId'] ?? null, 'profileId');
        $stage = $cleanString($input['stage'] ?? null, 'stage', 1, 40);
        $decision = $cleanString($input['decision'] ?? null, 'decision', 1, 10);
        $reason = $cleanString($input['reason'] ?? null, 'reason', 5, 2000);
        if (!in_array($stage, $stageCodes, true)) {
            throw new InvalidArgumentException('Unknown KYC stage');
        }
        if (!in_array($stage, ['ADDRESS', 'IDENTITY_DOCUMENT', 'FACE_LIVENESS'], true)) {
            throw new InvalidArgumentException('This stage is verified by its provider, not through manual evidence review.');
        }
        if (!in_array($decision, ['APPROVE', 'REJECT'], true)) {
            throw new InvalidArgumentException('decision is invalid');
        }
        return $withTransaction($pdo, static function () use ($pdo, $actor, $profileId, $stage, $decision, $reason, $rows, $exec, $assertStageReady, $transition, $stageCodes, $getCenter): array {
            $profile = $rows($pdo, 'SELECT userId FROM kyc_profiles WHERE id=? LIMIT 1', [$profileId])[0] ?? null;
            if (!$profile) {
                throw new InvalidArgumentException('KYC profile not found');
            }
            $assertStageReady($pdo, $profileId, $stage, $stageCodes);
            $current = $rows($pdo, 'SELECT state FROM kyc_stage_states WHERE profileId=? AND stageCode=? FOR UPDATE', [$profileId, $stage])[0] ?? null;
            if (($current['state'] ?? null) !== 'REVIEW_REQUIRED') {
                throw new InvalidArgumentException('Only a stage in manual review can be approved or rejected.');
            }
            $evidenceTable = ['ADDRESS' => 'kyc_address_verifications', 'IDENTITY_DOCUMENT' => 'kyc_documents', 'FACE_LIVENESS' => 'kyc_liveness_checks'][$stage];
            if ($rows($pdo, "SELECT id FROM $evidenceTable WHERE profileId=? ORDER BY id DESC LIMIT 1", [$profileId]) === []) {
                throw new InvalidArgumentException('A review decision cannot be recorded without stage evidence.');
            }
            if ($decision === 'APPROVE') {
                $exec($pdo, 'INSERT INTO kyc_admin_overrides (profileId,stageCode,requestedBy,status,reason) VALUES (?,?,?,?,?)', [$profileId, $stage, $actor, 'APPLIED', $reason]);
            }
            $next = $decision === 'APPROVE' ? 'VERIFIED' : 'REJECTED';
            $transition($pdo, $profileId, (int)$profile['userId'], $stage, $next, $reason, $stageCodes);
            $reviewStatus = $decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
            $update = $exec($pdo, "UPDATE kyc_manual_reviews SET status=?,assignedAdminId=?,reason=?,updatedAt=UTC_TIMESTAMP() WHERE profileId=? AND stageCode=? AND status='OPEN'", [$reviewStatus, $actor, $reason, $profileId, $stage]);
            if ($update->rowCount() === 0) {
                $exec($pdo, 'INSERT INTO kyc_manual_reviews (profileId,stageCode,status,assignedAdminId,reason) VALUES (?,?,?,?,?)', [$profileId, $stage, $reviewStatus, $actor, $reason]);
            }
            return $getCenter($pdo, (int)$profile['userId']);
        });
    },

    'adminOverride' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($adminId, $requireWrite, $positiveInt, $cleanString): array {
        $adminId($user);
        $requireWrite($method);
        $input['decision'] = 'APPROVE';
        /* The dispatcher invokes the canonical decision handler; this marker is replaced below. */
        throw new InvalidArgumentException('Use adminDecision for verified manual KYC decisions.');
    },

    'verifyAuditChain' => static function (PDO $pdo, ?array $user, array $input, string $method) use ($adminId, $requireRead, $withTransaction, $rows): array {
        $adminId($user);
        $requireRead($method);
        return $withTransaction($pdo, static function () use ($pdo, $rows): array {
            $items = $rows($pdo, "SELECT id,event,profileId,customerId,actorId,actorType,result,reason,sessionId,payloadJson,previousHash,recordHash,DATE_FORMAT(createdAt, '%Y-%m-%dT%H:%i:%s.000Z') AS createdAtIso FROM kyc_audit_logs ORDER BY id ASC");
            $previous = 'GENESIS';
            foreach ($items as $item) {
                $payload = (string)($item['payloadJson'] ?? '{}');
                $parts = [$previous, $item['event'], $item['profileId'], $item['customerId'], $item['actorId'], $item['actorType'], $item['result'], $item['reason'], $item['sessionId'], $item['createdAtIso'], $payload];
                $expected = hash('sha256', implode('|', array_map(static fn(mixed $part): string => $part === null ? '' : (string)$part, $parts)));
                if ((string)($item['previousHash'] ?? '') !== $previous || (string)$item['recordHash'] !== $expected) {
                    return ['valid' => false, 'brokenAt' => (int)$item['id']];
                }
                $previous = (string)$item['recordHash'];
            }
            return ['valid' => true, 'records' => count($items)];
        });
    },
];

/* adminOverride is the source alias of adminDecision; closure assignment keeps exact procedure names. */
$handlers['adminOverride'] = static function (PDO $pdo, ?array $user, array $input, string $method) use ($handlers): array {
    $input['decision'] = 'APPROVE';
    return $handlers['adminDecision']($pdo, $user, $input, $method);
};

return $handlers;
