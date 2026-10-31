ALTER TABLE `trade_positions`
  ADD COLUMN IF NOT EXISTS `settlementReviewAt` timestamp NULL AFTER `settlesAt`;
