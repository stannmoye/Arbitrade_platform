ALTER TABLE mining_economics_versions
  ADD COLUMN boostRewardCkiPerDay DECIMAL(36,18) NOT NULL DEFAULT 0 AFTER boostDurationSeconds,
  ADD COLUMN boostActivationBonusCki DECIMAL(36,18) NOT NULL DEFAULT 0 AFTER boostRewardCkiPerDay;

-- Existing contracts that predate package-daily CKI keep their package's current configured rate
-- as an explicit snapshot so the reward worker can settle them without changing other customers.
UPDATE mining_customer_packages cp
JOIN mining_packages p ON p.id=cp.packageId
JOIN mining_package_versions v ON v.id=p.currentVersionId
SET cp.expectedDailyRewardCkiSnapshot=COALESCE(cp.expectedDailyRewardCkiSnapshot,v.expectedDailyRewardCki),
    cp.calculationModelSnapshot=CASE WHEN cp.calculationModelSnapshot IS NULL OR cp.calculationModelSnapshot='legacy_boost_daily' THEN 'package_daily' ELSE cp.calculationModelSnapshot END
WHERE cp.expectedDailyRewardCkiSnapshot IS NULL AND v.expectedDailyRewardCki IS NOT NULL;
