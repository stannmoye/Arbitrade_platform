-- Advanced automatic trading: package-scoped policy, durable scheduling and reward accounting.
-- Additive and backward-compatible. Existing trades and ledger rows are preserved.
ALTER TABLE `opportunity_package_policies`
  ADD COLUMN IF NOT EXISTS `automaticDelivery` tinyint(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `dailyPopupTarget` int NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS `schedulingPeriod` enum('rolling_24h','calendar_day') NOT NULL DEFAULT 'rolling_24h',
  ADD COLUMN IF NOT EXISTS `minIntervalSeconds` int NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS `maxIntervalSeconds` int NOT NULL DEFAULT 3600,
  ADD COLUMN IF NOT EXISTS `randomizationEnabled` tinyint(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `popupDisplayTargetSeconds` int NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS `completionDisplaySeconds` int NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS `postCompletionIntervalSeconds` int NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS `maxPendingDeliveries` int NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS `deliveryRetryPolicy` enum('none','temporary') NOT NULL DEFAULT 'temporary',
  ADD COLUMN IF NOT EXISTS `maxDeliveryAttempts` int NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS `expiryHandling` enum('expire','retry') NOT NULL DEFAULT 'expire',
  ADD COLUMN IF NOT EXISTS `duplicatePrevention` tinyint(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `audioEnabled` tinyint(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `audioSound` varchar(80) NOT NULL DEFAULT 'soft-chime',
  ADD COLUMN IF NOT EXISTS `automaticTradingEnabled` tinyint(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `maxTradeAttemptsPerDay` int NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS `maxSuccessfulTradesPerDay` int NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS `maxConcurrentActiveTrades` int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `requirePreviousSettlement` tinyint(1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `minSettlementDelaySeconds` int NOT NULL DEFAULT 900,
  ADD COLUMN IF NOT EXISTS `maxSettlementDelaySeconds` int NOT NULL DEFAULT 900,
  ADD COLUMN IF NOT EXISTS `minimumRewardBps` int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `allowedOpportunityTypes` text NULL,
  ADD COLUMN IF NOT EXISTS `maxDailyRewardMinor` bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `rewardLimitCurrency` varchar(12) NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS `dailyRewardWindow` enum('rolling_24h','calendar_day') NOT NULL DEFAULT 'calendar_day',
  ADD COLUMN IF NOT EXISTS `maxRewardPerTradeMinor` bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `unsettledRewardPolicy` enum('reserve','ignore') NOT NULL DEFAULT 'reserve',
  ADD COLUMN IF NOT EXISTS `capReachedPolicy` enum('stop_new_trades','allow_principal_only') NOT NULL DEFAULT 'stop_new_trades',
  ADD COLUMN IF NOT EXISTS `settlementConfirmationState` enum('ledger_and_wallet','ledger_only') NOT NULL DEFAULT 'ledger_and_wallet',
  ADD COLUMN IF NOT EXISTS `settlementRetryPolicy` enum('temporary','manual') NOT NULL DEFAULT 'temporary',
  ADD COLUMN IF NOT EXISTS `maxSettlementAttempts` int NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS `closePolicy` enum('after_completion','after_final_display') NOT NULL DEFAULT 'after_final_display',
  ADD COLUMN IF NOT EXISTS `policyVersion` int NOT NULL DEFAULT 1;

ALTER TABLE `trade_positions`
  ADD COLUMN IF NOT EXISTS `lifecycleStage` varchar(48) NOT NULL DEFAULT 'Trade Allocated',
  ADD COLUMN IF NOT EXISTS `settlementStatus` varchar(32) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS `rewardReservedMinor` bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `rewardCreditedMinor` bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `walletUpdatedAt` timestamp NULL,
  ADD COLUMN IF NOT EXISTS `completionAt` timestamp NULL,
  ADD COLUMN IF NOT EXISTS `transactionReference` varchar(120) NULL,
  ADD COLUMN IF NOT EXISTS `policyVersion` int NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS `trade_reward_reservations` (
  `id` int AUTO_INCREMENT NOT NULL,
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
  KEY `trade_reward_reservation_user_window_idx` (`userId`,`windowKey`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `opportunity_schedule_decisions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `packageName` varchar(40) NOT NULL,
  `windowKey` varchar(40) NOT NULL,
  `targetCount` int NOT NULL,
  `actualCount` int NOT NULL DEFAULT 0,
  `nextEligibleAt` timestamp NULL,
  `decision` varchar(48) NOT NULL,
  `reason` varchar(255) NOT NULL,
  `policyVersion` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `schedule_decision_user_package_idx` (`userId`,`packageName`,`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Preserve the previous global settings for rollback/audit, but make package policy authoritative.
INSERT INTO `app_settings` (`settingKey`,`settingValue`)
VALUES ('advancedAutoTrading.migration','0051-package-policy-authoritative')
ON DUPLICATE KEY UPDATE `settingValue`=`settingValue`;
