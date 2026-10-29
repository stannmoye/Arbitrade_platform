-- Trading policy reconciliation: old runtime/schema defaults are not proof that an administrator reviewed a tier.
-- Preserve package identities, subscription history, trades, popup history, wallet ledgers and numeric policy snapshots.
-- Pause existing tiers until an authorized administrator reviews/saves each policy and explicitly re-enables the tier.
ALTER TABLE `packages` ALTER COLUMN `enabled` SET DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `opportunity_package_policies` ALTER COLUMN `enabled` SET DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `opportunity_package_policies` ALTER COLUMN `automaticDelivery` SET DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `opportunity_package_policies` ALTER COLUMN `automaticTradingEnabled` SET DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `opportunity_package_policies` ALTER COLUMN `policyVersion` SET DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `opportunity_popup_events` ALTER COLUMN `tradeDurationSeconds` DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE `opportunity_delivery_events` ALTER COLUMN `policyVersion` DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE `opportunity_popup_events` ALTER COLUMN `policyVersion` DROP DEFAULT;
--> statement-breakpoint
UPDATE `packages` SET `enabled`=0;
--> statement-breakpoint
UPDATE `opportunity_package_policies`
SET `enabled`=0,`automaticDelivery`=0,`automaticTradingEnabled`=0,`policyVersion`=0;
--> statement-breakpoint
INSERT INTO `opportunity_package_policies` (`packageName`,`enabled`,`automaticDelivery`,`automaticTradingEnabled`,`policyVersion`)
SELECT p.`name`,0,0,0,0
FROM `packages` p
LEFT JOIN `opportunity_package_policies` opp ON opp.`packageName`=p.`name`
WHERE opp.`id` IS NULL;
