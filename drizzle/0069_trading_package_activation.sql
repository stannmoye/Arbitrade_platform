-- Forward-only package activation requirements. Historical subscriptions are retained.
ALTER TABLE `packages`
  ADD COLUMN IF NOT EXISTS `minimumQualifyingBalanceUsdMinor` bigint NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS `durationMonths` int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `opportunitiesPerDay` int NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS `termsVersion` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `customer_package_subscriptions`
  ADD COLUMN IF NOT EXISTS `activationKey` varchar(128) NULL,
  ADD COLUMN IF NOT EXISTS `termsSnapshotJson` text NOT NULL DEFAULT ('{}'),
  ADD COLUMN IF NOT EXISTS `qualifyingBalanceUsdMinor` bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `packageTermsVersion` int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `activatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `customer_package_subscriptions_activation_key_unique`
  ON `customer_package_subscriptions` (`activationKey`);
--> statement-breakpoint
INSERT INTO `packages` (`name`,`minimumQualifyingBalanceUsdMinor`,`durationMonths`,`opportunitiesPerDay`,`termsVersion`,`enabled`)
VALUES
 ('Aureate Capital',10000,1,6,1,1),
 ('Sterling Reserve',25000,2,8,1,1),
 ('Sovereign Crest',50000,3,10,1,1),
 ('Meridian Equity',100000,3,12,1,1),
 ('Crownstone Capital',200000,6,14,1,1),
 ('Imperial Ledger',350000,6,16,1,1),
 ('Pinnacle Treasury',500000,6,18,1,1),
 ('Obsidian Reserve',750000,9,20,1,1),
 ('Sovereign Meridian',1000000,9,22,1,1),
 ('Regalia Capital',1500000,12,24,1,1),
 ('Apex Treasury',2000000,12,25,1,1),
 ('Monarch Equity',3000000,12,26,1,1),
 ('Grand Meridian',5000000,18,27,1,1),
 ('Crown Imperial Reserve',7500000,18,28,1,1),
 ('Sovereign Apex',10000000,24,29,1,1),
 ('Paramount Capital Reserve',15000000,24,30,1,1)
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`);
--> statement-breakpoint
UPDATE `packages` SET `enabled`=0 WHERE `name` IN ('Starter','Growth','Pro','Institutional');
--> statement-breakpoint
ALTER TABLE `opportunity_package_policies`
  ADD COLUMN IF NOT EXISTS `automaticTradingEnabled` tinyint(1) NOT NULL DEFAULT 1;
--> statement-breakpoint
UPDATE `opportunity_package_policies`
  SET `enabled`=0, `automaticTradingEnabled`=0
  WHERE `packageName` IN ('Starter','Growth','Pro','Institutional');
--> statement-breakpoint
INSERT INTO `app_settings` (`settingKey`,`settingValue`)
VALUES
 ('trading.packageQualification.eligibleCurrencies','["USD"]'),
 ('trading.packageQualification.combineEligibleWallets','false'),
 ('trading.packagePurchase.repeatAllowed','false'),
 ('trading.packagePurchase.maxCopies','0'),
 ('trading.packagePurchase.repeatRestriction','active_only'),
 ('trading.packagePurchase.cooldownSeconds','21600')
ON DUPLICATE KEY UPDATE `settingKey`=VALUES(`settingKey`);
--> statement-breakpoint
ALTER TABLE `trade_positions`
  ADD COLUMN IF NOT EXISTS `packageSubscriptionId` int NULL;
--> statement-breakpoint
CREATE INDEX `trade_positions_package_subscription_idx`
  ON `trade_positions` (`packageSubscriptionId`);
--> statement-breakpoint
ALTER TABLE `missed_opportunities`
  ADD COLUMN IF NOT EXISTS `availableMinorAtOpportunity` bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `shortfallMinor` bigint NOT NULL DEFAULT 0;
