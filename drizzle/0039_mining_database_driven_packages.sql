ALTER TABLE mining_economics_versions
  ADD COLUMN IF NOT EXISTS defaultContractDurationMonths INT NOT NULL DEFAULT 24 AFTER tokenSymbol;

ALTER TABLE mining_packages
  ADD COLUMN IF NOT EXISTS displayOrder INT NOT NULL DEFAULT 0 AFTER name;

ALTER TABLE mining_package_versions
  ADD COLUMN IF NOT EXISTS displayName VARCHAR(120) NULL AFTER version,
  ADD COLUMN IF NOT EXISTS durationMonths INT NULL AFTER expirySeconds;

ALTER TABLE mining_customer_packages
  ADD COLUMN IF NOT EXISTS packageNameSnapshot VARCHAR(120) NULL AFTER packageId,
  ADD COLUMN IF NOT EXISTS durationMonthsSnapshot INT NULL AFTER status;

UPDATE mining_package_versions v
JOIN mining_packages p ON p.id = v.packageId
SET v.displayName = p.name
WHERE v.displayName IS NULL;

UPDATE mining_customer_packages cp
JOIN mining_packages p ON p.id = cp.packageId
JOIN mining_package_versions v ON v.id = cp.packageVersionId
SET cp.packageNameSnapshot = COALESCE(v.displayName, p.name)
WHERE cp.packageNameSnapshot IS NULL;

UPDATE mining_customer_packages cp
JOIN mining_package_versions v ON v.id = cp.packageVersionId
SET cp.durationMonthsSnapshot = COALESCE(v.durationMonths, ROUND(v.expirySeconds / 2629800))
WHERE cp.durationMonthsSnapshot IS NULL AND (v.durationMonths IS NOT NULL OR v.expirySeconds IS NOT NULL);
