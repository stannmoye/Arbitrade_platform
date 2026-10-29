-- Persist administrator-controlled package-specific company spotlight rotation.
-- Catalogue records remain informational reference data and never authorize trades.
ALTER TABLE `opportunity_package_policies` ADD COLUMN IF NOT EXISTS `companyRotationEnabled` tinyint(1) NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `opportunity_package_policies` ADD COLUMN IF NOT EXISTS `companyRotationCountryNames` text NULL;
--> statement-breakpoint
ALTER TABLE `opportunity_package_policies` ADD COLUMN IF NOT EXISTS `companyRotationRepeatPolicy` varchar(32) NOT NULL DEFAULT 'avoid_until_exhausted';
