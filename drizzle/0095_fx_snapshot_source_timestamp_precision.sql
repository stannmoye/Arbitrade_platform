-- Preserve the complete provider timestamp and offset in FX evidence snapshots.
-- Existing rows cannot recover already-truncated source dates; new writes retain the
-- exact provider value and rawJson evidence without changing ledger semantics.
ALTER TABLE `fx_rate_snapshots`
  MODIFY COLUMN `sourceDate` varchar(64) NULL;
