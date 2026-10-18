ALTER TABLE `customer_controls`
  ADD COLUMN `opportunitiesEnabled` tinyint(1) NOT NULL DEFAULT 1 AFTER `tradingEnabled`;
