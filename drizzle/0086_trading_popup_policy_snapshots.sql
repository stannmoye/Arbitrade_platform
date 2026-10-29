-- Forward-only, restart-safe Trading policy additions.
-- The migration stores administrator policy bounds and immutable per-trade selections.
ALTER TABLE `opportunity_package_policies`
  ADD COLUMN IF NOT EXISTS `maximumRewardBps` INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `minimumTradeDurationSeconds` INT NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS `maximumTradeDurationSeconds` INT NOT NULL DEFAULT 3600,
  ADD COLUMN IF NOT EXISTS `packageBadgeLabel` VARCHAR(48) NULL;

ALTER TABLE `opportunity_popup_events`
  ADD COLUMN IF NOT EXISTS `configuredProfitRateBps` INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `configuredDurationSeconds` INT NOT NULL DEFAULT 0,
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
  ADD COLUMN IF NOT EXISTS `packagePolicyVersionSnapshot` INT NOT NULL DEFAULT 1;
