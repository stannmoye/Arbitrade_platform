-- Allow catalogue-native automatic opportunities without a manually authored template.
-- Existing template IDs/versions remain intact for historical rows.
ALTER TABLE \`opportunity_generation_assignments\`
  MODIFY COLUMN \`templateId\` INT NULL,
  MODIFY COLUMN \`templateVersion\` INT NULL;
--> statement-breakpoint
-- This migration does not change the company catalogue, package records, customer
-- assignments, wallet, ledger, financial execution, or settlement records.
