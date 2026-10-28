-- Align persisted opportunity policy rows with administrator-managed Trading tiers.
-- The packageName key follows the tier's display name, so it must support the same length.
ALTER TABLE `opportunity_package_policies`
  MODIFY COLUMN `packageName` varchar(80) NOT NULL;
--> statement-breakpoint
-- Ensure every existing tier has a persisted policy row. Existing rows and their settings are preserved.
INSERT INTO `opportunity_package_policies` (`packageName`)
SELECT `p`.`name`
FROM `packages` AS `p`
LEFT JOIN `opportunity_package_policies` AS `opp` ON `opp`.`packageName` = `p`.`name`
WHERE `opp`.`id` IS NULL
ON DUPLICATE KEY UPDATE `packageName` = VALUES(`packageName`);
