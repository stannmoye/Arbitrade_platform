ALTER TABLE `opportunity_package_policies`
  CHANGE COLUMN `maxPopupsPerMinute` `maxPopupsPerDay` int NOT NULL DEFAULT 10;

INSERT INTO `app_settings` (`settingKey`, `settingValue`)
VALUES ('opportunity.maxPopupsPerDay', '50')
ON DUPLICATE KEY UPDATE `settingValue` = VALUES(`settingValue`);

DELETE FROM `app_settings`
WHERE `settingKey` = 'opportunity.frequencyPerMinute';
