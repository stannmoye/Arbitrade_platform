ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `authVersion` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `customer_email_preferences` ADD COLUMN IF NOT EXISTS `systemAlerts` tinyint(1) NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `customer_email_preferences` ADD COLUMN IF NOT EXISTS `transactionAlerts` tinyint(1) NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `customer_email_preferences` ADD COLUMN IF NOT EXISTS `adminMessages` tinyint(1) NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `email_outbox` (
  `id` int NOT NULL AUTO_INCREMENT,
  `recipient` varchar(320) NOT NULL,
  `templateKey` varchar(64) NOT NULL,
  `encryptedPayload` text NOT NULL,
  `idempotencyKey` varchar(190) NOT NULL,
  `status` enum('QUEUED','PROCESSING','SENT','RETRYING','FAILED') NOT NULL DEFAULT 'QUEUED',
  `attempts` int NOT NULL DEFAULT 0,
  `nextAttemptAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `leaseUntil` timestamp NULL DEFAULT NULL,
  `lastError` varchar(500) NULL,
  `providerMessageId` varchar(255) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `sentAt` timestamp NULL DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `email_outbox_pk` PRIMARY KEY (`id`),
  CONSTRAINT `email_outbox_idempotency_uq` UNIQUE (`idempotencyKey`),
  KEY `email_outbox_status_due_idx` (`status`, `nextAttemptAt`),
  KEY `email_outbox_lease_idx` (`leaseUntil`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `auth_email_tokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `purpose` enum('EMAIL_VERIFY','PASSWORD_RESET') NOT NULL,
  `tokenSalt` varchar(32) NOT NULL,
  `tokenHash` varchar(64) NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `attempts` int NOT NULL DEFAULT 0,
  `lastRequestedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `consumedAt` timestamp NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `auth_email_tokens_pk` PRIMARY KEY (`id`),
  CONSTRAINT `auth_email_tokens_user_purpose_uq` UNIQUE (`userId`, `purpose`),
  KEY `auth_email_tokens_expiry_idx` (`expiresAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
