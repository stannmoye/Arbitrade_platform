-- Reconcile Trading settlement schema drift left by legacy settlement migrations
-- that are not part of the canonical main migration journal.
-- Forward-only and idempotent: existing financial records and outcomes are not rewritten.
ALTER TABLE `trade_positions`
  ADD COLUMN IF NOT EXISTS `packageSubscriptionId` int NULL,
  ADD COLUMN IF NOT EXISTS `creditAt` timestamp NULL,
  ADD COLUMN IF NOT EXISTS `lifecycleStage` varchar(48) NOT NULL DEFAULT 'Trade Allocated',
  ADD COLUMN IF NOT EXISTS `settlementStatus` varchar(32) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS `rewardReservedMinor` bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `rewardCreditedMinor` bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `walletUpdatedAt` timestamp NULL,
  ADD COLUMN IF NOT EXISTS `completionAt` timestamp NULL,
  ADD COLUMN IF NOT EXISTS `transactionReference` varchar(120) NULL,
  ADD COLUMN IF NOT EXISTS `policyVersion` int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `settlementReference` varchar(160) NULL,
  ADD COLUMN IF NOT EXISTS `settlementConfirmedAt` timestamp NULL,
  ADD COLUMN IF NOT EXISTS `settlementConfirmedBy` int NULL,
  ADD COLUMN IF NOT EXISTS `settlementNotes` varchar(2000) NULL,
  ADD COLUMN IF NOT EXISTS `realizedGrossProfitMinor` bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `platformFeeMinor` bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `netProfitMinor` bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `feePolicyVersion` int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `platformFeeRateBps` int NOT NULL DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS `platformFeeRoundingMode` varchar(20) NOT NULL DEFAULT 'half_up',
  ADD COLUMN IF NOT EXISTS `settlementOutcome` varchar(32) NOT NULL DEFAULT 'legacy_unrecorded';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `trade_lifecycle_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tradeId` int NOT NULL,
  `userId` int NOT NULL,
  `eventType` varchar(48) NOT NULL,
  `stage` varchar(64) NOT NULL,
  `payloadJson` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `trade_lifecycle_event_unique` (`tradeId`, `eventType`),
  KEY `trade_lifecycle_trade_idx` (`tradeId`, `createdAt`),
  KEY `trade_lifecycle_user_idx` (`userId`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `trade_reward_reservations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `tradeId` int NOT NULL,
  `packageName` varchar(40) NOT NULL,
  `windowKey` varchar(40) NOT NULL,
  `currency` varchar(12) NOT NULL,
  `reservedMinor` bigint NOT NULL,
  `status` enum('reserved','credited','released') NOT NULL DEFAULT 'reserved',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `trade_reward_reservation_trade_unique` (`tradeId`),
  KEY `trade_reward_reservation_user_window_idx` (`userId`, `windowKey`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `trade_settlement_reference_claims` (
  `settlementReference` varchar(160) NOT NULL,
  `tradeId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`settlementReference`),
  UNIQUE KEY `trade_settlement_reference_claim_trade_unique` (`tradeId`),
  KEY `trade_settlement_reference_claim_created_idx` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `trade_positions_status_settlement_user_currency_idx`
  ON `trade_positions` (`status`, `settlementStatus`, `userId`, `currency`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `trade_positions_settlement_reference_idx`
  ON `trade_positions` (`settlementReference`);
