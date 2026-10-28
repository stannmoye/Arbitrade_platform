-- Durable, low-overhead work queue for automatic Trading tier qualification.
-- The ledger mutation and queue insert are committed in the same transaction.
CREATE TABLE IF NOT EXISTS `trading_tier_qualification_jobs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `ledgerId` int NOT NULL,
  `status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
  `attempts` int NOT NULL DEFAULT 0,
  `availableAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lockedAt` timestamp NULL,
  `lastError` varchar(500) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_trading_tier_qualification_ledger` (`ledgerId`),
  KEY `idx_trading_tier_qualification_ready` (`status`, `availableAt`, `id`),
  KEY `idx_trading_tier_qualification_lease` (`status`, `lockedAt`)
) ENGINE=InnoDB;
--> statement-breakpoint
-- Backfill qualifying credits/reversals already committed before this worker was introduced.
INSERT IGNORE INTO `trading_tier_qualification_jobs` (`userId`, `ledgerId`, `status`, `availableAt`)
SELECT `userId`, `id`, 'pending', CURRENT_TIMESTAMP
FROM `balance_ledger`
WHERE `entryType` IN ('admin_manual_deposit_credit', 'admin_manual_deposit_reversal')
  AND `qualifyingDepositUsdMinor` IS NOT NULL;
