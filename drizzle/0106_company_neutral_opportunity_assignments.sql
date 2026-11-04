-- Allow an informational opportunity to be generated when no company identity
-- currently passes the administrator display-approval and country filters.
-- Existing company identities remain unchanged; this is not a catalogue rewrite.
ALTER TABLE `opportunity_generation_assignments`
  MODIFY COLUMN `companyReferenceId` VARCHAR(32) NULL;
