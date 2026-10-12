-- A zero-charge admin grant is an entitlement, not a wallet transaction.
-- Preserve the package's listed price for reference, but allow no payment ledger link.
ALTER TABLE mining_customer_packages
  MODIFY COLUMN ledgerTransactionId INT NULL;

SET @has_acquisition_type = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'mining_customer_packages'
    AND column_name = 'acquisitionType'
);
SET @add_acquisition_type = IF(
  @has_acquisition_type = 0,
  'ALTER TABLE mining_customer_packages ADD COLUMN acquisitionType ENUM(''purchase'',''admin_grant'') NOT NULL DEFAULT ''purchase'' AFTER packageVersionId',
  'SELECT 1'
);
PREPARE mining_grant_schema_stmt FROM @add_acquisition_type;
EXECUTE mining_grant_schema_stmt;
DEALLOCATE PREPARE mining_grant_schema_stmt;
