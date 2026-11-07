ALTER TABLE `opportunity_popup_daily`
  ADD COLUMN IF NOT EXISTS `generatedCount` int NOT NULL DEFAULT 0 AFTER `eventDate`,
  ADD COLUMN IF NOT EXISTS `queuedCount` int NOT NULL DEFAULT 0 AFTER `generatedCount`,
  ADD COLUMN IF NOT EXISTS `receivedCount` int NOT NULL DEFAULT 0 AFTER `queuedCount`,
  ADD COLUMN IF NOT EXISTS `renderedCount` int NOT NULL DEFAULT 0 AFTER `receivedCount`,
  ADD COLUMN IF NOT EXISTS `failedCount` int NOT NULL DEFAULT 0 AFTER `renderedCount`,
  ADD COLUMN IF NOT EXISTS `expiredCount` int NOT NULL DEFAULT 0 AFTER `failedCount`;
