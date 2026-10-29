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
