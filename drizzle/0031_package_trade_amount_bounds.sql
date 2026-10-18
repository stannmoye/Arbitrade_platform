ALTER TABLE `opportunity_package_policies`
  ADD COLUMN `minimumTradeMinor` int NOT NULL DEFAULT 1000,
  ADD COLUMN `maximumTradeMinor` int NOT NULL DEFAULT 100000;
--> statement-breakpoint
UPDATE `opportunity_package_policies`
SET
  `minimumTradeMinor` = CASE `packageName`
    WHEN 'Starter' THEN 1000
    WHEN 'Growth' THEN 5000
    WHEN 'Pro' THEN 10000
    WHEN 'Institutional' THEN 200000
    ELSE `minimumTradeMinor`
  END,
  `maximumTradeMinor` = CASE `packageName`
    WHEN 'Starter' THEN 500000
    WHEN 'Growth' THEN 1500000
    WHEN 'Pro' THEN 3000000
    WHEN 'Institutional' THEN 700000
    ELSE `maximumTradeMinor`
  END;
