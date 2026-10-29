-- Extend administrator-owned Trading policy with explicit badges and published-offer filters.
-- Existing popups retain their snapshots; new filters apply only to future deliveries.
ALTER TABLE `opportunity_package_policies` ADD COLUMN IF NOT EXISTS `badgeLabel` varchar(40) NULL;
--> statement-breakpoint
ALTER TABLE `opportunity_package_policies` ADD COLUMN IF NOT EXISTS `badgeStyle` varchar(16) NOT NULL DEFAULT 'neutral';
--> statement-breakpoint
ALTER TABLE `opportunity_package_policies` ADD COLUMN IF NOT EXISTS `minimumPayoutRateBps` int NULL;
--> statement-breakpoint
ALTER TABLE `opportunity_package_policies` ADD COLUMN IF NOT EXISTS `maximumPayoutRateBps` int NULL;
--> statement-breakpoint
ALTER TABLE `opportunity_package_policies` ADD COLUMN IF NOT EXISTS `minimumTradeDurationSeconds` int NULL;
--> statement-breakpoint
ALTER TABLE `opportunity_package_policies` ADD COLUMN IF NOT EXISTS `maximumTradeDurationSeconds` int NULL;
--> statement-breakpoint
-- Repair deployments whose older popup table does not yet contain policyVersion.
ALTER TABLE `opportunity_popup_events` ADD COLUMN IF NOT EXISTS `policyVersion` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `opportunity_popup_events` ADD COLUMN IF NOT EXISTS `durationSeconds` int NULL;
--> statement-breakpoint
ALTER TABLE `opportunity_popup_events` ADD COLUMN IF NOT EXISTS `badgeLabel` varchar(40) NULL;
--> statement-breakpoint
ALTER TABLE `opportunity_popup_events` ADD COLUMN IF NOT EXISTS `badgeStyle` varchar(16) NOT NULL DEFAULT 'neutral';
--> statement-breakpoint
-- Legacy policy defaults are not evidence of explicit administrator approval.
-- Any row without a complete valid range remains unavailable until reviewed and saved.
UPDATE `opportunity_package_policies`
SET `enabled` = 0, `automaticDelivery` = 0, `automaticTradingEnabled` = 0
WHERE `minimumPayoutRateBps` IS NULL OR `maximumPayoutRateBps` IS NULL
   OR `minimumTradeDurationSeconds` IS NULL OR `maximumTradeDurationSeconds` IS NULL
   OR `minimumPayoutRateBps` < 1 OR `maximumPayoutRateBps` > 5000
   OR `minimumPayoutRateBps` > `maximumPayoutRateBps`
   OR `minimumTradeDurationSeconds` < 10 OR `maximumTradeDurationSeconds` > 86400
   OR `minimumTradeDurationSeconds` > `maximumTradeDurationSeconds`;
