-- Trading policy reconciliation: old runtime/schema defaults are not proof that an administrator reviewed a tier.
-- Preserve package identities, subscription history, trades, popup history, wallet ledgers and numeric policy snapshots.
-- Pause existing tiers until an authorized administrator reviews/saves each policy and explicitly re-enables the tier.
ALTER TABLE `packages` ALTER COLUMN `enabled` SET DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `packages` ALTER COLUMN `minimumQualifyingBalanceUsdMinor` DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE `packages` ALTER COLUMN `durationMonths` DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE `packages` ALTER COLUMN `opportunitiesPerDay` DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE `packages` ALTER COLUMN `termsVersion` DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE `packages` ALTER COLUMN `maxPopupsPerDay` DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE `packages` ALTER COLUMN `maxActiveInvestments` DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE `trade_positions` ALTER COLUMN `profitRateBps` DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE `trade_positions` ALTER COLUMN `tradeDurationSeconds` DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE `trade_positions` ALTER COLUMN `feePolicyVersion` DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE `trade_positions` ALTER COLUMN `platformFeeRateBps` DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE `trade_positions` ALTER COLUMN `platformFeeRoundingMode` DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE `trade_positions` ALTER COLUMN `policyVersion` DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE `opportunity_package_policies` ALTER COLUMN `enabled` SET DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `opportunity_package_policies` ALTER COLUMN `automaticDelivery` SET DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `opportunity_package_policies` ALTER COLUMN `automaticTradingEnabled` SET DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `opportunity_package_policies` ALTER COLUMN `policyVersion` SET DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `opportunity_popup_events` ALTER COLUMN `tradeDurationSeconds` DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE `opportunity_delivery_events` ALTER COLUMN `policyVersion` DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE `opportunity_popup_events` ALTER COLUMN `policyVersion` DROP DEFAULT;
--> statement-breakpoint
UPDATE `opportunity_popup_events`
SET `eventStatus`='WITHDRAWN',`deliveryStatus`='expired',`withdrawnAt`=COALESCE(`withdrawnAt`,CURRENT_TIMESTAMP),`updatedAt`=CURRENT_TIMESTAMP
WHERE `eventStatus` NOT IN ('TRADED','SETTLED','WITHDRAWN');
--> statement-breakpoint
UPDATE `opportunity_delivery_events`
SET `status`='expired',`lastErrorCode`='POLICY_RECONCILIATION_REQUIRED'
WHERE `status` IN ('pending','delivered');
--> statement-breakpoint
UPDATE `packages` SET `enabled`=0;
--> statement-breakpoint
UPDATE `opportunity_package_policies`
SET `enabled`=0,`automaticDelivery`=0,`automaticTradingEnabled`=0,`policyVersion`=0;
--> statement-breakpoint
INSERT INTO `opportunity_package_policies` (`packageName`,`enabled`,`automaticDelivery`,`automaticTradingEnabled`,`policyVersion`)
SELECT p.`name`,0,0,0,0
FROM `packages` p
LEFT JOIN `opportunity_package_policies` opp ON opp.`packageName`=p.`name`
WHERE opp.`id` IS NULL;
--> statement-breakpoint
-- Clear prior schema/runtime example values. Version zero and disabled flags make these rows inert until an administrator fills and saves the policy.
UPDATE `opportunity_package_policies` SET
  `maxPopupsPerDay`=0,`maxVisibleOffers`=0,`minimumTradeUnits`=0,`maximumTradeUnits`=0,
  `minHourlyTarget`=0,`normalHourlyTarget`=0,`marketInfluenceBps`=0,`burstEnabled`=0,`maxBurstSize`=0,
  `dailyPopupTarget`=0,`minIntervalSeconds`=0,`maxIntervalSeconds`=0,`randomizationEnabled`=0,
  `popupDisplayTargetSeconds`=0,`completionDisplaySeconds`=0,`postCompletionIntervalSeconds`=0,
  `maxPendingDeliveries`=0,`deliveryRetryPolicy`='none',`maxDeliveryAttempts`=0,`expiryHandling`='expire',
  `duplicatePrevention`=0,`audioEnabled`=0,`audioSound`='',
  `maxTradeAttemptsPerDay`=0,`tradeRetryDelaySeconds`=0,`maxSuccessfulTradesPerDay`=0,`maxConcurrentActiveTrades`=0,
  `requirePreviousSettlement`=1,`minSettlementDelaySeconds`=0,`maxSettlementDelaySeconds`=0,
  `minimumRewardBps`=0,`maximumRewardBps`=0,`minimumTradeDurationSeconds`=0,`maximumTradeDurationSeconds`=0,
  `minimumCapitalUsdMinor`=0,`maximumCapitalUsdMinor`=0,`badgeLabel`='',`badgeColor`='violet',`companyRotationEnabled`=0,
  `maxDailyRewardMinor`=0,`rewardLimitCurrency`='USD',`dailyRewardWindow`='calendar_day',`maxRewardPerTradeMinor`=0,
  `unsettledRewardPolicy`='reserve',`capReachedPolicy`='stop_new_trades',`settlementConfirmationState`='ledger_and_wallet',
  `settlementRetryPolicy`='manual',`maxSettlementAttempts`=0,`closePolicy`='after_completion';
