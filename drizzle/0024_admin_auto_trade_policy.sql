ALTER TABLE `customer_controls`
  ADD COLUMN `autoTradeMode` enum('inherit','enabled','disabled') NOT NULL DEFAULT 'inherit';
