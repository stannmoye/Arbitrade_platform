-- The historical 0086 migration added defaulted NOT NULL bounds. Unconfigured
-- policy uses SQL NULL as its explicit sentinel; preserve existing saved values.
ALTER TABLE `opportunity_package_policies`
  MODIFY COLUMN `minimumTradeDurationSeconds` int NULL DEFAULT NULL,
  MODIFY COLUMN `maximumTradeDurationSeconds` int NULL DEFAULT NULL;
