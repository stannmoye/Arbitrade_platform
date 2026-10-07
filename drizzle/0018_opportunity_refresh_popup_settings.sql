INSERT INTO `app_settings` (`settingKey`, `settingValue`)
VALUES
  ('market.refreshIntervalMinutes', '120'),
  ('opportunity.deskLabel', 'WiseBond Market Intelligence Desk'),
  ('opportunity.frequencyPerMinute', '50'),
  ('opportunity.popup.minGapSeconds', '45'),
  ('opportunity.popup.displaySeconds', '8'),
  ('opportunity.popup.maxPerHour', '12'),
  ('opportunity.popup.preAlertProbabilityBps', '1500'),
  ('opportunity.popup.preAlertSeconds', '4'),
  ('opportunity.popup.withdrawalProbabilityBps', '1200'),
  ('opportunity.popup.jitterSeconds', '90')
ON DUPLICATE KEY UPDATE `settingValue` = VALUES(`settingValue`);
--> statement-breakpoint

UPDATE `opportunity_offers`
SET `venueTo` = 'WiseBond Market Intelligence Desk'
WHERE `venueTo` = 'WiseBond Simulation Desk' AND `status` = 'open';
