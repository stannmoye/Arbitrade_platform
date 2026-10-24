-- Record the actual outcome, gross result, fee and net result separately.
-- Forward-only: historical trade and ledger records are not rewritten.
ALTER TABLE `trade_positions`
  ADD COLUMN IF NOT EXISTS `realizedGrossProfitMinor` bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `platformFeeMinor` bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `netProfitMinor` bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `feePolicyVersion` int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `platformFeeRateBps` int NOT NULL DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS `platformFeeRoundingMode` varchar(20) NOT NULL DEFAULT 'half_up',
  ADD COLUMN IF NOT EXISTS `settlementOutcome` varchar(32) NOT NULL DEFAULT 'legacy_unrecorded';
--> statement-breakpoint
INSERT INTO `app_settings` (`settingKey`, `settingValue`)
VALUES
  ('trade.platformFeeBps', '1500'),
  ('trade.feeRoundingMode', 'half_up'),
  ('trade.feePolicyVersion', '1')
ON DUPLICATE KEY UPDATE `settingKey` = VALUES(`settingKey`);
