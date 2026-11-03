-- Allow catalogue-native automatic opportunities without a manually authored template.
-- Existing template IDs/versions remain intact for historical rows.
ALTER TABLE opportunity_generation_assignments
  MODIFY COLUMN templateId INT NULL,
  MODIFY COLUMN templateVersion INT NULL;
--> statement-breakpoint
-- Update only the untouched migration-default reason; preserve any administrator-edited reason.
UPDATE app_settings
SET settingValue = JSON_SET(settingValue, '$.reason', 'Default automatic brand-catalogue opportunity generation; company templates are optional.')
WHERE settingKey = 'trade.opportunityGeneration.control'
  AND JSON_UNQUOTE(JSON_EXTRACT(settingValue, '$.reason')) = 'Default automatic informational opportunity generation control; approved templates and active package rules are still required.';
--> statement-breakpoint
-- This migration does not change the company catalogue, package records, customer
-- assignments, wallet, ledger, financial execution, or settlement records.
