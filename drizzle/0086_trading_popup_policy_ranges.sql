-- Persist admin-controlled profit and trade-duration ranges, capital bounds, package badges, and company rotation.
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
ALTER TABLE `opportunity_popup_events`
  ADD COLUMN IF NOT EXISTS `tradeDurationSeconds` int NOT NULL DEFAULT 600,
  ADD COLUMN IF NOT EXISTS `companyLogoId` int NULL;
--> statement-breakpoint
ALTER TABLE `trade_positions`
  ADD COLUMN IF NOT EXISTS `profitRateBps` int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `tradeDurationSeconds` int NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE `opportunity_package_policies`
SET `minimumCapitalUsdMinor` = GREATEST(1, `minimumTradeUnits`) * 100,
    `maximumCapitalUsdMinor` = GREATEST(`minimumTradeUnits`, `maximumTradeUnits`) * 100;
--> statement-breakpoint
UPDATE `opportunity_package_policies`
SET `minimumRewardBps` = 200
WHERE `minimumRewardBps` = 0;
