-- Repair the customer-facing Trading package catalogue's subscription-history contract.
-- Earlier migrations may be recorded as applied even when a hosted legacy schema drifted.
-- Preserve all existing rows; legacy rows without trustworthy activation evidence remain expired.
CREATE TABLE IF NOT EXISTS `customer_package_subscriptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `packageId` int NOT NULL,
  `startsAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expiresAt` timestamp NULL,
  `status` enum('active','expired','cancelled') NOT NULL DEFAULT 'expired',
  `activationKey` varchar(128) NULL,
  `termsSnapshotJson` text NOT NULL,
  `qualifyingBalanceUsdMinor` bigint NOT NULL DEFAULT 0,
  `packageTermsVersion` int NOT NULL DEFAULT 1,
  `activatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_package_subscriptions_activation_key_unique` (`activationKey`)
) ENGINE=InnoDB;
--> statement-breakpoint
ALTER TABLE `customer_package_subscriptions`
  ADD COLUMN IF NOT EXISTS `userId` int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `packageId` int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `startsAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS `expiresAt` timestamp NULL,
  ADD COLUMN IF NOT EXISTS `status` enum('active','expired','cancelled') NOT NULL DEFAULT 'expired',
  ADD COLUMN IF NOT EXISTS `activationKey` varchar(128) NULL,
  ADD COLUMN IF NOT EXISTS `termsSnapshotJson` text NOT NULL DEFAULT ('{}'),
  ADD COLUMN IF NOT EXISTS `qualifyingBalanceUsdMinor` bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `packageTermsVersion` int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `activatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `customer_package_subscriptions_activation_key_unique`
  ON `customer_package_subscriptions` (`activationKey`);
