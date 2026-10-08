ALTER TABLE `opportunity_package_policies`
  CHANGE COLUMN `minimumTradeMinor` `minimumTradeUnits` int NOT NULL DEFAULT 1000,
  CHANGE COLUMN `maximumTradeMinor` `maximumTradeUnits` int NOT NULL DEFAULT 100000;
