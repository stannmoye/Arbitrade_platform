ALTER TABLE `opportunity_package_policies`
  CHANGE COLUMN `maxPopupsPerMinute` `maxPopupsPerDay` int NOT NULL DEFAULT 10;
--> statement-breakpoint

INSERT INTO `app_settings` (`settingKey`, `settingValue`)
VALUES ('opportunity.maxPopupsPerDay', '50')
ON DUPLICATE KEY UPDATE `settingValue` = VALUES(`settingValue`);
--> statement-breakpoint

DELETE FROM `app_settings`
WHERE `settingKey` = 'opportunity.frequencyPerMinute';
