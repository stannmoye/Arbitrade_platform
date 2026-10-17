ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `reportingTimezone` varchar(80) NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `customer_timezone_history` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `timezone` varchar(80) NOT NULL,
  `effectiveFrom` timestamp NOT NULL,
  `effectiveUntil` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `customer_timezone_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `customer_email_preferences` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `dailyTradingReports` boolean NOT NULL DEFAULT true,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `customer_email_preferences_id` PRIMARY KEY(`id`),
  CONSTRAINT `customer_email_preferences_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `v5_failed_jobs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `jobType` varchar(80) NOT NULL,
  `idempotencyKey` varchar(160) NOT NULL,
  `payloadJson` text NOT NULL,
  `attempts` int NOT NULL DEFAULT 0,
  `lastError` text NOT NULL,
  `status` enum('FAILED','RETRYING','COMPLETED') NOT NULL DEFAULT 'FAILED',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `v5_failed_jobs_id` PRIMARY KEY(`id`),
  CONSTRAINT `v5_failed_jobs_idempotency_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint


INSERT INTO `app_settings` (`settingKey`, `settingValue`)
VALUES
  ('reporting.systemTimezone', 'UTC'),
  ('email.globalSwitch', 'off'),
  ('fx.quoteValiditySeconds', '60'),
  ('fx.rateMovementTolerance', '0.02'),
  ('execution.liveEnabled', 'false')
ON DUPLICATE KEY UPDATE `settingKey` = `settingKey`;
