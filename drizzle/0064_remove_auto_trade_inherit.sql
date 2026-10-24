-- Remove the obsolete inherited auto-trade mode and make opt-in explicit.
-- Existing inherited customers are safely migrated to disabled before narrowing the enum.
UPDATE `customer_controls`
SET `autoTradeMode` = 'disabled'
WHERE `autoTradeMode` = 'inherit';

ALTER TABLE `customer_controls`
  MODIFY COLUMN `autoTradeMode` enum('enabled','disabled') NOT NULL DEFAULT 'disabled';
