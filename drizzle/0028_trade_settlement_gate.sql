INSERT INTO `app_settings` (`settingKey`, `settingValue`)
VALUES
  ('trade.settlementDelaySeconds', '900'),
  ('trade.blockOpportunitiesUntilSettled', 'true')
ON DUPLICATE KEY UPDATE `settingKey` = `settingKey`;
