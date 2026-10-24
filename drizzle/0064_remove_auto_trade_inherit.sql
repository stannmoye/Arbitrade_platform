-- Remove the obsolete inherited auto-trade mode and make opt-in explicit.
-- Existing inherited customers are safely migrated to disabled before narrowing the enum.
UPDATE `customer_controls`
SET `autoTradeMode` = 'disabled'
WHERE `autoTradeMode` = 'inherit';

-- Keep the legacy compatibility column consistent with the explicit mode.
UPDATE `customer_controls`
SET `autoTradeEnabled` = CASE WHEN `autoTradeMode` = 'enabled' THEN 1 ELSE 0 END;

ALTER TABLE `customer_controls`
  MODIFY COLUMN `autoTradeMode` enum('enabled','disabled') NOT NULL DEFAULT 'disabled',
  MODIFY COLUMN `autoTradeEnabled` tinyint(1) NOT NULL DEFAULT 0;
