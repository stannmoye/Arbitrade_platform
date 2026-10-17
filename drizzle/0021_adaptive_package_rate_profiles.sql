ALTER TABLE `opportunity_package_policies`
  ADD COLUMN `minHourlyTarget` int NOT NULL DEFAULT 0,
  ADD COLUMN `normalHourlyTarget` int NOT NULL DEFAULT 0,
  ADD COLUMN `marketInfluenceBps` int NOT NULL DEFAULT 5000,
  ADD COLUMN `burstEnabled` boolean NOT NULL DEFAULT false,
  ADD COLUMN `maxBurstSize` int NOT NULL DEFAULT 0;
--> statement-breakpoint

UPDATE `opportunity_package_policies`
SET
  `minHourlyTarget` = CASE WHEN `maxPopupsPerDay` >= 50 THEN 2 ELSE 0 END,
  `normalHourlyTarget` = CASE WHEN `maxPopupsPerDay` >= 100 THEN 6 WHEN `maxPopupsPerDay` >= 30 THEN 4 ELSE 2 END,
  `marketInfluenceBps` = CASE WHEN `maxPopupsPerDay` >= 100 THEN 8500 WHEN `maxPopupsPerDay` >= 50 THEN 7000 WHEN `maxPopupsPerDay` >= 30 THEN 5000 ELSE 3000 END,
  `burstEnabled` = (`maxPopupsPerDay` >= 50),
  `maxBurstSize` = CASE WHEN `maxPopupsPerDay` >= 100 THEN 3 WHEN `maxPopupsPerDay` >= 50 THEN 2 ELSE 0 END;
--> statement-breakpoint

INSERT INTO `app_settings` (`settingKey`, `settingValue`)
VALUES
  ('opportunity.globalEmergencyCeilingPerDay', '500'),
  ('opportunity.drainMode', 'false'),
  ('opportunity.marketInfluenceBps', '7000')
ON DUPLICATE KEY UPDATE `settingValue` = VALUES(`settingValue`);
