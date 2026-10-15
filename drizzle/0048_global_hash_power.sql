ALTER TABLE mining_economics_versions
  ADD COLUMN globalHashPowerThs DECIMAL(30,12) NOT NULL DEFAULT 0;

UPDATE mining_economics_versions
SET globalHashPowerThs = 67
WHERE globalHashPowerThs = 0;
