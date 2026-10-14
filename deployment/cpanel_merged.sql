-- Arbitrade Platform consolidated schema/migration bundle for a NEW, EMPTY MySQL 8+/MariaDB database.
-- Generated from every numbered SQL migration in numeric/name order.
-- Do not import over an existing database; back up and apply only pending forward migrations instead.
-- This SQL does not contain secrets, administrator credentials, or development/demo account data.

-- ===== BEGIN drizzle/0000_initial_users.sql =====
CREATE TABLE IF NOT EXISTS `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
-- ===== END drizzle/0000_initial_users.sql =====

-- ===== BEGIN drizzle/0001_silent_tinkerer.sql =====
CREATE TABLE `customer_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(200) NOT NULL,
	`body` text NOT NULL,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customer_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`deviceLabel` varchar(160) NOT NULL,
	`ipAddress` varchar(128),
	`countryCode` varchar(8),
	`userAgent` text,
	`isCurrent` boolean NOT NULL DEFAULT true,
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `risk_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(200) NOT NULL,
	`requestedFor` varchar(200),
	`status` enum('requested','in_review','ready','closed') NOT NULL DEFAULT 'requested',
	`summary` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `risk_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `support_attachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketId` int NOT NULL,
	`messageId` int,
	`uploadedBy` int NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`mimeType` varchar(160) NOT NULL,
	`sizeBytes` int NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `support_attachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `support_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketId` int NOT NULL,
	`authorId` int NOT NULL,
	`body` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `support_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketNumber` varchar(32) NOT NULL,
	`customerId` int NOT NULL,
	`subject` varchar(200) NOT NULL,
	`priority` enum('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
	`status` enum('open','answered','resolved','closed') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `support_tickets_id` PRIMARY KEY(`id`),
	CONSTRAINT `support_tickets_ticketNumber_unique` UNIQUE(`ticketNumber`)
);
-- ===== END drizzle/0001_silent_tinkerer.sql =====

-- ===== BEGIN drizzle/0002_eager_overlord.sql =====
CREATE TABLE `app_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settingKey` varchar(120) NOT NULL,
	`settingValue` text NOT NULL,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_settings_settingKey_unique` UNIQUE(`settingKey`)
);
-- ===== END drizzle/0002_eager_overlord.sql =====

-- ===== BEGIN drizzle/0003_jittery_marvel_boy.sql =====
CREATE TABLE `balance_ledger` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`currency` varchar(12) NOT NULL,
	`amountMinor` int NOT NULL,
	`entryType` varchar(40) NOT NULL,
	`reference` varchar(80) NOT NULL,
	`withdrawable` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `balance_ledger_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customer_balances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`currency` varchar(12) NOT NULL,
	`availableMinor` int NOT NULL DEFAULT 0,
	`promotionalMinor` int NOT NULL DEFAULT 0,
	`earnedMinor` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_balances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `opportunity_offers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`symbol` varchar(40) NOT NULL,
	`venueFrom` varchar(80) NOT NULL,
	`venueTo` varchar(80) NOT NULL,
	`currency` varchar(12) NOT NULL,
	`minimumMinor` int NOT NULL,
	`expectedRewardBps` int NOT NULL,
	`durationSeconds` int NOT NULL,
	`opensAt` timestamp NOT NULL,
	`closesAt` timestamp NOT NULL,
	`rewardAt` timestamp NOT NULL,
	`status` enum('scheduled','open','closed','settled','cancelled') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `opportunity_offers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trade_positions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`offerId` int NOT NULL,
	`currency` varchar(12) NOT NULL,
	`principalMinor` int NOT NULL,
	`expectedRewardMinor` int NOT NULL,
	`status` enum('pending','confirmed','settled','cancelled') NOT NULL DEFAULT 'confirmed',
	`confirmedAt` timestamp NOT NULL DEFAULT (now()),
	`settlesAt` timestamp NOT NULL,
	`settledAt` timestamp,
	CONSTRAINT `trade_positions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);
-- ===== END drizzle/0003_jittery_marvel_boy.sql =====

