-- Forward-only correction: the popup migration stores the funding plan on the
-- event, while the trade schema and allocation service also require an immutable
-- trade-level snapshot. Never rewrite the historical 0088 migration.
ALTER TABLE `trade_positions`
  ADD COLUMN IF NOT EXISTS `walletFundingPlanJson` TEXT NULL;
