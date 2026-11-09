ALTER TABLE `trade_positions`
  ADD COLUMN IF NOT EXISTS `instrumentIdSnapshot` int NULL,
  ADD COLUMN IF NOT EXISTS `entryMarketSnapshotId` int NULL,
  ADD COLUMN IF NOT EXISTS `entryPriceUsd` varchar(64) NULL,
  ADD COLUMN IF NOT EXISTS `exitMarketSnapshotId` int NULL,
  ADD COLUMN IF NOT EXISTS `exitPriceUsd` varchar(64) NULL,
  ADD COLUMN IF NOT EXISTS `settlementResultSource` varchar(80) NULL,
  ADD COLUMN IF NOT EXISTS `settlementProvider` varchar(120) NULL,
  ADD COLUMN IF NOT EXISTS `settlementObservedAt` timestamp NULL;

CREATE INDEX IF NOT EXISTS `trade_positions_market_result_idx`
  ON `trade_positions` (`settlementStatus`, `settlementReviewAt`, `instrumentIdSnapshot`);
