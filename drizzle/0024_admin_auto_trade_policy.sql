ALTER TABLE `customer_controls`
  ADD COLUMN IF NOT EXISTS `autoTradeMode` enum('inherit','enabled','disabled') NOT NULL DEFAULT 'inherit';
