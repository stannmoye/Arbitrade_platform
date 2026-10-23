CREATE TABLE IF NOT EXISTS `customer_api_notification_preferences` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `whatsappNumber` varchar(32) NOT NULL DEFAULT '',
  `whatsappOptIn` tinyint(1) NOT NULL DEFAULT 0,
  `whatsappVerifiedAt` timestamp NULL DEFAULT NULL,
  `whatsappVerificationCodeHash` varchar(64) NULL DEFAULT NULL,
  `whatsappVerificationExpiresAt` timestamp NULL DEFAULT NULL,
  `whatsappVerificationSentAt` timestamp NULL DEFAULT NULL,
  `whatsappVerificationAttempts` int NOT NULL DEFAULT 0,
  `whatsappEventsJson` text NOT NULL,
  `inAppEnabled` tinyint(1) NOT NULL DEFAULT 1,
  `dailySummaryEnabled` tinyint(1) NOT NULL DEFAULT 0,
  `dailyStatementEnabled` tinyint(1) NOT NULL DEFAULT 0,
  `feeSummaryEnabled` tinyint(1) NOT NULL DEFAULT 0,
  `securityAlertsEnabled` tinyint(1) NOT NULL DEFAULT 1,
  `timezone` varchar(80) NOT NULL DEFAULT 'Africa/Lagos',
  `dailyReportTime` varchar(5) NOT NULL DEFAULT '08:00',
  `lastDailyReportDate` varchar(10) NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_api_notify_user_uq` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `customer_api_webhooks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `name` varchar(80) NOT NULL,
  `endpointUrl` varchar(500) NOT NULL,
  `eventsJson` text NOT NULL,
  `secretCiphertext` longtext NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `revokedAt` timestamp NULL DEFAULT NULL,
  `lastDeliveredAt` timestamp NULL DEFAULT NULL,
  `lastResponseCode` int NULL DEFAULT NULL,
  `lastErrorCode` varchar(100) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `customer_api_webhooks_user_idx` (`userId`, `createdAt`),
  KEY `customer_api_webhooks_active_idx` (`userId`, `revokedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `api_provider_credentials` (
  `id` int NOT NULL AUTO_INCREMENT,
  `providerKey` varchar(64) NOT NULL,
  `encryptedPayload` longtext NOT NULL,
  `updatedBy` int NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `api_provider_credentials_key_uq` (`providerKey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `api_notification_deliveries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `eventKey` varchar(100) NOT NULL,
  `channel` enum('in_app','whatsapp','webhook','email') NOT NULL,
  `status` enum('queued','sending','sent','failed','skipped') NOT NULL DEFAULT 'queued',
  `payloadJson` longtext NOT NULL,
  `dedupeKey` varchar(64) NOT NULL,
  `attempts` int NOT NULL DEFAULT 0,
  `nextAttemptAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastAttemptAt` timestamp NULL DEFAULT NULL,
  `sentAt` timestamp NULL DEFAULT NULL,
  `errorCode` varchar(120) NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `api_notification_dedupe_uq` (`dedupeKey`),
  KEY `api_notification_due_idx` (`status`, `nextAttemptAt`, `id`),
  KEY `api_notification_user_idx` (`userId`, `createdAt`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `api_platform_incidents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `status` enum('operational','degraded','maintenance','offline') NOT NULL,
  `title` varchar(200) NOT NULL,
  `message` text NOT NULL,
  `affectedServicesJson` text NOT NULL,
  `startsAt` timestamp NULL DEFAULT NULL,
  `endsAt` timestamp NULL DEFAULT NULL,
  `createdBy` int NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `api_platform_incidents_created_idx` (`createdAt`, `id`),
  KEY `api_platform_incidents_status_idx` (`status`, `endsAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `api_provider_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `providerKey` varchar(64) NOT NULL,
  `providerEventId` varchar(160) NOT NULL,
  `eventType` varchar(100) NOT NULL,
  `customerReference` varchar(160) NULL DEFAULT NULL,
  `payloadHash` varchar(64) NOT NULL,
  `userId` int NULL DEFAULT NULL,
  `processedAt` timestamp NULL DEFAULT NULL,
  `receivedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `api_provider_event_uq` (`providerKey`, `providerEventId`),
  KEY `api_provider_event_user_idx` (`userId`, `receivedAt`),
  KEY `api_provider_event_type_idx` (`eventType`, `receivedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
