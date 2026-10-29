-- Persist admin-controlled profit and trade-duration ranges, capital bounds, and package badges.
-- Existing USD-unit limits are converted to USD minor units without rewriting historical trades.
ALTER TABLE `opportunity_package_policies`
  ADD COLUMN IF NOT EXISTS `maximumRewardBps` int NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS `minimumTradeDurationSeconds` int NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS `maximumTradeDurationSeconds` int NOT NULL DEFAULT 86400,
  ADD COLUMN IF NOT EXISTS `minimumCapitalUsdMinor` bigint NOT NULL DEFAULT 100000,
  ADD COLUMN IF NOT EXISTS `maximumCapitalUsdMinor` bigint NOT NULL DEFAULT 10000000,
  ADD COLUMN IF NOT EXISTS `badgeLabel` varchar(40) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS `badgeColor` varchar(24) NOT NULL DEFAULT 'violet',
  ADD COLUMN IF NOT EXISTS `companyRotationEnabled` tinyint(1) NOT NULL DEFAULT 1;
--> statement-breakpoint
UPDATE `opportunity_package_policies`
SET `minimumCapitalUsdMinor` = GREATEST(1, `minimumTradeUnits`) * 100,
    `maximumCapitalUsdMinor` = GREATEST(`minimumTradeUnits`, `maximumTradeUnits`) * 100
WHERE `minimumCapitalUsdMinor` = 100000 AND `maximumCapitalUsdMinor` = 10000000;
--> statement-breakpoint
UPDATE `opportunity_package_policies`
SET `maximumRewardBps` = GREATEST(`minimumRewardBps`, 500),
    `minimumTradeDurationSeconds` = LEAST(`minSettlementDelaySeconds`, 86400),
    `maximumTradeDurationSeconds` = GREATEST(`minSettlementDelaySeconds`, `maxSettlementDelaySeconds`, 10)
WHERE `maximumRewardBps` = 500 AND `minimumTradeDurationSeconds` = 10 AND `maximumTradeDurationSeconds` = 86400;
