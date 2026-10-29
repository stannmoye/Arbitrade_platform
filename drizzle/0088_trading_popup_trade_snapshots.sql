-- Persist immutable per-popup Trading terms and their trade-allocation snapshot.
-- Keep this after 0086 policy ranges and 0087 company spotlight settings.
-- Existing rows are preserved; legacy popups can use their published offer values.
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

ALTER TABLE `trade_positions`
  ADD COLUMN IF NOT EXISTS `configuredProfitRateBps` INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `configuredDurationSeconds` INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `packagePolicyVersionSnapshot` INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `companyReferenceId` VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS `companyDisplayName` VARCHAR(240) NULL,
  ADD COLUMN IF NOT EXISTS `companyLogoUrl` VARCHAR(512) NULL,
  ADD COLUMN IF NOT EXISTS `companyReferenceOnly` TINYINT(1) NOT NULL DEFAULT 1;
