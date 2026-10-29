-- Repair legacy opportunity delivery columns omitted from the standard journal, and add
-- durable ownership token used to fence stale automatic Trading workers.
-- Safe to re-run on MySQL 8.4 and MariaDB 11.4.
ALTER TABLE `opportunity_popup_events`
  ADD COLUMN IF NOT EXISTS `deliveryStatus` enum('pending','delivered','received','rendered','failed','expired') NOT NULL DEFAULT 'delivered',
  ADD COLUMN IF NOT EXISTS `deliveryAttemptCount` int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `lastErrorCode` varchar(80) NULL,
  ADD COLUMN IF NOT EXISTS `receivedAt` timestamp NULL,
  ADD COLUMN IF NOT EXISTS `renderedAt` timestamp NULL,
  ADD COLUMN IF NOT EXISTS `expiredAt` timestamp NULL,
  ADD COLUMN IF NOT EXISTS `executionLeaseToken` varchar(64) NULL;
