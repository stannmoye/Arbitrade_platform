ALTER TABLE `customer_controls`
  ADD COLUMN IF NOT EXISTS `opportunitiesEnabled` tinyint(1) NOT NULL DEFAULT 1 AFTER `tradingEnabled`;