-- ===== BEGIN drizzle/0004_legal_bloodscream.sql =====
CREATE TABLE `opportunity_package_policies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`packageName` varchar(40) NOT NULL,
	`maxPopupsPerMinute` int NOT NULL DEFAULT 10,
	`maxVisibleOffers` int NOT NULL DEFAULT 10,
	`enabled` boolean NOT NULL DEFAULT true,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `opportunity_package_policies_id` PRIMARY KEY(`id`),
	CONSTRAINT `opportunity_package_policies_packageName_unique` UNIQUE(`packageName`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `packageName` varchar(40) DEFAULT 'Starter' NOT NULL;
-- ===== END drizzle/0004_legal_bloodscream.sql =====

-- ===== BEGIN drizzle/0005_v5_foundation.sql =====
CREATE TABLE IF NOT EXISTS `asset_precisions` (`id` int AUTO_INCREMENT NOT NULL, `code` varchar(32) NOT NULL, `scale` int NOT NULL, `minimumUnit` varchar(64) NOT NULL, `roundingMode` enum('half_up','down','up','half_even') NOT NULL DEFAULT 'half_up', `createdAt` timestamp NOT NULL DEFAULT (now()), `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT `asset_precisions_id` PRIMARY KEY(`id`), CONSTRAINT `asset_precisions_code_unique` UNIQUE(`code`));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `companies` (`id` int AUTO_INCREMENT NOT NULL, `name` varchar(160) NOT NULL, `logoUrl` varchar(512), `status` enum('active','disabled') NOT NULL DEFAULT 'active', `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `companies_id` PRIMARY KEY(`id`));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `trading_types` (`id` int AUTO_INCREMENT NOT NULL, `name` varchar(160) NOT NULL, `description` text, `mode` enum('PRACTICE','SIMULATION','RESEARCH','LIVE') NOT NULL DEFAULT 'PRACTICE', `enabled` boolean NOT NULL DEFAULT true, `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `trading_types_id` PRIMARY KEY(`id`), CONSTRAINT `trading_types_name_unique` UNIQUE(`name`));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `packages` (`id` int AUTO_INCREMENT NOT NULL, `name` varchar(80) NOT NULL, `startsAt` timestamp NULL, `expiresAt` timestamp NULL, `maxPopupsPerMinute` int NOT NULL DEFAULT 0, `maxActiveInvestments` int NOT NULL DEFAULT 0, `enabled` boolean NOT NULL DEFAULT true, `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `packages_id` PRIMARY KEY(`id`), CONSTRAINT `packages_name_unique` UNIQUE(`name`));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `package_entitlements` (`id` int AUTO_INCREMENT NOT NULL, `packageId` int NOT NULL, `entitlementKey` varchar(120) NOT NULL, `entitlementValue` varchar(512) NOT NULL, CONSTRAINT `package_entitlements_id` PRIMARY KEY(`id`));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `customer_package_subscriptions` (`id` int AUTO_INCREMENT NOT NULL, `userId` int NOT NULL, `packageId` int NOT NULL, `startsAt` timestamp NOT NULL, `expiresAt` timestamp NULL, `status` enum('active','expired','cancelled') NOT NULL DEFAULT 'active', `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `customer_package_subscriptions_id` PRIMARY KEY(`id`));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `v5_opportunities` (`id` int AUTO_INCREMENT NOT NULL, `companyId` int NOT NULL, `tradingTypeId` int NOT NULL, `title` varchar(200) NOT NULL, `practiceMode` enum('PRACTICE','SIMULATION','RESEARCH') NOT NULL DEFAULT 'PRACTICE', `currency` varchar(32) NOT NULL, `fixedInvestment` varchar(128) NOT NULL, `grossProfitRate` varchar(128) NOT NULL, `durationSeconds` int NOT NULL, `status` enum('DRAFT','ACTIVE','PAUSED','DISABLED','EXPIRED') NOT NULL DEFAULT 'DRAFT', `maxPurchases` int NULL, `currentPurchases` int NOT NULL DEFAULT 0, `eligibilityJson` text, `startsAt` timestamp NULL, `expiresAt` timestamp NULL, `createdAt` timestamp NOT NULL DEFAULT (now()), `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT `v5_opportunities_id` PRIMARY KEY(`id`));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `v5_purchases` (`id` int AUTO_INCREMENT NOT NULL, `opportunityId` int NOT NULL, `userId` int NOT NULL, `idempotencyKey` varchar(128) NOT NULL, `status` enum('PENDING','SUCCESSFUL','FAILED','CANCELLED','EXPIRED') NOT NULL DEFAULT 'PENDING', `attemptedAt` timestamp NOT NULL DEFAULT (now()), `successfulAt` timestamp NULL, `failureReason` varchar(255), CONSTRAINT `v5_purchases_id` PRIMARY KEY(`id`), CONSTRAINT `v5_purchases_idempotency_unique` UNIQUE(`idempotencyKey`));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `v5_successful_purchase_keys` (`id` int AUTO_INCREMENT NOT NULL, `opportunityId` int NOT NULL, `userId` int NOT NULL, `purchaseId` int NOT NULL, CONSTRAINT `v5_successful_purchase_keys_id` PRIMARY KEY(`id`), CONSTRAINT `v5_successful_purchase_keys_pair_unique` UNIQUE(`opportunityId`,`userId`));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `v5_wallets` (`id` int AUTO_INCREMENT NOT NULL, `userId` int NOT NULL, `assetCode` varchar(32) NOT NULL, `availableAmount` varchar(128) NOT NULL DEFAULT '0', `lockedAmount` varchar(128) NOT NULL DEFAULT '0', `pendingAmount` varchar(128) NOT NULL DEFAULT '0', `createdAt` timestamp NOT NULL DEFAULT (now()), `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT `v5_wallets_id` PRIMARY KEY(`id`), CONSTRAINT `v5_wallets_user_asset_unique` UNIQUE(`userId`,`assetCode`));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `v5_wallet_ledger` (`id` int AUTO_INCREMENT NOT NULL, `walletId` int NOT NULL, `entryType` varchar(40) NOT NULL, `amount` varchar(128) NOT NULL, `assetCode` varchar(32) NOT NULL, `referenceType` varchar(80) NOT NULL, `referenceId` varchar(128) NOT NULL, `idempotencyKey` varchar(128) NOT NULL, `reversalOfId` int NULL, `precisionSnapshotJson` text NOT NULL, `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `v5_wallet_ledger_id` PRIMARY KEY(`id`), CONSTRAINT `v5_wallet_ledger_idempotency_unique` UNIQUE(`idempotencyKey`));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `v5_funding_plans` (`id` int AUTO_INCREMENT NOT NULL, `userId` int NOT NULL, `destinationAsset` varchar(32) NOT NULL, `destinationAmount` varchar(128) NOT NULL, `sourcesJson` text NOT NULL, `status` enum('QUOTED','APPROVED','EXECUTED','FAILED') NOT NULL DEFAULT 'QUOTED', `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `v5_funding_plans_id` PRIMARY KEY(`id`));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `v5_fx_quotes` (`id` int AUTO_INCREMENT NOT NULL, `provider` varchar(120) NOT NULL, `fromAsset` varchar(32) NOT NULL, `toAsset` varchar(32) NOT NULL, `sourceAmount` varchar(128) NOT NULL, `destinationAmount` varchar(128) NOT NULL, `rate` varchar(128) NOT NULL, `fee` varchar(128) NOT NULL, `spread` varchar(128) NOT NULL, `quotedAt` timestamp NOT NULL, `validUntil` timestamp NOT NULL, `status` enum('QUOTED','EXECUTED','EXPIRED','REJECTED') NOT NULL DEFAULT 'QUOTED', `reference` varchar(160) NOT NULL, CONSTRAINT `v5_fx_quotes_id` PRIMARY KEY(`id`));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `v5_conversions` (`id` int AUTO_INCREMENT NOT NULL, `userId` int NOT NULL, `quoteId` int NOT NULL, `fundingPlanId` int NOT NULL, `sourceAsset` varchar(32) NOT NULL, `destinationAsset` varchar(32) NOT NULL, `sourceAmount` varchar(128) NOT NULL, `destinationAmount` varchar(128) NOT NULL, `executionRate` varchar(128) NOT NULL, `fee` varchar(128) NOT NULL, `status` enum('PENDING','COMPLETED','FAILED','REVERSED') NOT NULL DEFAULT 'PENDING', `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `v5_conversions_id` PRIMARY KEY(`id`));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `v5_investments` (`id` int AUTO_INCREMENT NOT NULL, `userId` int NOT NULL, `opportunityId` int NOT NULL, `purchaseId` int NOT NULL, `principalAmount` varchar(128) NOT NULL, `assetCode` varchar(32) NOT NULL, `settlementWalletId` int NOT NULL, `settlementAsset` varchar(32) NOT NULL, `status` enum('ACTIVE','PENDING_SETTLEMENT','SETTLED_PROFIT','SETTLED_ZERO','SETTLED_LOSS','FAILED_SETTLEMENT','CANCELLED','REVERSED') NOT NULL DEFAULT 'ACTIVE', `startsAt` timestamp NOT NULL, `settlesAt` timestamp NOT NULL, `tradingTypeSnapshot` varchar(160) NOT NULL, `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `v5_investments_id` PRIMARY KEY(`id`));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `v5_settlements` (`id` int AUTO_INCREMENT NOT NULL, `investmentId` int NOT NULL, `status` varchar(40) NOT NULL, `principalAmount` varchar(128) NOT NULL, `grossProfit` varchar(128) NOT NULL, `fees` varchar(128) NOT NULL, `takeHomeProfit` varchar(128) NOT NULL, `totalReturned` varchar(128) NOT NULL, `resultReference` varchar(160), `idempotencyKey` varchar(128) NOT NULL, `settledAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `v5_settlements_id` PRIMARY KEY(`id`), CONSTRAINT `v5_settlements_investment_unique` UNIQUE(`investmentId`), CONSTRAINT `v5_settlements_idempotency_unique` UNIQUE(`idempotencyKey`));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `v5_reports` (`id` int AUTO_INCREMENT NOT NULL, `userId` int NOT NULL, `reportingDate` date NOT NULL, `timezone` varchar(80) NOT NULL, `periodStartUtc` timestamp NOT NULL, `periodEndUtc` timestamp NOT NULL, `status` enum('GENERATED','FAILED') NOT NULL DEFAULT 'GENERATED', `storageKey` varchar(512), `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `v5_reports_id` PRIMARY KEY(`id`), CONSTRAINT `v5_reports_customer_day_unique` UNIQUE(`userId`,`reportingDate`));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `v5_email_jobs` (`id` int AUTO_INCREMENT NOT NULL, `userId` int NOT NULL, `reportId` int NOT NULL, `status` enum('QUEUED','PROCESSING','SENT','FAILED','RETRYING','SUPPRESSED') NOT NULL, `attempts` int NOT NULL DEFAULT 0, `lastError` text, `idempotencyKey` varchar(160) NOT NULL, `createdAt` timestamp NOT NULL DEFAULT (now()), `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT `v5_email_jobs_id` PRIMARY KEY(`id`), CONSTRAINT `v5_email_jobs_idempotency_unique` UNIQUE(`idempotencyKey`));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `v5_idempotency_keys` (`id` int AUTO_INCREMENT NOT NULL, `userId` int NULL, `keyValue` varchar(160) NOT NULL, `command` varchar(120) NOT NULL, `resultJson` text, `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `v5_idempotency_keys_id` PRIMARY KEY(`id`), CONSTRAINT `v5_idempotency_keys_key_unique` UNIQUE(`keyValue`));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `v5_audit_events` (`id` int AUTO_INCREMENT NOT NULL, `actorUserId` int NULL, `action` varchar(160) NOT NULL, `entityType` varchar(80) NOT NULL, `entityId` varchar(128) NOT NULL, `reason` text, `reference` varchar(160), `metadataJson` text, `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `v5_audit_events_id` PRIMARY KEY(`id`));
-- ===== END drizzle/0005_v5_foundation.sql =====

-- ===== BEGIN drizzle/0006_v5_reporting_jobs.sql =====
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
-- ===== END drizzle/0006_v5_reporting_jobs.sql =====

-- ===== BEGIN drizzle/0007_customer_controls.sql =====
CREATE TABLE IF NOT EXISTS `customer_controls` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `accountStatus` enum('active','suspended','restricted') NOT NULL DEFAULT 'active',
  `tradingEnabled` tinyint(1) NOT NULL DEFAULT 1,
  `withdrawalsEnabled` tinyint(1) NOT NULL DEFAULT 0,
  `kycRequired` tinyint(1) NOT NULL DEFAULT 1,
  `twoFactorRequired` tinyint(1) NOT NULL DEFAULT 0,
  `emailVerified` tinyint(1) NOT NULL DEFAULT 0,
  `riskTier` varchar(24) NOT NULL DEFAULT 'standard',
  `dailyTradeLimitMinor` int NOT NULL DEFAULT 2500000,
  `adminNote` text NULL,
  `updatedBy` int NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_controls_user_unique` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ===== END drizzle/0007_customer_controls.sql =====

-- ===== BEGIN drizzle/0008_currency_registry.sql =====
CREATE TABLE IF NOT EXISTS `currency_registry` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(32) NOT NULL,
  `name` varchar(120) NOT NULL,
  `symbol` varchar(16) NOT NULL,
  `scale` int NOT NULL DEFAULT 2,
  `assetType` enum('fiat','crypto','token') NOT NULL DEFAULT 'fiat',
  `usdRate` varchar(64) NOT NULL DEFAULT '1',
  `rateProvider` varchar(120) NOT NULL DEFAULT 'manual',
  `externalCode` varchar(80) NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `currency_registry_code_unique` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
INSERT IGNORE INTO `currency_registry` (`code`,`name`,`symbol`,`scale`,`assetType`,`usdRate`,`rateProvider`,`externalCode`) VALUES
('USD','US Dollar','$',2,'fiat','1','manual','USD'),
('EUR','Euro','€',2,'fiat','1.08','manual','EUR'),
('GBP','British Pound','£',2,'fiat','1.27','manual','GBP'),
('BTC','Bitcoin','₿',8,'crypto','65000','manual','BTC'),
('ETH','Ethereum','Ξ',8,'crypto','3500','manual','ETH');
-- ===== END drizzle/0008_currency_registry.sql =====

-- ===== BEGIN drizzle/0009_customer_opportunity_visibility.sql =====
ALTER TABLE `customer_controls`
  ADD COLUMN IF NOT EXISTS `opportunitiesEnabled` tinyint(1) NOT NULL DEFAULT 1 AFTER `tradingEnabled`;
-- ===== END drizzle/0009_customer_opportunity_visibility.sql =====

-- ===== BEGIN drizzle/0010_support_categories.sql =====
ALTER TABLE `support_tickets` ADD COLUMN `category` varchar(40) NOT NULL DEFAULT 'account' AFTER `subject`;
-- ===== END drizzle/0010_support_categories.sql =====

-- ===== BEGIN drizzle/0011_stake_earn.sql =====
ALTER TABLE `customer_balances` ADD COLUMN `lockedMinor` int NOT NULL DEFAULT 0 AFTER `availableMinor`;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `stake_products` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(160) NOT NULL,
  `category` enum('CORE_STAKING','LIQUIDITY','LENDING','RESTAKING','YIELD','RWA') NOT NULL,
  `asset` varchar(32) NOT NULL,
  `annualRateBps` int NOT NULL,
  `durationDays` int NOT NULL,
  `minMinor` int NOT NULL,
  `maxMinor` int NOT NULL,
  `rewardFrequency` enum('DAILY','WEEKLY','MONTHLY') NOT NULL,
  `lockDays` int NOT NULL,
  `riskLevel` enum('LOW','MODERATE','ELEVATED','HIGH') NOT NULL,
  `status` enum('AVAILABLE','PAUSED') NOT NULL DEFAULT 'AVAILABLE',
  `supportsCompounding` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `stake_products_id` PRIMARY KEY(`id`),
  CONSTRAINT `stake_products_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `stake_positions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `positionCode` varchar(40) NOT NULL,
  `userId` int NOT NULL,
  `productId` int NOT NULL,
  `asset` varchar(32) NOT NULL,
  `principalMinor` int NOT NULL,
  `rewardMinor` int NOT NULL DEFAULT 0,
  `rewardCount` int NOT NULL DEFAULT 0,
  `status` enum('PENDING','PROCESSING','ACTIVE','REWARD_ACCRUING','SETTLING','COMPLETED','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `openedAt` timestamp NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `maturityAt` timestamp NOT NULL,
  `completedAt` timestamp NULL,
  `nextRewardAt` timestamp NULL,
  `originalLedgerReference` varchar(160) NOT NULL,
  CONSTRAINT `stake_positions_id` PRIMARY KEY(`id`),
  CONSTRAINT `stake_positions_code_unique` UNIQUE(`positionCode`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `stake_transactions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `transactionCode` varchar(48) NOT NULL,
  `userId` int NOT NULL,
  `positionId` int NOT NULL,
  `type` varchar(48) NOT NULL,
  `amountMinor` int NOT NULL,
  `asset` varchar(32) NOT NULL,
  `status` varchar(32) NOT NULL,
  `ledgerReference` varchar(160) NOT NULL,
  `idempotencyKey` varchar(160) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `completedAt` timestamp NULL,
  CONSTRAINT `stake_transactions_id` PRIMARY KEY(`id`),
  CONSTRAINT `stake_transactions_code_unique` UNIQUE(`transactionCode`),
  CONSTRAINT `stake_transactions_idempotency_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `stake_rewards` (
  `id` int AUTO_INCREMENT NOT NULL,
  `positionId` int NOT NULL,
  `userId` int NOT NULL,
  `amountMinor` int NOT NULL,
  `asset` varchar(32) NOT NULL,
  `status` enum('CALCULATED','VALIDATED','APPROVED','POSTED','FAILED') NOT NULL,
  `calculatedAt` timestamp NOT NULL,
  `postedAt` timestamp NULL,
  `ledgerReference` varchar(160),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `stake_rewards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `stake_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `positionId` int NOT NULL,
  `eventType` varchar(80) NOT NULL,
  `previousState` varchar(40) NOT NULL,
  `newState` varchar(40) NOT NULL,
  `amountMinor` int NOT NULL DEFAULT 0,
  `asset` varchar(32) NOT NULL,
  `metadataJson` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `stake_events_id` PRIMARY KEY(`id`)
);
-- ===== END drizzle/0011_stake_earn.sql =====

-- ===== BEGIN drizzle/0012_transaction_console.sql =====
CREATE TABLE IF NOT EXISTS `transaction_console_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sessionKey` varchar(96) NOT NULL,
  `userId` int NOT NULL,
  `eventType` varchar(64) NOT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'COMPLETED',
  `title` varchar(200) NOT NULL,
  `message` text NOT NULL,
  `transactionCode` varchar(80),
  `amountMinor` int,
  `asset` varchar(32),
  `metadataJson` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `transaction_console_events_id` PRIMARY KEY(`id`),
  INDEX `transaction_console_events_session_idx` (`userId`,`sessionKey`,`id`)
);
-- ===== END drizzle/0012_transaction_console.sql =====

-- ===== BEGIN drizzle/0013_auto_trade_missed_opportunities.sql =====
ALTER TABLE `customer_controls`
  ADD COLUMN IF NOT EXISTS `autoTradeEnabled` boolean NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS `autoTradeAmountMinor` int NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS `autoTradeMinRewardBps` int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `autoTradeDailyLimit` int NOT NULL DEFAULT 5;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `missed_opportunities` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `offerId` int NOT NULL,
  `symbol` varchar(40) NOT NULL,
  `currency` varchar(12) NOT NULL,
  `amountMinor` int NOT NULL,
  `potentialRewardMinor` int NOT NULL,
  `expectedRewardBps` int NOT NULL,
  `reason` varchar(80) NOT NULL,
  `status` enum('MISSED','EXECUTED') NOT NULL DEFAULT 'MISSED',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE now(),
  CONSTRAINT `missed_opportunities_id` PRIMARY KEY(`id`),
  UNIQUE KEY `missed_opportunities_user_offer_unique` (`userId`,`offerId`),
  KEY `missed_opportunities_user_status_idx` (`userId`,`status`,`createdAt`)
);
--> statement-breakpoint

UPDATE `customer_controls` SET `autoTradeEnabled`=TRUE WHERE `autoTradeEnabled` IS NULL;
-- ===== END drizzle/0013_auto_trade_missed_opportunities.sql =====

-- ===== BEGIN drizzle/0014_console_activity_phrases.sql =====
CREATE TABLE IF NOT EXISTS `console_activity_phrases` (
  `id` int AUTO_INCREMENT NOT NULL,
  `category` varchar(48) NOT NULL,
  `phraseTemplate` varchar(500) NOT NULL,
  `enabled` boolean NOT NULL DEFAULT TRUE,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `console_activity_phrases_enabled_idx` (`enabled`,`category`)
);
--> statement-breakpoint

INSERT INTO `console_activity_phrases` (`category`,`phraseTemplate`) VALUES
('ROUTING','Scanning the current opportunity graph for {{asset}} exposure at {{rate}} basis points.'),
('ROUTING','Scanning the current opportunity graph against {{offers}} active windows.'),
('ROUTING','Scanning the current opportunity graph with {{investors}} eligible investors pinned.'),
('ROUTING','Scanning the current opportunity graph before the next allocation checkpoint.'),
('ROUTING','Scanning the current opportunity graph inside the {{currency}} wallet corridor.'),
('ROUTING','Scanning the current opportunity graph while the customer ledger remains unchanged.'),
('ROUTING','Scanning the current opportunity graph with {{count}} risk rules in force.'),
('ROUTING','Scanning the current opportunity graph for a potential completion near {{time}}.'),
('ROUTING','Scanning the current opportunity graph against the configured daily ceiling.'),
('ROUTING','Scanning the current opportunity graph without creating a debit or credit.'),
('ALLOCATION','Rebalancing the allocation queue for {{asset}} exposure at {{rate}} basis points.'),
('ALLOCATION','Rebalancing the allocation queue against {{offers}} active windows.'),
('ALLOCATION','Rebalancing the allocation queue with {{investors}} eligible investors pinned.'),
('ALLOCATION','Rebalancing the allocation queue before the next allocation checkpoint.'),
('ALLOCATION','Rebalancing the allocation queue inside the {{currency}} wallet corridor.'),
('ALLOCATION','Rebalancing the allocation queue while the customer ledger remains unchanged.'),
('ALLOCATION','Rebalancing the allocation queue with {{count}} risk rules in force.'),
('ALLOCATION','Rebalancing the allocation queue for a potential completion near {{time}}.'),
('ALLOCATION','Rebalancing the allocation queue against the configured daily ceiling.'),
('ALLOCATION','Rebalancing the allocation queue without creating a debit or credit.'),
('SETTLEMENT','Opening a secure routing window for {{asset}} exposure at {{rate}} basis points.'),
('SETTLEMENT','Opening a secure routing window against {{offers}} active windows.'),
('SETTLEMENT','Opening a secure routing window with {{investors}} eligible investors pinned.'),
('SETTLEMENT','Opening a secure routing window before the next allocation checkpoint.'),
('SETTLEMENT','Opening a secure routing window inside the {{currency}} wallet corridor.'),
('SETTLEMENT','Opening a secure routing window while the customer ledger remains unchanged.'),
('SETTLEMENT','Opening a secure routing window with {{count}} risk rules in force.'),
('SETTLEMENT','Opening a secure routing window for a potential completion near {{time}}.'),
('SETTLEMENT','Opening a secure routing window against the configured daily ceiling.'),
('SETTLEMENT','Opening a secure routing window without creating a debit or credit.'),
('ROUTING','Checking the investor pool for {{asset}} exposure at {{rate}} basis points.'),
('ROUTING','Checking the investor pool against {{offers}} active windows.'),
('ROUTING','Checking the investor pool with {{investors}} eligible investors pinned.'),
('ROUTING','Checking the investor pool before the next allocation checkpoint.'),
('ROUTING','Checking the investor pool inside the {{currency}} wallet corridor.'),
('ROUTING','Checking the investor pool while the customer ledger remains unchanged.'),
('ROUTING','Checking the investor pool with {{count}} risk rules in force.'),
('ROUTING','Checking the investor pool for a potential completion near {{time}}.'),
('ROUTING','Checking the investor pool against the configured daily ceiling.'),
('ROUTING','Checking the investor pool without creating a debit or credit.'),
('ALLOCATION','Refreshing the execution map for {{asset}} exposure at {{rate}} basis points.'),
('ALLOCATION','Refreshing the execution map against {{offers}} active windows.'),
('ALLOCATION','Refreshing the execution map with {{investors}} eligible investors pinned.'),
('ALLOCATION','Refreshing the execution map before the next allocation checkpoint.'),
('ALLOCATION','Refreshing the execution map inside the {{currency}} wallet corridor.'),
('ALLOCATION','Refreshing the execution map while the customer ledger remains unchanged.'),
('ALLOCATION','Refreshing the execution map with {{count}} risk rules in force.'),
('ALLOCATION','Refreshing the execution map for a potential completion near {{time}}.'),
('ALLOCATION','Refreshing the execution map against the configured daily ceiling.'),
('ALLOCATION','Refreshing the execution map without creating a debit or credit.'),
('SETTLEMENT','Preparing the settlement corridor for {{asset}} exposure at {{rate}} basis points.'),
('SETTLEMENT','Preparing the settlement corridor against {{offers}} active windows.'),
('SETTLEMENT','Preparing the settlement corridor with {{investors}} eligible investors pinned.'),
('SETTLEMENT','Preparing the settlement corridor before the next allocation checkpoint.'),
('SETTLEMENT','Preparing the settlement corridor inside the {{currency}} wallet corridor.'),
('SETTLEMENT','Preparing the settlement corridor while the customer ledger remains unchanged.'),
('SETTLEMENT','Preparing the settlement corridor with {{count}} risk rules in force.'),
('SETTLEMENT','Preparing the settlement corridor for a potential completion near {{time}}.'),
('SETTLEMENT','Preparing the settlement corridor against the configured daily ceiling.'),
('SETTLEMENT','Preparing the settlement corridor without creating a debit or credit.'),
('ROUTING','Indexing active market routes for {{asset}} exposure at {{rate}} basis points.'),
('ROUTING','Indexing active market routes against {{offers}} active windows.'),
('ROUTING','Indexing active market routes with {{investors}} eligible investors pinned.'),
('ROUTING','Indexing active market routes before the next allocation checkpoint.'),
('ROUTING','Indexing active market routes inside the {{currency}} wallet corridor.'),
('ROUTING','Indexing active market routes while the customer ledger remains unchanged.'),
('ROUTING','Indexing active market routes with {{count}} risk rules in force.'),
('ROUTING','Indexing active market routes for a potential completion near {{time}}.'),
('ROUTING','Indexing active market routes against the configured daily ceiling.'),
('ROUTING','Indexing active market routes without creating a debit or credit.'),
('ALLOCATION','Comparing eligible capital lanes for {{asset}} exposure at {{rate}} basis points.'),
('ALLOCATION','Comparing eligible capital lanes against {{offers}} active windows.'),
('ALLOCATION','Comparing eligible capital lanes with {{investors}} eligible investors pinned.'),
('ALLOCATION','Comparing eligible capital lanes before the next allocation checkpoint.'),
('ALLOCATION','Comparing eligible capital lanes inside the {{currency}} wallet corridor.'),
('ALLOCATION','Comparing eligible capital lanes while the customer ledger remains unchanged.'),
('ALLOCATION','Comparing eligible capital lanes with {{count}} risk rules in force.'),
('ALLOCATION','Comparing eligible capital lanes for a potential completion near {{time}}.'),
('ALLOCATION','Comparing eligible capital lanes against the configured daily ceiling.'),
('ALLOCATION','Comparing eligible capital lanes without creating a debit or credit.'),
('SETTLEMENT','Verifying custody handshakes for {{asset}} exposure at {{rate}} basis points.'),
('SETTLEMENT','Verifying custody handshakes against {{offers}} active windows.'),
('SETTLEMENT','Verifying custody handshakes with {{investors}} eligible investors pinned.'),
('SETTLEMENT','Verifying custody handshakes before the next allocation checkpoint.'),
('SETTLEMENT','Verifying custody handshakes inside the {{currency}} wallet corridor.'),
('SETTLEMENT','Verifying custody handshakes while the customer ledger remains unchanged.'),
('SETTLEMENT','Verifying custody handshakes with {{count}} risk rules in force.'),
('SETTLEMENT','Verifying custody handshakes for a potential completion near {{time}}.'),
('SETTLEMENT','Verifying custody handshakes against the configured daily ceiling.'),
('SETTLEMENT','Verifying custody handshakes without creating a debit or credit.'),
('ROUTING','Measuring route capacity for {{asset}} exposure at {{rate}} basis points.'),
('ROUTING','Measuring route capacity against {{offers}} active windows.'),
('ROUTING','Measuring route capacity with {{investors}} eligible investors pinned.'),
('ROUTING','Measuring route capacity before the next allocation checkpoint.'),
('ROUTING','Measuring route capacity inside the {{currency}} wallet corridor.'),
('ROUTING','Measuring route capacity while the customer ledger remains unchanged.'),
('ROUTING','Measuring route capacity with {{count}} risk rules in force.'),
('ROUTING','Measuring route capacity for a potential completion near {{time}}.'),
('ROUTING','Measuring route capacity against the configured daily ceiling.'),
('ROUTING','Measuring route capacity without creating a debit or credit.'),
('ALLOCATION','Reviewing allocation pressure for {{asset}} exposure at {{rate}} basis points.'),
('ALLOCATION','Reviewing allocation pressure against {{offers}} active windows.'),
('ALLOCATION','Reviewing allocation pressure with {{investors}} eligible investors pinned.'),
('ALLOCATION','Reviewing allocation pressure before the next allocation checkpoint.'),
('ALLOCATION','Reviewing allocation pressure inside the {{currency}} wallet corridor.'),
('ALLOCATION','Reviewing allocation pressure while the customer ledger remains unchanged.'),
('ALLOCATION','Reviewing allocation pressure with {{count}} risk rules in force.'),
('ALLOCATION','Reviewing allocation pressure for a potential completion near {{time}}.'),
('ALLOCATION','Reviewing allocation pressure against the configured daily ceiling.'),
('ALLOCATION','Reviewing allocation pressure without creating a debit or credit.'),
('SETTLEMENT','Synchronizing the transaction mesh for {{asset}} exposure at {{rate}} basis points.'),
('SETTLEMENT','Synchronizing the transaction mesh against {{offers}} active windows.'),
('SETTLEMENT','Synchronizing the transaction mesh with {{investors}} eligible investors pinned.'),
('SETTLEMENT','Synchronizing the transaction mesh before the next allocation checkpoint.'),
('SETTLEMENT','Synchronizing the transaction mesh inside the {{currency}} wallet corridor.'),
('SETTLEMENT','Synchronizing the transaction mesh while the customer ledger remains unchanged.'),
('SETTLEMENT','Synchronizing the transaction mesh with {{count}} risk rules in force.'),
('SETTLEMENT','Synchronizing the transaction mesh for a potential completion near {{time}}.'),
('SETTLEMENT','Synchronizing the transaction mesh against the configured daily ceiling.'),
('SETTLEMENT','Synchronizing the transaction mesh without creating a debit or credit.'),
('LIFECYCLE','Network hook is awake; waiting for a confirmed instruction.'),
('LIFECYCLE','Allocation guard is armed; no wallet mutation is authorized yet.'),
('LIFECYCLE','Capital route is being priced from persisted opportunity settings.'),
('LIFECYCLE','Investor sequence is being randomized from the database activity catalog.'),
('LIFECYCLE','Share distribution model is ready for a ledger-backed allocation.'),
('LIFECYCLE','Trade confirmation channel is listening for a verified application event.'),
('LIFECYCLE','Fee schedule lookup is complete; no fee is posted without a configured rule.'),
('LIFECYCLE','Debit and credit controls are separated from telemetry output.'),
('LIFECYCLE','The processing stream is holding position until a confirmed ledger event arrives.'),
('LIFECYCLE','Actual transaction events take priority over every system activity message.');
-- ===== END drizzle/0014_console_activity_phrases.sql =====

-- ===== BEGIN drizzle/0015_market_data_fx.sql =====
ALTER TABLE `opportunity_offers`
  ADD COLUMN IF NOT EXISTS `instrumentId` int NULL,
  ADD COLUMN IF NOT EXISTS `marketSnapshotId` int NULL,
  ADD COLUMN IF NOT EXISTS `marketValueUsd` varchar(64) NULL,
  ADD COLUMN IF NOT EXISTS `sector` varchar(120) NULL,
  ADD COLUMN IF NOT EXISTS `industry` varchar(160) NULL,
  ADD COLUMN IF NOT EXISTS `listingStatus` varchar(40) NULL,
  ADD COLUMN IF NOT EXISTS `marketObservedAt` timestamp NULL,
  ADD COLUMN IF NOT EXISTS `simulationSeed` varchar(128) NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `market_instruments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `symbol` varchar(40) NOT NULL,
  `name` varchar(240) NOT NULL,
  `exchange` varchar(80) NULL,
  `country` varchar(80) NULL,
  `sector` varchar(120) NULL,
  `industry` varchar(160) NULL,
  `listingStatus` varchar(40) NOT NULL DEFAULT 'active',
  `source` varchar(80) NOT NULL,
  `rawJson` text NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `market_instruments_symbol_unique` (`symbol`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `market_snapshots` (
  `id` int AUTO_INCREMENT NOT NULL,
  `instrumentId` int NOT NULL,
  `priceUsd` varchar(64) NULL,
  `marketValueUsd` varchar(64) NULL,
  `volume` varchar(64) NULL,
  `netChange` varchar(64) NULL,
  `percentChange` varchar(64) NULL,
  `observedAt` timestamp NOT NULL,
  `source` varchar(80) NOT NULL,
  `rawJson` text NOT NULL,
  PRIMARY KEY (`id`), KEY `market_snapshots_instrument_observed_idx` (`instrumentId`,`observedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `fx_rate_snapshots` (
  `id` int AUTO_INCREMENT NOT NULL,
  `baseAsset` varchar(16) NOT NULL,
  `quoteAsset` varchar(16) NOT NULL,
  `rate` varchar(64) NOT NULL,
  `provider` varchar(80) NOT NULL,
  `sourceDate` varchar(16) NULL,
  `observedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `rawJson` text NOT NULL,
  PRIMARY KEY (`id`), KEY `fx_rate_snapshots_pair_observed_idx` (`baseAsset`,`quoteAsset`,`observedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ===== END drizzle/0015_market_data_fx.sql =====

-- ===== BEGIN drizzle/0016_customer_wallet_preferences.sql =====
CREATE TABLE IF NOT EXISTS `customer_wallet_preferences` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `tradingCurrency` varchar(32) NOT NULL DEFAULT 'USD',
  `swapCurrency` varchar(32) NOT NULL DEFAULT 'USD',
  `autoTopUpEnabled` boolean NOT NULL DEFAULT false,
  `withdrawalWhitelistEnabled` boolean NOT NULL DEFAULT true,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_wallet_preferences_user_unique` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ===== END drizzle/0016_customer_wallet_preferences.sql =====

-- ===== BEGIN drizzle/0017_customer_opportunity_rules.sql =====
CREATE TABLE IF NOT EXISTS `customer_opportunity_rules` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `enabled` boolean NOT NULL DEFAULT true,
  `minimumRewardBps` int NOT NULL DEFAULT 50,
  `maxDailyAllocationMinor` int NOT NULL DEFAULT 100000,
  `allowedAssets` varchar(255) NOT NULL DEFAULT 'USD,EUR,GBP,BTC,ETH',
  `quietHoursStart` varchar(5) NOT NULL DEFAULT '22:00',
  `quietHoursEnd` varchar(5) NOT NULL DEFAULT '07:00',
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_opportunity_rules_user_unique` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ===== END drizzle/0017_customer_opportunity_rules.sql =====

-- ===== BEGIN drizzle/0018_opportunity_refresh_popup_settings.sql =====
INSERT INTO `app_settings` (`settingKey`, `settingValue`)
VALUES
  ('market.refreshIntervalMinutes', '120'),
  ('opportunity.deskLabel', 'WiseBond Market Intelligence Desk'),
  ('opportunity.frequencyPerMinute', '50'),
  ('opportunity.popup.minGapSeconds', '45'),
  ('opportunity.popup.displaySeconds', '8'),
  ('opportunity.popup.maxPerHour', '12'),
  ('opportunity.popup.preAlertProbabilityBps', '1500'),
  ('opportunity.popup.preAlertSeconds', '4'),
  ('opportunity.popup.withdrawalProbabilityBps', '1200'),
  ('opportunity.popup.jitterSeconds', '90')
ON DUPLICATE KEY UPDATE `settingValue` = VALUES(`settingValue`);
--> statement-breakpoint

UPDATE `opportunity_offers`
SET `venueTo` = 'WiseBond Market Intelligence Desk'
WHERE `venueTo` = 'WiseBond Simulation Desk' AND `status` = 'open';
-- ===== END drizzle/0018_opportunity_refresh_popup_settings.sql =====

-- ===== BEGIN drizzle/0019_daily_opportunity_quotas.sql =====
ALTER TABLE `opportunity_package_policies`
  CHANGE COLUMN `maxPopupsPerMinute` `maxPopupsPerDay` int NOT NULL DEFAULT 10;
--> statement-breakpoint

INSERT INTO `app_settings` (`settingKey`, `settingValue`)
VALUES ('opportunity.maxPopupsPerDay', '50')
ON DUPLICATE KEY UPDATE `settingValue` = VALUES(`settingValue`);
--> statement-breakpoint

DELETE FROM `app_settings`
WHERE `settingKey` = 'opportunity.frequencyPerMinute';
-- ===== END drizzle/0019_daily_opportunity_quotas.sql =====

-- ===== BEGIN drizzle/0020_opportunity_delivery_events.sql =====
CREATE TABLE IF NOT EXISTS `opportunity_delivery_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `offerId` int NOT NULL,
  `quotaDay` varchar(10) NOT NULL,
  `deliveredAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `opportunity_delivery_user_offer_day_unique` (`userId`,`offerId`,`quotaDay`),
  KEY `opportunity_delivery_user_day_idx` (`userId`,`quotaDay`,`deliveredAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ===== END drizzle/0020_opportunity_delivery_events.sql =====

-- ===== BEGIN drizzle/0021_adaptive_package_rate_profiles.sql =====
ALTER TABLE `opportunity_package_policies`
  ADD COLUMN IF NOT EXISTS `minHourlyTarget` int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `normalHourlyTarget` int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `marketInfluenceBps` int NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS `burstEnabled` boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS `maxBurstSize` int NOT NULL DEFAULT 0;
--> statement-breakpoint

UPDATE `opportunity_package_policies`
SET
  `minHourlyTarget` = CASE WHEN `maxPopupsPerDay` >= 50 THEN 2 ELSE 0 END,
  `normalHourlyTarget` = CASE WHEN `maxPopupsPerDay` >= 100 THEN 6 WHEN `maxPopupsPerDay` >= 30 THEN 4 ELSE 2 END,
  `marketInfluenceBps` = CASE WHEN `maxPopupsPerDay` >= 100 THEN 8500 WHEN `maxPopupsPerDay` >= 50 THEN 7000 WHEN `maxPopupsPerDay` >= 30 THEN 5000 ELSE 3000 END,
  `burstEnabled` = (`maxPopupsPerDay` >= 50),
  `maxBurstSize` = CASE WHEN `maxPopupsPerDay` >= 100 THEN 3 WHEN `maxPopupsPerDay` >= 50 THEN 2 ELSE 0 END;
--> statement-breakpoint

INSERT INTO `app_settings` (`settingKey`, `settingValue`)
VALUES
  ('opportunity.globalEmergencyCeilingPerDay', '500'),
  ('opportunity.drainMode', 'false'),
  ('opportunity.marketInfluenceBps', '7000')
ON DUPLICATE KEY UPDATE `settingValue` = VALUES(`settingValue`);
-- ===== END drizzle/0021_adaptive_package_rate_profiles.sql =====

-- ===== BEGIN drizzle/0022_popup_lifecycle_reporting.sql =====
CREATE TABLE IF NOT EXISTS `opportunity_popup_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `eventKey` varchar(180) NOT NULL,
  `userId` int NOT NULL,
  `offerId` int NOT NULL,
  `quotaDay` varchar(10) NOT NULL,
  `packageName` varchar(40) NOT NULL,
  `symbol` varchar(40) NOT NULL,
  `currency` varchar(32) NOT NULL,
  `minimumMinor` int NOT NULL,
  `expectedRewardBps` int NOT NULL,
  `balanceAvailableMinor` int NOT NULL DEFAULT 0,
  `balanceStatus` enum('sufficient','insufficient','unknown') NOT NULL DEFAULT 'unknown',
  `marketObservedAt` timestamp NULL,
  `marketSnapshotJson` text NULL,
  `eventStatus` enum('DELIVERED','NOTICED','OPENED','DISMISSED','WITHDRAWN','TRADED','SETTLED') NOT NULL DEFAULT 'DELIVERED',
  `deliveredAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `noticedAt` timestamp NULL,
  `openedAt` timestamp NULL,
  `dismissedAt` timestamp NULL,
  `withdrawnAt` timestamp NULL,
  `tradedAt` timestamp NULL,
  `settledAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `opportunity_popup_event_key_unique` (`eventKey`),
  KEY `opportunity_popup_user_delivered_idx` (`userId`,`deliveredAt`),
  KEY `opportunity_popup_offer_idx` (`offerId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ===== END drizzle/0022_popup_lifecycle_reporting.sql =====

-- ===== BEGIN drizzle/0023_popup_daily_aggregates.sql =====
CREATE TABLE IF NOT EXISTS `opportunity_popup_daily` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `eventDate` varchar(10) NOT NULL,
  `deliveredCount` int NOT NULL DEFAULT 0,
  `noticedCount` int NOT NULL DEFAULT 0,
  `openedCount` int NOT NULL DEFAULT 0,
  `dismissedCount` int NOT NULL DEFAULT 0,
  `withdrawnCount` int NOT NULL DEFAULT 0,
  `tradedCount` int NOT NULL DEFAULT 0,
  `settledCount` int NOT NULL DEFAULT 0,
  `zeroBalanceCount` int NOT NULL DEFAULT 0,
  `lastEventAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `opportunity_popup_daily_user_date_unique` (`userId`,`eventDate`),
  KEY `opportunity_popup_daily_date_idx` (`eventDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ===== END drizzle/0023_popup_daily_aggregates.sql =====

-- ===== BEGIN drizzle/0024_admin_auto_trade_policy.sql =====
ALTER TABLE `customer_controls`
  ADD COLUMN IF NOT EXISTS `autoTradeMode` enum('inherit','enabled','disabled') NOT NULL DEFAULT 'inherit';
-- ===== END drizzle/0024_admin_auto_trade_policy.sql =====

-- ===== BEGIN drizzle/0025_seed_opportunity_package_policies.sql =====
INSERT INTO `opportunity_package_policies`
  (`packageName`, `maxPopupsPerDay`, `maxVisibleOffers`, `minHourlyTarget`, `normalHourlyTarget`, `marketInfluenceBps`, `burstEnabled`, `maxBurstSize`, `enabled`)
VALUES
  ('Starter', 50, 10, 2, 2, 3000, FALSE, 0, TRUE),
  ('Growth', 100, 20, 2, 4, 5000, TRUE, 2, TRUE),
  ('Pro', 200, 40, 4, 6, 7000, TRUE, 3, TRUE),
  ('Institutional', 500, 100, 6, 10, 8500, TRUE, 3, TRUE)
ON DUPLICATE KEY UPDATE
  `packageName` = VALUES(`packageName`);
-- ===== END drizzle/0025_seed_opportunity_package_policies.sql =====

-- ===== BEGIN drizzle/0026_trade_integrity.sql =====
CREATE UNIQUE INDEX IF NOT EXISTS `trade_positions_user_offer_unique` ON `trade_positions` (`userId`, `offerId`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `opportunity_delivery_user_offer_day_unique` ON `opportunity_delivery_events` (`userId`, `offerId`, `quotaDay`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `balance_ledger_reference_unique` ON `balance_ledger` (`reference`);
-- ===== END drizzle/0026_trade_integrity.sql =====

-- ===== BEGIN drizzle/0027_database_configuration_registry.sql =====
INSERT INTO `app_settings` (`settingKey`, `settingValue`)
VALUES
  ('autoTrade.globalEnabled', 'false'),
  ('email.provider', 'disabled'),
  ('email.fromName', 'WiseBond Support'),
  ('email.fromAddress', 'no-reply@wisebond.org'),
  ('email.replyTo', ''),
  ('ticket.maxAttachmentMb', '25'),
  ('ticket.allowedMimeTypes', 'image/*,application/pdf,text/plain,.doc,.docx,.xls,.xlsx'),
  ('opportunity.countdownSeconds', '90'),
  ('signup.autoCreditMinor', '1000'),
  ('signup.autoCreditCurrency', 'USD'),
  ('sound.settings', '{"opportunity":"soft-chime","credit":"credit","debit":"debit","enabled":true,"loopOpportunity":false}'),
  ('signup.defaultRule', 'automatic'),
  ('signup.countryRules', '{}'),
  ('signup.features', '{"emailVerification":true,"twofa":true,"deviceAlerts":true,"passwordPolicy":true,"duplicateDetection":true,"riskScoring":true,"referrals":false,"termsConsent":true,"ageGate":true,"welcomeEmail":true}'),
  ('policy.defaults', '{"kyc":true,"withdrawals":true,"twofa":true,"facial":false}'),
  ('branding.settings', '{"platformName":"WiseBond","tagline":"Transparent digital asset intelligence","browserTitle":"WiseBond","accentColor":"#7CE7C2","logoUrl":"/arbitrade-mark.svg","faviconUrl":"/arbitrade-mark.svg","shareImageUrl":""}')
ON DUPLICATE KEY UPDATE `settingKey` = `settingKey`;
-- ===== END drizzle/0027_database_configuration_registry.sql =====

-- ===== BEGIN drizzle/0028_trade_settlement_gate.sql =====
INSERT INTO `app_settings` (`settingKey`, `settingValue`)
VALUES
  ('trade.settlementDelaySeconds', '900'),
  ('trade.blockOpportunitiesUntilSettled', 'true')
ON DUPLICATE KEY UPDATE `settingKey` = `settingKey`;
-- ===== END drizzle/0028_trade_settlement_gate.sql =====

-- ===== BEGIN drizzle/0029_trade_inter_trade_cooldown.sql =====
INSERT INTO `app_settings` (`settingKey`, `settingValue`)
VALUES ('trade.interTradeCooldownSeconds', '30')
ON DUPLICATE KEY UPDATE `settingKey` = `settingKey`;
-- ===== END drizzle/0029_trade_inter_trade_cooldown.sql =====

-- ===== BEGIN drizzle/0030_admin_timing_policy.sql =====
ALTER TABLE `trade_positions`
  ADD COLUMN IF NOT EXISTS `creditAt` timestamp NULL;
--> statement-breakpoint
INSERT INTO `app_settings` (`settingKey`, `settingValue`)
VALUES
  ('trade.creditDelaySeconds', '0'),
  ('opportunity.nextPopupFormulaDelaySeconds', '30'),
  ('opportunity.popup.minGapSeconds', '45'),
  ('opportunity.popup.displaySeconds', '8'),
  ('opportunity.popup.preAlertSeconds', '4'),
  ('opportunity.popup.jitterSeconds', '90'),
  ('opportunity.popup.maxPerHour', '12'),
  ('market.refreshIntervalMinutes', '120')
ON DUPLICATE KEY UPDATE `settingKey` = `settingKey`;
-- ===== END drizzle/0030_admin_timing_policy.sql =====

-- ===== BEGIN drizzle/0031_package_trade_amount_bounds.sql =====
ALTER TABLE `opportunity_package_policies`
  ADD COLUMN IF NOT EXISTS `minimumTradeMinor` int NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS `maximumTradeMinor` int NOT NULL DEFAULT 100000;
--> statement-breakpoint
UPDATE `opportunity_package_policies`
SET
  `minimumTradeMinor` = CASE `packageName`
    WHEN 'Starter' THEN 1000
    WHEN 'Growth' THEN 5000
    WHEN 'Pro' THEN 10000
    WHEN 'Institutional' THEN 200000
    ELSE `minimumTradeMinor`
  END,
  `maximumTradeMinor` = CASE `packageName`
    WHEN 'Starter' THEN 500000
    WHEN 'Growth' THEN 1500000
    WHEN 'Pro' THEN 3000000
    WHEN 'Institutional' THEN 700000
    ELSE `maximumTradeMinor`
  END;
-- ===== END drizzle/0031_package_trade_amount_bounds.sql =====

-- ===== BEGIN drizzle/0032_package_trade_dollar_units.sql =====
ALTER TABLE `opportunity_package_policies`
  CHANGE COLUMN `minimumTradeMinor` `minimumTradeUnits` int NOT NULL DEFAULT 1000,
  CHANGE COLUMN `maximumTradeMinor` `maximumTradeUnits` int NOT NULL DEFAULT 100000;
-- ===== END drizzle/0032_package_trade_dollar_units.sql =====

-- ===== BEGIN drizzle/0033_email_delivery_flows.sql =====
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
-- ===== END drizzle/0033_email_delivery_flows.sql =====

-- ===== BEGIN drizzle/0033_kyc_v2.sql =====
CREATE TABLE IF NOT EXISTS `kyc_settings` (`id` int AUTO_INCREMENT NOT NULL, `settingKey` varchar(160) NOT NULL, `settingValue` text NOT NULL, `updatedBy` int, `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT `kyc_settings_id` PRIMARY KEY(`id`), CONSTRAINT `kyc_settings_key_unique` UNIQUE(`settingKey`));
CREATE TABLE IF NOT EXISTS `kyc_profiles` (`id` int AUTO_INCREMENT NOT NULL, `userId` int NOT NULL, `overallStatus` varchar(32) NOT NULL DEFAULT 'NOT_STARTED', `currentLevel` varchar(16) NOT NULL DEFAULT 'L0', `riskLevel` varchar(32) NOT NULL DEFAULT 'LOW_RISK', `grandfathered` tinyint(1) NOT NULL DEFAULT 1, `createdAt` timestamp NOT NULL DEFAULT (now()), `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT `kyc_profiles_id` PRIMARY KEY(`id`), CONSTRAINT `kyc_profiles_user_unique` UNIQUE(`userId`), CONSTRAINT `kyc_profiles_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`));
CREATE TABLE IF NOT EXISTS `kyc_levels` (`id` int AUTO_INCREMENT NOT NULL, `code` varchar(16) NOT NULL, `name` varchar(120) NOT NULL, `rank` int NOT NULL, `enabled` tinyint(1) NOT NULL DEFAULT 1, `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `kyc_levels_id` PRIMARY KEY(`id`), CONSTRAINT `kyc_levels_code_unique` UNIQUE(`code`));
CREATE TABLE IF NOT EXISTS `kyc_stages` (`id` int AUTO_INCREMENT NOT NULL, `code` varchar(40) NOT NULL, `name` varchar(120) NOT NULL, `description` text NOT NULL, `whyRequired` text NOT NULL, `rank` int NOT NULL, `enabled` tinyint(1) NOT NULL DEFAULT 1, CONSTRAINT `kyc_stages_id` PRIMARY KEY(`id`), CONSTRAINT `kyc_stages_code_unique` UNIQUE(`code`));
CREATE TABLE IF NOT EXISTS `kyc_stage_requirements` (`id` int AUTO_INCREMENT NOT NULL, `stageCode` varchar(40) NOT NULL, `levelCode` varchar(16) NOT NULL, `countryCode` varchar(8), `accountType` varchar(64), `riskLevel` varchar(32), `product` varchar(80), `transactionLimitMinor` int, `required` tinyint(1) NOT NULL DEFAULT 1, CONSTRAINT `kyc_stage_requirements_id` PRIMARY KEY(`id`), INDEX `kyc_stage_requirements_lookup` (`levelCode`,`countryCode`,`accountType`,`riskLevel`));
CREATE TABLE IF NOT EXISTS `kyc_stage_dependencies` (`id` int AUTO_INCREMENT NOT NULL, `stageCode` varchar(40) NOT NULL, `dependsOnStageCode` varchar(40) NOT NULL, CONSTRAINT `kyc_stage_dependencies_id` PRIMARY KEY(`id`), CONSTRAINT `kyc_stage_dependencies_unique` UNIQUE(`stageCode`,`dependsOnStageCode`));
CREATE TABLE IF NOT EXISTS `kyc_stage_states` (`id` int AUTO_INCREMENT NOT NULL, `profileId` int NOT NULL, `stageCode` varchar(40) NOT NULL, `state` varchar(32) NOT NULL DEFAULT 'NOT_STARTED', `source` varchar(16), `verifiedAt` timestamp NULL, `lastAttemptAt` timestamp NULL, `failureReason` text, `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT `kyc_stage_states_id` PRIMARY KEY(`id`), CONSTRAINT `kyc_stage_states_unique` UNIQUE(`profileId`,`stageCode`), INDEX `kyc_stage_states_queue` (`state`,`stageCode`));
CREATE TABLE IF NOT EXISTS `kyc_verification_sessions` (`id` varchar(64) NOT NULL, `profileId` int NOT NULL, `expiresAt` timestamp NOT NULL, `deviceMetadata` text, `attemptCount` int NOT NULL DEFAULT 0, `status` varchar(24) NOT NULL DEFAULT 'ACTIVE', `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `kyc_verification_sessions_id` PRIMARY KEY(`id`), INDEX `kyc_sessions_profile` (`profileId`,`status`));
CREATE TABLE IF NOT EXISTS `kyc_attempts` (`id` int AUTO_INCREMENT NOT NULL, `sessionId` varchar(64) NOT NULL, `profileId` int NOT NULL, `stageCode` varchar(40) NOT NULL, `idempotencyKey` varchar(160) NOT NULL, `status` varchar(32) NOT NULL DEFAULT 'PROCESSING', `provider` varchar(120), `providerVersion` varchar(80), `confidence` decimal(8,5), `riskScore` decimal(8,5), `error` text, `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `kyc_attempts_id` PRIMARY KEY(`id`), CONSTRAINT `kyc_attempts_idempotency_unique` UNIQUE(`idempotencyKey`), INDEX `kyc_attempts_profile` (`profileId`,`stageCode`));
CREATE TABLE IF NOT EXISTS `kyc_email_verifications` (`id` int AUTO_INCREMENT NOT NULL, `profileId` int NOT NULL, `tokenHash` varchar(128) NOT NULL, `expiresAt` timestamp NOT NULL, `usedAt` timestamp NULL, `attempts` int NOT NULL DEFAULT 0, `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `kyc_email_verifications_id` PRIMARY KEY(`id`), INDEX `kyc_email_token` (`tokenHash`));
CREATE TABLE IF NOT EXISTS `kyc_phone_verifications` (`id` int AUTO_INCREMENT NOT NULL, `profileId` int NOT NULL, `phone` varchar(40) NOT NULL, `otpHmac` varchar(128) NOT NULL, `expiresAt` timestamp NOT NULL, `usedAt` timestamp NULL, `attempts` int NOT NULL DEFAULT 0, `resendAfter` timestamp NOT NULL, CONSTRAINT `kyc_phone_verifications_id` PRIMARY KEY(`id`));
CREATE TABLE IF NOT EXISTS `kyc_address_verifications` (`id` int AUTO_INCREMENT NOT NULL, `profileId` int NOT NULL, `countryCode` varchar(8) NOT NULL, `stateProvince` varchar(120), `city` varchar(120) NOT NULL, `district` varchar(120), `addressLine` varchar(255) NOT NULL, `postalCode` varchar(40), `method` varchar(40) NOT NULL DEFAULT 'DECLARATION', `status` varchar(32) NOT NULL DEFAULT 'DECLARED', `proofStorageKey` varchar(512), `createdAt` timestamp NOT NULL DEFAULT (now()), `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT `kyc_address_verifications_id` PRIMARY KEY(`id`), INDEX `kyc_address_profile` (`profileId`,`status`));
CREATE TABLE IF NOT EXISTS `kyc_documents` (`id` int AUTO_INCREMENT NOT NULL, `profileId` int NOT NULL, `documentType` varchar(80) NOT NULL, `countryCode` varchar(8) NOT NULL, `frontStorageKey` varchar(512) NOT NULL, `backStorageKey` varchar(512), `documentNumberHash` varchar(128), `status` varchar(32) NOT NULL DEFAULT 'PROCESSING', `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `kyc_documents_id` PRIMARY KEY(`id`), INDEX `kyc_document_duplicate` (`documentNumberHash`));
CREATE TABLE IF NOT EXISTS `kyc_document_extractions` (`id` int AUTO_INCREMENT NOT NULL, `documentId` int NOT NULL, `fieldsJson` text NOT NULL, `mrzJson` text, `barcodeJson` text, `qualityJson` text, `provider` varchar(120) NOT NULL, `providerVersion` varchar(80), `outcome` varchar(32) NOT NULL, `confidence` decimal(8,5), `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `kyc_document_extractions_id` PRIMARY KEY(`id`));
CREATE TABLE IF NOT EXISTS `kyc_consistency_results` (`id` int AUTO_INCREMENT NOT NULL, `documentId` int NOT NULL, `checkCode` varchar(64) NOT NULL, `outcome` varchar(32) NOT NULL, `score` decimal(8,5), `details` text, `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `kyc_consistency_results_id` PRIMARY KEY(`id`), INDEX `kyc_consistency_document` (`documentId`,`checkCode`));
CREATE TABLE IF NOT EXISTS `kyc_liveness_checks` (`id` int AUTO_INCREMENT NOT NULL, `profileId` int NOT NULL, `sessionId` varchar(64) NOT NULL, `challengeJson` text NOT NULL, `outcome` varchar(32) NOT NULL, `provider` varchar(120) NOT NULL, `providerVersion` varchar(80), `confidence` decimal(8,5), `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `kyc_liveness_checks_id` PRIMARY KEY(`id`));
CREATE TABLE IF NOT EXISTS `kyc_face_verifications` (`id` int AUTO_INCREMENT NOT NULL, `profileId` int NOT NULL, `sessionId` varchar(64) NOT NULL, `documentId` int, `similarity` decimal(8,5), `thresholdUsed` decimal(8,5), `outcome` varchar(32) NOT NULL, `provider` varchar(120) NOT NULL, `providerVersion` varchar(80), `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `kyc_face_verifications_id` PRIMARY KEY(`id`));
CREATE TABLE IF NOT EXISTS `kyc_risk_scores` (`id` int AUTO_INCREMENT NOT NULL, `profileId` int NOT NULL, `riskLevel` varchar(32) NOT NULL, `score` decimal(8,5) NOT NULL, `factorsJson` text NOT NULL, `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `kyc_risk_scores_id` PRIMARY KEY(`id`), INDEX `kyc_risk_profile` (`profileId`,`createdAt`));
CREATE TABLE IF NOT EXISTS `kyc_risk_rules` (`id` int AUTO_INCREMENT NOT NULL, `ruleCode` varchar(80) NOT NULL, `description` text NOT NULL, `weight` decimal(8,5) NOT NULL, `enabled` tinyint(1) NOT NULL DEFAULT 1, CONSTRAINT `kyc_risk_rules_id` PRIMARY KEY(`id`), CONSTRAINT `kyc_risk_rule_unique` UNIQUE(`ruleCode`));
CREATE TABLE IF NOT EXISTS `kyc_manual_reviews` (`id` int AUTO_INCREMENT NOT NULL, `profileId` int NOT NULL, `stageCode` varchar(40) NOT NULL, `status` varchar(24) NOT NULL DEFAULT 'OPEN', `assignedAdminId` int, `slaDueAt` timestamp NULL, `reason` text NOT NULL, `createdAt` timestamp NOT NULL DEFAULT (now()), `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT `kyc_manual_reviews_id` PRIMARY KEY(`id`), INDEX `kyc_review_queue` (`status`,`createdAt`));
CREATE TABLE IF NOT EXISTS `kyc_admin_overrides` (`id` int AUTO_INCREMENT NOT NULL, `profileId` int NOT NULL, `stageCode` varchar(40) NOT NULL, `requestedBy` int NOT NULL, `approvedBy` int, `status` varchar(24) NOT NULL DEFAULT 'APPLIED', `reason` text NOT NULL, `revokedAt` timestamp NULL, `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `kyc_admin_overrides_id` PRIMARY KEY(`id`));
CREATE TABLE IF NOT EXISTS `kyc_consents` (`id` int AUTO_INCREMENT NOT NULL, `profileId` int NOT NULL, `purpose` varchar(120) NOT NULL, `version` varchar(40) NOT NULL, `consentedAt` timestamp NOT NULL DEFAULT (now()), `ipAddress` varchar(128), CONSTRAINT `kyc_consents_id` PRIMARY KEY(`id`));
CREATE TABLE IF NOT EXISTS `kyc_screening_results` (`id` int AUTO_INCREMENT NOT NULL, `profileId` int NOT NULL, `provider` varchar(120) NOT NULL, `outcome` varchar(32) NOT NULL, `matchesJson` text, `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `kyc_screening_results_id` PRIMARY KEY(`id`));
CREATE TABLE IF NOT EXISTS `kyc_provider_configs` (`id` int AUTO_INCREMENT NOT NULL, `capability` varchar(80) NOT NULL, `provider` varchar(120) NOT NULL, `priority` int NOT NULL DEFAULT 1, `enabled` tinyint(1) NOT NULL DEFAULT 1, `healthStatus` varchar(24) NOT NULL DEFAULT 'UNKNOWN', `configJson` text, CONSTRAINT `kyc_provider_configs_id` PRIMARY KEY(`id`), CONSTRAINT `kyc_provider_config_unique` UNIQUE(`capability`,`provider`));
CREATE TABLE IF NOT EXISTS `kyc_provider_attempts` (`id` int AUTO_INCREMENT NOT NULL, `profileId` int, `capability` varchar(80) NOT NULL, `provider` varchar(120) NOT NULL, `providerVersion` varchar(80), `latencyMs` int, `outcome` varchar(32) NOT NULL, `error` text, `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `kyc_provider_attempts_id` PRIMARY KEY(`id`));
CREATE TABLE IF NOT EXISTS `kyc_rejection_reasons` (`id` int AUTO_INCREMENT NOT NULL, `code` varchar(80) NOT NULL, `label` varchar(160) NOT NULL, `enabled` tinyint(1) NOT NULL DEFAULT 1, CONSTRAINT `kyc_rejection_reasons_id` PRIMARY KEY(`id`), CONSTRAINT `kyc_rejection_reason_unique` UNIQUE(`code`));
CREATE TABLE IF NOT EXISTS `kyc_retention_policies` (`id` int AUTO_INCREMENT NOT NULL, `dataType` varchar(80) NOT NULL, `retentionDays` int NOT NULL, `deletionMode` varchar(40) NOT NULL DEFAULT 'DELETE', CONSTRAINT `kyc_retention_policies_id` PRIMARY KEY(`id`), CONSTRAINT `kyc_retention_unique` UNIQUE(`dataType`));
CREATE TABLE IF NOT EXISTS `kyc_audit_logs` (`id` bigint AUTO_INCREMENT NOT NULL, `event` varchar(80) NOT NULL, `profileId` int, `customerId` int, `actorId` int, `actorType` varchar(24) NOT NULL, `result` varchar(32), `reason` text, `sessionId` varchar(64), `provider` varchar(120), `providerVersion` varchar(80), `payloadJson` text, `previousHash` varchar(128), `recordHash` varchar(128) NOT NULL, `createdAt` timestamp NOT NULL DEFAULT (now()), CONSTRAINT `kyc_audit_logs_id` PRIMARY KEY(`id`), INDEX `kyc_audit_profile_time` (`profileId`,`createdAt`));
INSERT IGNORE INTO `kyc_settings` (`settingKey`,`settingValue`) VALUES ('kyc_v2_enabled','true'),('demo_mode_enabled','true'),('email_expiry_minutes','15'),('phone_expiry_minutes','10'),('face_match_pass_threshold','0.82'),('face_match_review_threshold','0.68'),('retention_raw_days','1'),('retention_extracted_days','365'),('retention_results_days','2555');
INSERT IGNORE INTO `kyc_levels` (`code`,`name`,`rank`) VALUES ('L0','Email',0),('L1','Email + phone',1),('L2','Email + phone + address',2),('L3','Identity document',3),('L4','Live face and liveness',4);
INSERT IGNORE INTO `kyc_stages` (`code`,`name`,`description`,`whyRequired`,`rank`) VALUES ('EMAIL','Email verification','Verify control of your email address.','We need to confirm that you control this account.',0),('PHONE','Phone verification','Verify your phone with a one-time code.','This protects your account and supports secure recovery.',1),('ADDRESS','Address verification','Provide your residential address.','We need to establish where you live.',2),('IDENTITY_DOCUMENT','Identity document','Capture a government-issued identity document.','This confirms the identity information you submit.',3),('FACE_LIVENESS','Live face verification','Complete a live camera challenge.','This helps compare you with your identity document and raises the cost of spoofing.',4);
INSERT IGNORE INTO `kyc_stage_dependencies` (`stageCode`,`dependsOnStageCode`) VALUES ('PHONE','EMAIL'),('ADDRESS','PHONE'),('IDENTITY_DOCUMENT','ADDRESS'),('FACE_LIVENESS','IDENTITY_DOCUMENT');
INSERT IGNORE INTO `kyc_stage_requirements` (`stageCode`,`levelCode`,`required`) VALUES ('EMAIL','L0',1),('PHONE','L1',1),('ADDRESS','L2',1),('IDENTITY_DOCUMENT','L3',1),('FACE_LIVENESS','L4',1);
INSERT IGNORE INTO `kyc_risk_rules` (`ruleCode`,`description`,`weight`) VALUES ('FAILED_ATTEMPTS','Repeated failed attempts',0.25),('DEVICE_CHANGES','Rapid device changes',0.20),('DUPLICATE_IDENTITY','Duplicate document identity',0.40),('SCREENING_HIT','Sanctions or PEP screening match',0.60),('MANUAL_HISTORY','Manual-review history',0.15);
INSERT IGNORE INTO `kyc_rejection_reasons` (`code`,`label`) VALUES ('DOCUMENT_UNREADABLE','Document is unreadable'),('DOCUMENT_EXPIRED','Document is expired'),('DATA_MISMATCH','Submitted data does not match'),('LIVENESS_FAILED','Liveness challenge failed'),('DUPLICATE_IDENTITY','Identity appears on another account'),('OTHER','Other compliance reason');
INSERT IGNORE INTO `kyc_retention_policies` (`dataType`,`retentionDays`,`deletionMode`) VALUES ('raw_camera_capture',1,'DELETE'),('extracted_data',365,'CRYPTO_SHRED'),('verification_results',2555,'RETAIN'),('rejected_attempt',90,'DELETE');
-- ===== END drizzle/0033_kyc_v2.sql =====

-- ===== BEGIN drizzle/0034_email_notifications.sql =====
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  tokenHash VARCHAR(128) NOT NULL UNIQUE,
  expiresAt TIMESTAMP NOT NULL,
  usedAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX password_reset_user_idx (userId),
  INDEX password_reset_expiry_idx (expiresAt)
);

CREATE TABLE IF NOT EXISTS admin_email_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  adminId INT NOT NULL,
  recipientCount INT NOT NULL DEFAULT 0,
  subject VARCHAR(255) NOT NULL,
  htmlBody MEDIUMTEXT NOT NULL,
  textBody TEXT NOT NULL,
  attachmentJson MEDIUMTEXT NULL,
  status ENUM('QUEUED','SENT','FAILED') NOT NULL DEFAULT 'QUEUED',
  lastError TEXT NULL,
  sentAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX admin_email_status_idx (status),
  INDEX admin_email_created_idx (createdAt)
);

INSERT INTO app_settings (settingKey, settingValue)
VALUES ('email.smtp', '{"mode":"direct","host":"127.0.0.1","port":25,"secure":false,"user":"","password":""}')
ON DUPLICATE KEY UPDATE settingKey=VALUES(settingKey);
INSERT INTO app_settings (settingKey, settingValue)
VALUES ('email.dailyCloseHourUtc', '23')
ON DUPLICATE KEY UPDATE settingKey=VALUES(settingKey);
INSERT INTO app_settings (settingKey, settingValue)
VALUES ('email.dailyCloseMinuteUtc', '59')
ON DUPLICATE KEY UPDATE settingKey=VALUES(settingKey);
-- ===== END drizzle/0034_email_notifications.sql =====

-- ===== BEGIN drizzle/0035_default_portal_accounts.sql =====
-- Portable default portal accounts. Passwords are stored only as salted scrypt hashes.
UPDATE users SET name='Administrator', loginMethod='password', role='admin', passwordHash='scrypt$wisebond-default-admin-2026$22e95b9ec5f1166688769aa6e3eff79136aa5e515e7279c5a0d9c5dbfee31325', packageName='Institutional' WHERE email='admin@wisebond.org';
INSERT INTO users (openId,name,email,loginMethod,role,passwordHash,packageName) SELECT 'local:admin:admin@wisebond.org','Administrator','admin@wisebond.org','password','admin','scrypt$wisebond-default-admin-2026$22e95b9ec5f1166688769aa6e3eff79136aa5e515e7279c5a0d9c5dbfee31325','Institutional' FROM (SELECT 1) AS seed WHERE NOT EXISTS (SELECT 1 FROM users WHERE email='admin@wisebond.org');
UPDATE users SET name='Customer Account', loginMethod='password', role='user', passwordHash='scrypt$wisebond-default-customer-2026$ef010b2627d438f54ef919c1f79ecde4df7a020bd70f6225d98d6b2db50c2fc1', packageName='Starter' WHERE email='info@wisebond.org';
INSERT INTO users (openId,name,email,loginMethod,role,passwordHash,packageName) SELECT 'local:user:info@wisebond.org','Customer Account','info@wisebond.org','password','user','scrypt$wisebond-default-customer-2026$ef010b2627d438f54ef919c1f79ecde4df7a020bd70f6225d98d6b2db50c2fc1','Starter' FROM (SELECT 1) AS seed WHERE NOT EXISTS (SELECT 1 FROM users WHERE email='info@wisebond.org');
INSERT INTO customer_controls (userId) SELECT id FROM users WHERE email='info@wisebond.org' ORDER BY id LIMIT 1 ON DUPLICATE KEY UPDATE userId=VALUES(userId);
INSERT INTO app_settings (settingKey,settingValue) VALUES ('opportunity.deskLabel','WiseBond Market Intelligence Desk') ON DUPLICATE KEY UPDATE settingValue=VALUES(settingValue);
-- ===== END drizzle/0035_default_portal_accounts.sql =====

-- ===== BEGIN drizzle/0036_crypto_mining_portal.sql =====
CREATE TABLE IF NOT EXISTS mining_economics_versions (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  version INT NOT NULL UNIQUE,
  effectiveAt DATETIME(3) NOT NULL,
  globalEnabled TINYINT(1) NOT NULL DEFAULT 0,
  boostsEnabled TINYINT(1) NOT NULL DEFAULT 1,
  tokenUnitsPerUsd DECIMAL(36,18) NOT NULL DEFAULT 1000,
  rewardTokensPerThsHour DECIMAL(36,18) NOT NULL DEFAULT 0,
  swapFeeBps INT NOT NULL DEFAULT 0,
  purchaseFeeBps INT NOT NULL DEFAULT 0,
  minSwapTokens DECIMAL(36,18) NOT NULL DEFAULT 1,
  maxSwapTokens DECIMAL(36,18) NOT NULL DEFAULT 1000000,
  defaultAutoConversionThreshold DECIMAL(36,18) NOT NULL DEFAULT 0,
  boostCycleSeconds INT NOT NULL DEFAULT 14400,
  boostDurationSeconds INT NOT NULL DEFAULT 300,
  quoteTtlSeconds INT NOT NULL DEFAULT 90,
  fiatMaxAgeSeconds INT NOT NULL DEFAULT 172800,
  cryptoMaxAgeSeconds INT NOT NULL DEFAULT 900,
  maxRateDeviationBps INT NOT NULL DEFAULT 5000,
  dailyRewardCapTokens DECIMAL(36,18) NOT NULL DEFAULT 0,
  dualApprovalThresholdUsd DECIMAL(36,18) NOT NULL DEFAULT 100,
  updatedBy INT NULL,
  reason TEXT NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_mining_economics_effective (effectiveAt, version)
) ENGINE=InnoDB;

INSERT IGNORE INTO mining_economics_versions
  (version, effectiveAt, globalEnabled, boostsEnabled, tokenUnitsPerUsd, rewardTokensPerThsHour,
   swapFeeBps, purchaseFeeBps, minSwapTokens, maxSwapTokens, defaultAutoConversionThreshold,
   boostCycleSeconds, boostDurationSeconds, quoteTtlSeconds, fiatMaxAgeSeconds, cryptoMaxAgeSeconds,
   maxRateDeviationBps, dailyRewardCapTokens, dualApprovalThresholdUsd, reason)
VALUES
  (1, UTC_TIMESTAMP(3), 0, 1, 1000, 0, 0, 0, 1, 1000000, 0, 14400, 300, 90, 172800, 900,
   5000, 0, 100,
   'Simulation-only defaults. The 1,000 TOKEN per USD value is an illustrative platform reference, not a market price or redemption promise. Mining is paused until an administrator configures economics and publishes a package.');

CREATE TABLE IF NOT EXISTS mining_packages (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(48) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  status ENUM('draft','published','paused','retired') NOT NULL DEFAULT 'draft',
  currentVersionId INT NULL,
  createdBy INT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_mining_packages_status (status, updatedAt)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mining_package_versions (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  packageId INT NOT NULL,
  version INT NOT NULL,
  versionStatus ENUM('draft','published','retired') NOT NULL DEFAULT 'draft',
  priceAmount DECIMAL(36,18) NOT NULL,
  priceAsset VARCHAR(12) NOT NULL,
  baseThs DECIMAL(30,12) NOT NULL,
  boostBonusThs DECIMAL(30,12) NOT NULL DEFAULT 0,
  boostDurationSeconds INT NULL,
  maxPerCustomer INT NOT NULL DEFAULT 0,
  stackingPolicy ENUM('stack','replace') NOT NULL DEFAULT 'replace',
  expirySeconds INT NULL,
  termsText TEXT NOT NULL,
  simulationAcknowledgementRequired TINYINT(1) NOT NULL DEFAULT 1,
  effectiveAt DATETIME(3) NULL,
  createdBy INT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_mining_package_version (packageId, version),
  INDEX idx_mining_package_version_active (packageId, versionStatus, effectiveAt)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mining_customer_packages (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  packageId INT NOT NULL,
  packageVersionId INT NOT NULL,
  status ENUM('active','replaced','expired','cancelled') NOT NULL DEFAULT 'active',
  purchasedAt DATETIME(3) NOT NULL,
  startsAt DATETIME(3) NOT NULL,
  expiresAt DATETIME(3) NULL,
  endedAt DATETIME(3) NULL,
  baseThsSnapshot DECIMAL(30,12) NOT NULL,
  boostBonusThsSnapshot DECIMAL(30,12) NOT NULL,
  priceAmount DECIMAL(36,18) NOT NULL,
  priceAsset VARCHAR(12) NOT NULL,
  paymentAmount DECIMAL(36,18) NOT NULL,
  paymentAsset VARCHAR(12) NOT NULL,
  quoteId INT NULL,
  ledgerTransactionId INT NOT NULL,
  idempotencyKey VARCHAR(160) NOT NULL UNIQUE,
  termsSnapshot TEXT NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_mining_customer_packages_active (userId, status, startsAt, expiresAt),
  INDEX idx_mining_customer_packages_package (packageId, packageVersionId)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mining_checkpoints (
  userId INT NOT NULL PRIMARY KEY,
  lastAccruedAt DATETIME(3) NOT NULL,
  workerVersion VARCHAR(32) NOT NULL DEFAULT '1',
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mining_ledger_transactions (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId INT NULL,
  actorUserId INT NULL,
  transactionType VARCHAR(48) NOT NULL,
  status ENUM('posted','reversed','pending') NOT NULL DEFAULT 'posted',
  idempotencyKey VARCHAR(160) NOT NULL UNIQUE,
  referenceCode VARCHAR(72) NOT NULL UNIQUE,
  reversalOfId INT NULL UNIQUE,
  reason TEXT NULL,
  metadataJson LONGTEXT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_mining_ledger_user_date (userId, createdAt),
  INDEX idx_mining_ledger_type_date (transactionType, createdAt)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mining_reward_events (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  intervalStart DATETIME(3) NOT NULL,
  intervalEnd DATETIME(3) NOT NULL,
  baseThs DECIMAL(30,12) NOT NULL,
  boostThs DECIMAL(30,12) NOT NULL,
  rewardTokensPerThsHour DECIMAL(36,18) NOT NULL,
  tokenAmount DECIMAL(36,18) NOT NULL,
  configVersion INT NOT NULL,
  packageSnapshotJson LONGTEXT NOT NULL,
  idempotencyKey VARCHAR(160) NOT NULL UNIQUE,
  ledgerTransactionId INT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_mining_reward_interval (userId, intervalStart, intervalEnd),
  INDEX idx_mining_reward_user_date (userId, intervalEnd),
  INDEX idx_mining_reward_config (configVersion, intervalEnd)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mining_boost_activations (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  cycleStart DATETIME(3) NOT NULL,
  eligibleAt DATETIME(3) NOT NULL,
  cycleExpiresAt DATETIME(3) NOT NULL,
  startedAt DATETIME(3) NOT NULL,
  endsAt DATETIME(3) NOT NULL,
  bonusThs DECIMAL(30,12) NOT NULL,
  packageVersionId INT NOT NULL,
  status ENUM('active','expired','cancelled') NOT NULL DEFAULT 'active',
  idempotencyKey VARCHAR(160) NOT NULL UNIQUE,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_mining_boost_cycle (userId, cycleStart),
  INDEX idx_mining_boost_active (userId, status, endsAt)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mining_conversion_preferences (
  userId INT NOT NULL PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  targetDenomination VARCHAR(12) NOT NULL DEFAULT 'USD',
  minimumThreshold DECIMAL(36,18) NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mining_conversion_preference_versions (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  version INT NOT NULL,
  enabled TINYINT(1) NOT NULL,
  targetDenomination VARCHAR(12) NOT NULL,
  minimumThreshold DECIMAL(36,18) NOT NULL,
  effectiveAt DATETIME(3) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_mining_preference_version (userId, version),
  INDEX idx_mining_preference_effective (userId, effectiveAt, version)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mining_conversion_jobs (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rewardEventId INT NOT NULL UNIQUE,
  userId INT NOT NULL,
  targetDenomination VARCHAR(12) NOT NULL,
  tokenAmount DECIMAL(36,18) NOT NULL,
  minimumThreshold DECIMAL(36,18) NOT NULL,
  preferenceVersion INT NOT NULL,
  status ENUM('queued','waiting','retrying','completed','failed') NOT NULL DEFAULT 'queued',
  attempts INT NOT NULL DEFAULT 0,
  availableAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  lastError VARCHAR(500) NULL,
  lastNotifiedAt DATETIME(3) NULL,
  conversionId INT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_mining_conversion_queue (status, availableAt, id),
  INDEX idx_mining_conversion_user (userId, createdAt)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mining_quote_snapshots (
  quoteId INT NOT NULL PRIMARY KEY,
  userId INT NOT NULL,
  purpose ENUM('manual_swap','package_purchase','auto_conversion') NOT NULL,
  packageVersionId INT NULL,
  tokenUnitsPerUsd DECIMAL(36,18) NOT NULL,
  sourceUsdRate DECIMAL(36,18) NOT NULL,
  targetUsdRate DECIMAL(36,18) NOT NULL,
  marketProvider VARCHAR(120) NOT NULL,
  marketObservedAt DATETIME(3) NOT NULL,
  targetScale INT NOT NULL,
  feeBps INT NOT NULL,
  roundingMode VARCHAR(24) NOT NULL DEFAULT 'down',
  detailsJson LONGTEXT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_mining_quote_user (userId, purpose, createdAt)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mining_adjustment_requests (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  assetCode VARCHAR(12) NOT NULL,
  amount DECIMAL(36,18) NOT NULL,
  direction ENUM('credit','debit') NOT NULL,
  reason TEXT NOT NULL,
  status ENUM('pending','posted','approved','rejected') NOT NULL DEFAULT 'pending',
  requestedBy INT NOT NULL,
  approvedBy INT NULL,
  ledgerTransactionId INT NULL,
  idempotencyKey VARCHAR(160) NOT NULL UNIQUE,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  resolvedAt DATETIME(3) NULL,
  INDEX idx_mining_adjustments_pending (status, createdAt),
  INDEX idx_mining_adjustments_user (userId, createdAt)
) ENGINE=InnoDB;

-- Seed zero-balance platform clearing/issuance wallets in the existing high-precision ledger.
-- Customer balances remain isolated from the legacy minor-unit wallet and are never payout balances.
CREATE TABLE IF NOT EXISTS mining_wallet_baselines (
  walletId INT NOT NULL PRIMARY KEY,
  assetCode VARCHAR(32) NOT NULL,
  openingAmount DECIMAL(36,18) NOT NULL,
  capturedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

INSERT INTO v5_wallets (userId, assetCode, availableAmount, lockedAmount, pendingAmount)
SELECT 0, 'TOKEN', '0', '0', '0' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM v5_wallets WHERE userId=0 AND assetCode='TOKEN');
INSERT INTO v5_wallets (userId, assetCode, availableAmount, lockedAmount, pendingAmount)
SELECT 0, 'CKI', '0', '0', '0' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM v5_wallets WHERE userId=0 AND assetCode='CKI');
INSERT INTO v5_wallets (userId, assetCode, availableAmount, lockedAmount, pendingAmount)
SELECT 0, 'USD', '0', '0', '0' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM v5_wallets WHERE userId=0 AND assetCode='USD');
INSERT INTO v5_wallets (userId, assetCode, availableAmount, lockedAmount, pendingAmount)
SELECT 0, 'EUR', '0', '0', '0' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM v5_wallets WHERE userId=0 AND assetCode='EUR');
INSERT INTO v5_wallets (userId, assetCode, availableAmount, lockedAmount, pendingAmount)
SELECT 0, 'GBP', '0', '0', '0' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM v5_wallets WHERE userId=0 AND assetCode='GBP');
INSERT INTO v5_wallets (userId, assetCode, availableAmount, lockedAmount, pendingAmount)
SELECT 0, 'BTC', '0', '0', '0' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM v5_wallets WHERE userId=0 AND assetCode='BTC');
INSERT INTO v5_wallets (userId, assetCode, availableAmount, lockedAmount, pendingAmount)
SELECT 0, 'ETH', '0', '0', '0' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM v5_wallets WHERE userId=0 AND assetCode='ETH');
INSERT INTO v5_wallets (userId, assetCode, availableAmount, lockedAmount, pendingAmount)
SELECT 0, 'USDT', '0', '0', '0' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM v5_wallets WHERE userId=0 AND assetCode='USDT');
-- ===== END drizzle/0036_crypto_mining_portal.sql =====

-- ===== BEGIN drizzle/0037_coinki_token_configuration.sql =====
ALTER TABLE mining_economics_versions
  ADD COLUMN IF NOT EXISTS tokenName VARCHAR(64) NOT NULL DEFAULT 'CoinKi',
  ADD COLUMN IF NOT EXISTS tokenSymbol VARCHAR(16) NOT NULL DEFAULT 'CKI';

CREATE TABLE IF NOT EXISTS mining_schema_migrations (
  migrationKey VARCHAR(120) NOT NULL PRIMARY KEY,
  detailsJson LONGTEXT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
-- ===== END drizzle/0037_coinki_token_configuration.sql =====

-- ===== BEGIN drizzle/0038_mining_admin_package_grants.sql =====
-- A zero-charge admin grant is an entitlement, not a wallet transaction.
-- Preserve the package's listed price for reference, but allow no payment ledger link.
ALTER TABLE mining_customer_packages
  MODIFY COLUMN ledgerTransactionId INT NULL;

SET @has_acquisition_type = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'mining_customer_packages'
    AND column_name = 'acquisitionType'
);
SET @add_acquisition_type = IF(
  @has_acquisition_type = 0,
  'ALTER TABLE mining_customer_packages ADD COLUMN acquisitionType ENUM(''purchase'',''admin_grant'') NOT NULL DEFAULT ''purchase'' AFTER packageVersionId',
  'SELECT 1'
);
PREPARE mining_grant_schema_stmt FROM @add_acquisition_type;
EXECUTE mining_grant_schema_stmt;
DEALLOCATE PREPARE mining_grant_schema_stmt;
-- ===== END drizzle/0038_mining_admin_package_grants.sql =====

-- ===== BEGIN drizzle/0039_mining_database_driven_packages.sql =====
ALTER TABLE mining_economics_versions
  ADD COLUMN IF NOT EXISTS defaultContractDurationMonths INT NOT NULL DEFAULT 24 AFTER tokenSymbol;

ALTER TABLE mining_packages
  ADD COLUMN IF NOT EXISTS displayOrder INT NOT NULL DEFAULT 0 AFTER name;

ALTER TABLE mining_package_versions
  ADD COLUMN IF NOT EXISTS displayName VARCHAR(120) NULL AFTER version,
  ADD COLUMN IF NOT EXISTS durationMonths INT NULL AFTER expirySeconds;

ALTER TABLE mining_customer_packages
  ADD COLUMN IF NOT EXISTS packageNameSnapshot VARCHAR(120) NULL AFTER packageId,
  ADD COLUMN IF NOT EXISTS durationMonthsSnapshot INT NULL AFTER status;

UPDATE mining_package_versions v
JOIN mining_packages p ON p.id = v.packageId
SET v.displayName = p.name
WHERE v.displayName IS NULL;

UPDATE mining_customer_packages cp
JOIN mining_packages p ON p.id = cp.packageId
JOIN mining_package_versions v ON v.id = cp.packageVersionId
SET cp.packageNameSnapshot = COALESCE(v.displayName, p.name)
WHERE cp.packageNameSnapshot IS NULL;

UPDATE mining_customer_packages cp
JOIN mining_package_versions v ON v.id = cp.packageVersionId
SET cp.durationMonthsSnapshot = COALESCE(v.durationMonths, ROUND(v.expirySeconds / 2629800))
WHERE cp.durationMonthsSnapshot IS NULL AND (v.durationMonths IS NOT NULL OR v.expirySeconds IS NOT NULL);
-- ===== END drizzle/0039_mining_database_driven_packages.sql =====

-- ===== BEGIN drizzle/0040_mining_package_daily_rewards.sql =====
ALTER TABLE mining_economics_versions
  ADD COLUMN IF NOT EXISTS calculationModel VARCHAR(32) NOT NULL DEFAULT 'package_daily' AFTER defaultContractDurationMonths,
  ADD COLUMN IF NOT EXISTS difficultyBaselineThs DECIMAL(30,12) NOT NULL DEFAULT 100 AFTER calculationModel;

ALTER TABLE mining_package_versions
  ADD COLUMN IF NOT EXISTS expectedDailyRewardCki DECIMAL(36,18) NULL AFTER durationMonths;

ALTER TABLE mining_customer_packages
  ADD COLUMN IF NOT EXISTS expectedDailyRewardCkiSnapshot DECIMAL(36,18) NULL AFTER durationMonthsSnapshot;

ALTER TABLE mining_boost_activations
  ADD COLUMN IF NOT EXISTS customerPackageId INT NULL AFTER packageVersionId;

ALTER TABLE mining_reward_events
  ADD COLUMN IF NOT EXISTS expectedDailyRewardCki DECIMAL(36,18) NULL AFTER rewardTokensPerThsHour,
  ADD COLUMN IF NOT EXISTS rewardAmountUsd DECIMAL(36,18) NOT NULL DEFAULT 0 AFTER tokenAmount,
  ADD COLUMN IF NOT EXISTS calculationModel VARCHAR(32) NOT NULL DEFAULT 'package_daily' AFTER configVersion;

CREATE TABLE IF NOT EXISTS mining_reward_package_allocations (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rewardEventId INT NOT NULL,
  userId INT NOT NULL,
  customerPackageId INT NOT NULL,
  packageId INT NOT NULL,
  packageVersionId INT NOT NULL,
  intervalStart DATETIME(3) NOT NULL,
  intervalEnd DATETIME(3) NOT NULL,
  expectedDailyRewardCkiSnapshot DECIMAL(36,18) NULL,
  rewardAmountCki DECIMAL(36,18) NOT NULL,
  tokenUnitsPerUsdSnapshot DECIMAL(36,18) NOT NULL,
  rewardAmountUsdSnapshot DECIMAL(36,18) NOT NULL,
  calculationModel VARCHAR(32) NOT NULL,
  calculationSegmentsJson LONGTEXT NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_mining_reward_allocation_event_package (rewardEventId,customerPackageId),
  UNIQUE KEY uq_mining_reward_allocation_contract_interval (userId,customerPackageId,intervalStart,intervalEnd),
  INDEX idx_mining_reward_allocation_contract (customerPackageId,intervalEnd),
  INDEX idx_mining_reward_allocation_package (packageId,packageVersionId,intervalEnd)
) ENGINE=InnoDB;
-- ===== END drizzle/0040_mining_package_daily_rewards.sql =====

-- ===== BEGIN drizzle/0041_mining_purchase_claims_and_boost_cooldown.sql =====
CREATE TABLE IF NOT EXISTS mining_package_purchase_claims (
  userId INT NOT NULL,
  packageId INT NOT NULL,
  firstPurchaseId INT NULL,
  firstQuoteId INT NULL,
  claimedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (userId,packageId),
  UNIQUE KEY uq_mining_package_claim_purchase (firstPurchaseId),
  UNIQUE KEY uq_mining_package_claim_quote (firstQuoteId),
  INDEX idx_mining_package_claim_package (packageId,claimedAt)
) ENGINE=InnoDB;

INSERT IGNORE INTO mining_package_purchase_claims
  (userId,packageId,firstPurchaseId,firstQuoteId,claimedAt)
SELECT cp.userId,cp.packageId,cp.id,cp.quoteId,COALESCE(cp.purchasedAt,UTC_TIMESTAMP(3))
FROM mining_customer_packages cp
JOIN mining_ledger_transactions tx ON tx.id=cp.ledgerTransactionId
WHERE tx.transactionType='package_purchase' AND cp.quoteId IS NOT NULL;
-- ===== END drizzle/0041_mining_purchase_claims_and_boost_cooldown.sql =====

-- Fresh-database counterpart to the wallet index check in scripts/apply-mining-migrations.mjs.
-- Safe for this bundle because it is intended only for a new, empty application database.
ALTER TABLE customer_balances ADD UNIQUE INDEX uq_customer_balance_user_currency (userId,currency);

-- ===== BEGIN drizzle/0042_mining_independent_package_purchases.sql =====
ALTER TABLE mining_economics_versions
  ADD COLUMN IF NOT EXISTS packagePurchasesEnabled TINYINT(1) NOT NULL DEFAULT 0 AFTER globalEnabled;
-- ===== END drizzle/0042_mining_independent_package_purchases.sql =====

-- ===== BEGIN drizzle/0043_wallet_minor_units_bigint.sql =====
-- Currency minor-unit values can exceed the signed 32-bit INT range (for example, 10,000 USDT at scale 6).
-- Widen storage without changing existing values, defaults, signedness, or nullability.
ALTER TABLE customer_balances
  MODIFY COLUMN availableMinor BIGINT NOT NULL DEFAULT 0,
  MODIFY COLUMN lockedMinor BIGINT NOT NULL DEFAULT 0,
  MODIFY COLUMN promotionalMinor BIGINT NOT NULL DEFAULT 0,
  MODIFY COLUMN earnedMinor BIGINT NOT NULL DEFAULT 0;

ALTER TABLE balance_ledger
  MODIFY COLUMN amountMinor BIGINT NOT NULL;

ALTER TABLE customer_controls
  MODIFY COLUMN autoTradeAmountMinor BIGINT NOT NULL DEFAULT 10000,
  MODIFY COLUMN dailyTradeLimitMinor BIGINT NOT NULL DEFAULT 2500000;

ALTER TABLE customer_opportunity_rules
  MODIFY COLUMN maxDailyAllocationMinor BIGINT NOT NULL DEFAULT 100000;

ALTER TABLE kyc_stage_requirements
  MODIFY COLUMN transactionLimitMinor BIGINT NULL;

ALTER TABLE missed_opportunities
  MODIFY COLUMN amountMinor BIGINT NOT NULL,
  MODIFY COLUMN potentialRewardMinor BIGINT NOT NULL;

ALTER TABLE opportunity_offers
  MODIFY COLUMN minimumMinor BIGINT NOT NULL;

ALTER TABLE opportunity_popup_events
  MODIFY COLUMN minimumMinor BIGINT NOT NULL,
  MODIFY COLUMN balanceAvailableMinor BIGINT NOT NULL DEFAULT 0;

ALTER TABLE stake_events
  MODIFY COLUMN amountMinor BIGINT NOT NULL DEFAULT 0;

ALTER TABLE stake_positions
  MODIFY COLUMN principalMinor BIGINT NOT NULL,
  MODIFY COLUMN rewardMinor BIGINT NOT NULL DEFAULT 0;

ALTER TABLE stake_products
  MODIFY COLUMN minMinor BIGINT NOT NULL,
  MODIFY COLUMN maxMinor BIGINT NOT NULL;

ALTER TABLE stake_rewards
  MODIFY COLUMN amountMinor BIGINT NOT NULL;

ALTER TABLE stake_transactions
  MODIFY COLUMN amountMinor BIGINT NOT NULL;

ALTER TABLE trade_positions
  MODIFY COLUMN principalMinor BIGINT NOT NULL,
  MODIFY COLUMN expectedRewardMinor BIGINT NOT NULL;

ALTER TABLE transaction_console_events
  MODIFY COLUMN amountMinor BIGINT NULL;
-- ===== END drizzle/0043_wallet_minor_units_bigint.sql =====

-- ===== BEGIN drizzle/0044_mining_boost_capacity_cycle.sql =====
-- Boost policy: 20% of the customer's active purchased TH/s, active for 120 seconds,
-- followed by a 600-second cooldown. The application applies the 20% formula.
-- Preserve immutable historical economics versions; append one effective version.
INSERT INTO mining_economics_versions
  (version,effectiveAt,globalEnabled,packagePurchasesEnabled,boostsEnabled,tokenName,tokenSymbol,
   defaultContractDurationMonths,calculationModel,difficultyBaselineThs,tokenUnitsPerUsd,rewardTokensPerThsHour,
   swapFeeBps,purchaseFeeBps,minSwapTokens,maxSwapTokens,defaultAutoConversionThreshold,
   boostCycleSeconds,boostDurationSeconds,quoteTtlSeconds,fiatMaxAgeSeconds,cryptoMaxAgeSeconds,
   maxRateDeviationBps,dailyRewardCapTokens,dualApprovalThresholdUsd,updatedBy,reason)
SELECT
  (SELECT COALESCE(MAX(version),0)+1 FROM mining_economics_versions), UTC_TIMESTAMP(3),
  e.globalEnabled,e.packagePurchasesEnabled,1,e.tokenName,e.tokenSymbol,
  e.defaultContractDurationMonths,e.calculationModel,e.difficultyBaselineThs,
  e.tokenUnitsPerUsd,e.rewardTokensPerThsHour,e.swapFeeBps,e.purchaseFeeBps,
  e.minSwapTokens,e.maxSwapTokens,e.defaultAutoConversionThreshold,
  600,120,e.quoteTtlSeconds,e.fiatMaxAgeSeconds,e.cryptoMaxAgeSeconds,
  e.maxRateDeviationBps,e.dailyRewardCapTokens,e.dualApprovalThresholdUsd,
  NULL,'Set Mining boost to +20% of active purchased TH/s for 120 seconds, then a 600-second cooldown after the boost expires.'
FROM mining_economics_versions AS e
WHERE e.effectiveAt<=UTC_TIMESTAMP(3)
  AND NOT EXISTS (
    SELECT 1 FROM mining_schema_migrations
    WHERE migrationKey='0044_mining_boost_capacity_cycle'
  )
ORDER BY e.version DESC
LIMIT 1;

INSERT IGNORE INTO mining_schema_migrations (migrationKey,detailsJson)
VALUES ('0044_mining_boost_capacity_cycle','{"boostPercent":20,"boostDurationSeconds":120,"cooldownSecondsAfterExpiry":600}');
-- ===== END drizzle/0044_mining_boost_capacity_cycle.sql =====

-- ===== BEGIN drizzle/0045_cki_reward_schedule_activation.sql =====
-- CoinKi formula-based package rewards. No external mining-pool settlement is used.
-- Per UTC reward day, each package is capped at its configured daily CKI limit:
-- daily_limit_CKI * eligible_active_seconds / 86,400.
-- Boost hash changes capacity only; it does not raise the package reward limit.

START TRANSACTION;

SET @mining_reward_terms = 'This package is a formula-based CoinKi (CKI) reward entitlement. Its published CKI amount is the maximum for a full 24-hour UTC reward day; accrual is calculated as daily maximum × eligible active seconds ÷ 86,400 and is capped per purchased package per UTC day. CKI is credited to the internal database-backed CKI balance and may be converted through the internal swap feature under its current terms. This formula is not measured or verified against a third-party mining pool and is not a guaranteed return. The calculation is simulated from package terms; CKI is not directly withdrawable and there is no cash payout.';

-- Preserve existing economics and append one effective version with formula rewards enabled.
INSERT INTO mining_economics_versions
  (version,effectiveAt,globalEnabled,packagePurchasesEnabled,boostsEnabled,tokenName,tokenSymbol,
   defaultContractDurationMonths,calculationModel,difficultyBaselineThs,tokenUnitsPerUsd,rewardTokensPerThsHour,
   swapFeeBps,purchaseFeeBps,minSwapTokens,maxSwapTokens,defaultAutoConversionThreshold,
   boostCycleSeconds,boostDurationSeconds,quoteTtlSeconds,fiatMaxAgeSeconds,cryptoMaxAgeSeconds,
   maxRateDeviationBps,dailyRewardCapTokens,dualApprovalThresholdUsd,updatedBy,reason)
SELECT
  (SELECT COALESCE(MAX(version),0)+1 FROM mining_economics_versions),UTC_TIMESTAMP(3),1,1,1,
  e.tokenName,e.tokenSymbol,24,'package_daily',e.difficultyBaselineThs,e.tokenUnitsPerUsd,e.rewardTokensPerThsHour,
  e.swapFeeBps,e.purchaseFeeBps,e.minSwapTokens,e.maxSwapTokens,e.defaultAutoConversionThreshold,
  600,120,e.quoteTtlSeconds,e.fiatMaxAgeSeconds,e.cryptoMaxAgeSeconds,e.maxRateDeviationBps,0,
  e.dualApprovalThresholdUsd,NULL,
  'Enable internal CKI formula rewards; per-package daily maximum prorated by eligible active seconds/86,400, capped per package and UTC day. Boosts do not increase reward limits.'
FROM mining_economics_versions AS e
WHERE e.effectiveAt<=UTC_TIMESTAMP(3)
  AND NOT EXISTS (SELECT 1 FROM mining_schema_migrations WHERE migrationKey='0045_cki_reward_schedule_activation')
ORDER BY e.version DESC
LIMIT 1;

-- Ensure the six established catalogue entries exist. Existing identifiers are preserved.
INSERT INTO mining_packages (code,name,displayOrder,status)
VALUES
  ('CKI_GENESIS','CKI Genesis',1,'draft'),
  ('CKI_VELOCITY','CKI Velocity',2,'draft'),
  ('CKI_QUANTUM','CKI Quantum',3,'draft'),
  ('CKI_TITAN','CKI Titan',4,'draft'),
  ('CKI_INFINITY','CKI Infinity',5,'draft'),
  ('CKI_SINGULARITY','CKI Singularity',6,'draft')
ON DUPLICATE KEY UPDATE code=VALUES(code);

-- Publish a new version only when the current published version does not match the supplied settings.
INSERT INTO mining_package_versions
  (packageId,version,displayName,versionStatus,priceAmount,priceAsset,baseThs,boostBonusThs,
   boostDurationSeconds,maxPerCustomer,stackingPolicy,expirySeconds,durationMonths,expectedDailyRewardCki,
   termsText,simulationAcknowledgementRequired,effectiveAt,createdBy)
SELECT p.id,
  (SELECT COALESCE(MAX(v2.version),0)+1 FROM mining_package_versions v2 WHERE v2.packageId=p.id),
  s.displayName,'published',s.priceAmount,'USD',s.baseThs,0,120,
  COALESCE(currentVersion.maxPerCustomer,1),COALESCE(currentVersion.stackingPolicy,'replace'),NULL,24,s.dailyLimit,
  @mining_reward_terms,1,UTC_TIMESTAMP(3),NULL
FROM (
  SELECT 'CKI_GENESIS' code,'CKI Genesis' displayName,100.00 priceAmount,1.000000000000 baseThs,0.100000000000000000 dailyLimit
  UNION ALL SELECT 'CKI_VELOCITY','CKI Velocity',300.00,3.000000000000,0.300000000000000000
  UNION ALL SELECT 'CKI_QUANTUM','CKI Quantum',600.00,7.000000000000,0.700000000000000000
  UNION ALL SELECT 'CKI_TITAN','CKI Titan',1200.00,16.000000000000,1.600000000000000000
  UNION ALL SELECT 'CKI_INFINITY','CKI Infinity',2500.00,40.000000000000,4.000000000000000000
  UNION ALL SELECT 'CKI_SINGULARITY','CKI Singularity',5000.00,80.000000000000,8.000000000000000000
) AS s
JOIN mining_packages AS p ON p.code=s.code
LEFT JOIN mining_package_versions AS currentVersion ON currentVersion.id=p.currentVersionId
WHERE NOT EXISTS (SELECT 1 FROM mining_schema_migrations WHERE migrationKey='0045_cki_reward_schedule_activation')
  AND (
    currentVersion.id IS NULL OR currentVersion.versionStatus<>'published' OR NOT (
      currentVersion.displayName <=> s.displayName
      AND currentVersion.priceAmount <=> s.priceAmount
      AND currentVersion.priceAsset <=> 'USD'
      AND currentVersion.baseThs <=> s.baseThs
      AND currentVersion.durationMonths <=> 24
      AND currentVersion.expectedDailyRewardCki <=> s.dailyLimit
      AND currentVersion.boostBonusThs <=> 0
      AND currentVersion.boostDurationSeconds <=> 120
      AND currentVersion.termsText <=> @mining_reward_terms
      AND currentVersion.simulationAcknowledgementRequired=1
    )
  );

-- Make the six configured offers available for purchase with their published versions.
UPDATE mining_packages AS p
JOIN (
  SELECT 'CKI_GENESIS' code,'CKI Genesis' displayName,1 displayOrder
  UNION ALL SELECT 'CKI_VELOCITY','CKI Velocity',2
  UNION ALL SELECT 'CKI_QUANTUM','CKI Quantum',3
  UNION ALL SELECT 'CKI_TITAN','CKI Titan',4
  UNION ALL SELECT 'CKI_INFINITY','CKI Infinity',5
  UNION ALL SELECT 'CKI_SINGULARITY','CKI Singularity',6
) AS s ON s.code=p.code
JOIN (
  SELECT packageId,MAX(version) version FROM mining_package_versions
  WHERE versionStatus='published' GROUP BY packageId
) AS latest ON latest.packageId=p.id
JOIN mining_package_versions AS v ON v.packageId=latest.packageId AND v.version=latest.version
SET p.name=s.displayName,p.displayOrder=s.displayOrder,p.status='published',p.currentVersionId=v.id,p.updatedAt=UTC_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM mining_schema_migrations WHERE migrationKey='0045_cki_reward_schedule_activation');

-- Existing active entitlements with an unset daily snapshot inherit the schedule supplied by the user.
-- Existing non-null snapshots and all historic reward ledger rows are preserved.
UPDATE mining_customer_packages AS cp
JOIN mining_packages AS p ON p.id=cp.packageId
JOIN (
  SELECT 'CKI_GENESIS' code,0.100000000000000000 dailyLimit
  UNION ALL SELECT 'CKI_VELOCITY',0.300000000000000000
  UNION ALL SELECT 'CKI_QUANTUM',0.700000000000000000
  UNION ALL SELECT 'CKI_TITAN',1.600000000000000000
  UNION ALL SELECT 'CKI_INFINITY',4.000000000000000000
  UNION ALL SELECT 'CKI_SINGULARITY',8.000000000000000000
) AS s ON s.code=p.code
SET cp.expectedDailyRewardCkiSnapshot=s.dailyLimit
WHERE NOT EXISTS (SELECT 1 FROM mining_schema_migrations WHERE migrationKey='0045_cki_reward_schedule_activation')
  AND cp.expectedDailyRewardCkiSnapshot IS NULL
  AND cp.status IN ('active','replaced')
  AND cp.startsAt<=UTC_TIMESTAMP(3)
  AND (cp.expiresAt IS NULL OR cp.expiresAt>UTC_TIMESTAMP(3))
  AND (cp.endedAt IS NULL OR cp.endedAt>UTC_TIMESTAMP(3));

-- Audit the enabled economics version and record the migration for safe re-imports.
INSERT INTO v5_audit_events (actorUserId,action,entityType,entityId,reason,reference,metadataJson)
SELECT NULL,'mining.economics.version.created','mining_economics_version',CAST(e.version AS CHAR),e.reason,
  '0045_cki_reward_schedule_activation',
  JSON_OBJECT('version',e.version,'globalEnabled',true,'packagePurchasesEnabled',true,'calculationModel','package_daily',
    'formula','dailyLimitCki * eligibleActiveSeconds / 86400 UTC seconds','dailyRewardCapTokens','0',
    'boostPercent',20,'boostDurationSeconds',120,'cooldownSecondsAfterExpiry',600,
    'packages',JSON_ARRAY('CKI_GENESIS','CKI_VELOCITY','CKI_QUANTUM','CKI_TITAN','CKI_INFINITY','CKI_SINGULARITY'))
FROM mining_economics_versions e
WHERE e.reason='Enable internal CKI formula rewards; per-package daily maximum prorated by eligible active seconds/86,400, capped per package and UTC day. Boosts do not increase reward limits.'
  AND NOT EXISTS (SELECT 1 FROM mining_schema_migrations WHERE migrationKey='0045_cki_reward_schedule_activation')
ORDER BY e.version DESC LIMIT 1;

INSERT IGNORE INTO mining_schema_migrations (migrationKey,detailsJson)
VALUES ('0045_cki_reward_schedule_activation',
  '{"formula":"dailyLimitCki * eligibleActiveSeconds / 86400 UTC seconds","rewardDay":"UTC","globalEnabled":true,"packagePurchasesEnabled":true,"boostPercent":20,"boostDurationSeconds":120,"cooldownSecondsAfterExpiry":600,"boostRaisesDailyRewardCap":false,"packages":[{"code":"CKI_GENESIS","priceUSD":"100.00","baseTHs":"1","dailyLimitCKI":"0.10"},{"code":"CKI_VELOCITY","priceUSD":"300.00","baseTHs":"3","dailyLimitCKI":"0.30"},{"code":"CKI_QUANTUM","priceUSD":"600.00","baseTHs":"7","dailyLimitCKI":"0.70"},{"code":"CKI_TITAN","priceUSD":"1200.00","baseTHs":"16","dailyLimitCKI":"1.60"},{"code":"CKI_INFINITY","priceUSD":"2500.00","baseTHs":"40","dailyLimitCKI":"4.00"},{"code":"CKI_SINGULARITY","priceUSD":"5000.00","baseTHs":"80","dailyLimitCKI":"8.00"}]}');

COMMIT;
-- ===== END drizzle/0045_cki_reward_schedule_activation.sql =====

