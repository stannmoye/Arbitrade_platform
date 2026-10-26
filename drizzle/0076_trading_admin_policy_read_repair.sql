-- Repair the schema and default rows required by the Trading administration policy screens.
-- Safe for existing installations: additive DDL, insert-if-missing settings, and package
-- term correction only when the terms are still at their untouched version-1 defaults.
CREATE TABLE IF NOT EXISTS `app_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `settingKey` varchar(120) NOT NULL,
  `settingValue` text NOT NULL,
  `updatedBy` int NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `app_settings_setting_key_unique` (`settingKey`)
) ENGINE=InnoDB;
--> statement-breakpoint
ALTER TABLE `packages`
  ADD COLUMN IF NOT EXISTS `minimumQualifyingBalanceUsdMinor` bigint NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS `durationMonths` int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `opportunitiesPerDay` int NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS `termsVersion` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `app_settings`
  ADD COLUMN IF NOT EXISTS `updatedBy` int NULL,
  ADD COLUMN IF NOT EXISTS `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
--> statement-breakpoint
INSERT INTO `packages`
  (`name`,`minimumQualifyingBalanceUsdMinor`,`durationMonths`,`opportunitiesPerDay`,`termsVersion`,`enabled`)
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
UPDATE `packages` p
JOIN (
  SELECT 'Aureate Capital' AS name, 10000 AS minimumBalance, 1 AS durationMonths, 6 AS opportunitiesPerDay
  UNION ALL SELECT 'Sterling Reserve',25000,2,8
  UNION ALL SELECT 'Sovereign Crest',50000,3,10
  UNION ALL SELECT 'Meridian Equity',100000,3,12
  UNION ALL SELECT 'Crownstone Capital',200000,6,14
  UNION ALL SELECT 'Imperial Ledger',350000,6,16
  UNION ALL SELECT 'Pinnacle Treasury',500000,6,18
  UNION ALL SELECT 'Obsidian Reserve',750000,9,20
  UNION ALL SELECT 'Sovereign Meridian',1000000,9,22
  UNION ALL SELECT 'Regalia Capital',1500000,12,24
  UNION ALL SELECT 'Apex Treasury',2000000,12,25
  UNION ALL SELECT 'Monarch Equity',3000000,12,26
  UNION ALL SELECT 'Grand Meridian',5000000,18,27
  UNION ALL SELECT 'Crown Imperial Reserve',7500000,18,28
  UNION ALL SELECT 'Sovereign Apex',10000000,24,29
  UNION ALL SELECT 'Paramount Capital Reserve',15000000,24,30
) canonical ON canonical.name=p.`name`
SET p.`minimumQualifyingBalanceUsdMinor`=canonical.minimumBalance,
    p.`durationMonths`=canonical.durationMonths,
    p.`opportunitiesPerDay`=canonical.opportunitiesPerDay
WHERE p.`termsVersion`=1
  AND p.`minimumQualifyingBalanceUsdMinor`=10000
  AND p.`durationMonths`=1
  AND p.`opportunitiesPerDay`=6;
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
INSERT INTO `app_settings` (`settingKey`,`settingValue`)
VALUES ('trading.allocations.paused','{"allocationsPaused":true,"reason":"Safety hold inserted by schema repair; administrator review is required before resuming allocations.","updatedAt":null,"updatedBy":null}')
ON DUPLICATE KEY UPDATE `settingKey`=VALUES(`settingKey`);
