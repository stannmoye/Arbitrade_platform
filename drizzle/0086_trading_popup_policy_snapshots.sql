-- Forward-only, restart-safe Trading policy additions.
-- The migration stores administrator policy bounds and immutable per-trade selections.
ALTER TABLE `opportunity_package_policies`
  ADD COLUMN IF NOT EXISTS `maximumRewardBps` INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `minimumTradeDurationSeconds` INT NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS `maximumTradeDurationSeconds` INT NOT NULL DEFAULT 3600,
  ADD COLUMN IF NOT EXISTS `packageBadgeLabel` VARCHAR(48) NULL;

ALTER TABLE `trade_positions`
  ADD COLUMN IF NOT EXISTS `configuredProfitRateBps` INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `configuredDurationSeconds` INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `packagePolicyVersionSnapshot` INT NOT NULL DEFAULT 1;
