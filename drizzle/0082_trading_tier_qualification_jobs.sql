-- Durable, indexed queue for automatic Trading tier qualification.
-- The source ledger ID is unique so retries or duplicate enqueue attempts cannot
-- create multiple qualification jobs for the same qualifying credit/reversal.
CREATE TABLE IF NOT EXISTS `trading_tier_qualification_jobs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `sourceLedgerId` int NOT NULL,
  `status` enum('pending','processing','completed','dead') NOT NULL DEFAULT 'pending',
  `attempts` int NOT NULL DEFAULT 0,
  `availableAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lockedAt` timestamp NULL DEFAULT NULL,
  `lastError` varchar(1000) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `trading_tier_qualification_jobs_source_ledger_uq` (`sourceLedgerId`),
  KEY `trading_tier_qualification_jobs_status_available_idx` (`status`, `availableAt`, `id`),
  KEY `trading_tier_qualification_jobs_user_status_idx` (`userId`, `status`)
) ENGINE=InnoDB;
