ALTER TABLE `trade_positions`
  ADD COLUMN IF NOT EXISTS `creditAt` timestamp NULL;
--> statement-breakpoint
INSERT INTO `app_settings` (`settingKey`, `settingValue`)
VALUES
  ('trade.creditDelaySeconds', '0'),
  ('opportunity.nextPopupFormulaDelaySeconds', '30'),
  ('opportunity.popup.minGapSeconds', '45'),
  ('opportunity.popup.displaySeconds', '8'),
  ('opportunity.popup.preAlertSeconds', '4'),
  ('opportunity.popup.jitterSeconds', '90'),
  ('opportunity.popup.maxPerHour', '12'),
  ('market.refreshIntervalMinutes', '120')
ON DUPLICATE KEY UPDATE `settingKey` = `settingKey`;
