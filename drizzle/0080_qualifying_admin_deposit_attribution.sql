-- Record qualifying deposit attribution and the conversion evidence used at credit time.
-- Existing unclassified credits remain non-qualifying; no historical deposits are inferred.
ALTER TABLE `balance_ledger`
  ADD COLUMN IF NOT EXISTS `qualifyingDepositUsdMinor` bigint NULL,
  ADD COLUMN IF NOT EXISTS `qualifyingDepositRate` varchar(64) NULL,
  ADD COLUMN IF NOT EXISTS `qualifyingDepositRateProvider` varchar(120) NULL,
  ADD COLUMN IF NOT EXISTS `qualifyingDepositRateAt` timestamp NULL;
--> statement-breakpoint
-- Legacy customer-activated subscriptions are not valid entitlements under the automatic-tier policy.
-- Preserve the historical rows for audit; new entitlements use the auto-tier activation key prefix.
UPDATE `customer_package_subscriptions`
SET `status` = 'expired'
WHERE `status` = 'active'
  AND (`activationKey` IS NULL OR `activationKey` NOT LIKE 'auto-tier:%');

--> statement-breakpoint
-- Remove obsolete customer activation, repeat-purchase and wallet-balance qualification settings.
DELETE FROM `app_settings`
WHERE `settingKey` IN (
  'trading.packageQualification.eligibleCurrencies',
  'trading.packageQualification.combineEligibleWallets',
  'trading.packagePurchase.repeatAllowed',
  'trading.packagePurchase.maxCopies',
  'trading.packagePurchase.repeatRestriction',
  'trading.packagePurchase.cooldownSeconds'
);
