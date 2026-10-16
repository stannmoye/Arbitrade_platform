ALTER TABLE `opportunity_popup_events`
  ADD COLUMN IF NOT EXISTS `deliveryStatus` enum('pending','delivered','received','rendered','failed','expired') NOT NULL DEFAULT 'delivered',
  ADD COLUMN IF NOT EXISTS `deliveryAttemptCount` int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `lastErrorCode` varchar(80) NULL,
  ADD COLUMN IF NOT EXISTS `receivedAt` timestamp NULL,
  ADD COLUMN IF NOT EXISTS `renderedAt` timestamp NULL,
  ADD COLUMN IF NOT EXISTS `expiredAt` timestamp NULL,
  ADD COLUMN IF NOT EXISTS `tradeId` int NULL,
  ADD COLUMN IF NOT EXISTS `policyVersion` int NOT NULL DEFAULT 1;

ALTER TABLE `opportunity_delivery_events`
  ADD COLUMN IF NOT EXISTS `status` enum('pending','delivered','expired','failed') NOT NULL DEFAULT 'delivered',
  ADD COLUMN IF NOT EXISTS `attemptCount` int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `lastErrorCode` varchar(80) NULL,
  ADD COLUMN IF NOT EXISTS `expiresAt` timestamp NULL,
  ADD COLUMN IF NOT EXISTS `policyVersion` int NOT NULL DEFAULT 1;
