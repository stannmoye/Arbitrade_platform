INSERT INTO `app_settings` (`settingKey`, `settingValue`)
VALUES ('trade.interTradeCooldownSeconds', '30')
ON DUPLICATE KEY UPDATE `settingKey` = `settingKey`;
