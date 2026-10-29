-- Forward-only, restart-safe Trading policy additions.
-- The main Drizzle journal historically skipped legacy migration 0051. Reconcile
-- its package-policy columns here so standard installer/migration paths can run
-- the current Trading service without relying on a separate portal migration pass.
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

-- The migration stores administrator policy bounds and immutable per-trade selections.
ALTER TABLE `opportunity_package_policies`
  ADD COLUMN IF NOT EXISTS `maximumRewardBps` INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `minimumTradeDurationSeconds` INT NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS `maximumTradeDurationSeconds` INT NOT NULL DEFAULT 3600,
  ADD COLUMN IF NOT EXISTS `packageBadgeLabel` VARCHAR(48) NULL;

ALTER TABLE `opportunity_popup_events`
  ADD COLUMN IF NOT EXISTS `configuredProfitRateBps` INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `configuredDurationSeconds` INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `configuredPopupDisplaySeconds` INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `packagePolicyVersionSnapshot` INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `packageBadgeLabel` VARCHAR(48) NULL,
  ADD COLUMN IF NOT EXISTS `companyReferenceId` VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS `companyDisplayName` VARCHAR(240) NULL,
  ADD COLUMN IF NOT EXISTS `companyLogoUrl` VARCHAR(512) NULL,
  ADD COLUMN IF NOT EXISTS `companyReferenceOnly` TINYINT(1) NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS `trading_company_rotation_state` (
  `userId` INT NOT NULL PRIMARY KEY,
  `nextCatalogueOffset` INT NOT NULL DEFAULT 0,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `trade_positions`
  ADD COLUMN IF NOT EXISTS `configuredProfitRateBps` INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `configuredDurationSeconds` INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `packagePolicyVersionSnapshot` INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `companyReferenceId` VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS `companyDisplayName` VARCHAR(240) NULL,
  ADD COLUMN IF NOT EXISTS `companyLogoUrl` VARCHAR(512) NULL,
  ADD COLUMN IF NOT EXISTS `companyReferenceOnly` TINYINT(1) NOT NULL DEFAULT 1;
