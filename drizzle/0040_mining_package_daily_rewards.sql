ALTER TABLE mining_economics_versions
  ADD COLUMN IF NOT EXISTS calculationModel VARCHAR(32) NOT NULL DEFAULT 'package_daily' AFTER defaultContractDurationMonths,
  ADD COLUMN IF NOT EXISTS difficultyBaselineThs DECIMAL(30,12) NOT NULL DEFAULT 100 AFTER calculationModel;

ALTER TABLE mining_package_versions
  ADD COLUMN IF NOT EXISTS expectedDailyRewardCki DECIMAL(36,18) NULL AFTER durationMonths;

ALTER TABLE mining_customer_packages
  ADD COLUMN IF NOT EXISTS expectedDailyRewardCkiSnapshot DECIMAL(36,18) NULL AFTER durationMonthsSnapshot;

ALTER TABLE mining_boost_activations
  ADD COLUMN IF NOT EXISTS customerPackageId INT NULL AFTER packageVersionId;

ALTER TABLE mining_reward_events
  ADD COLUMN IF NOT EXISTS expectedDailyRewardCki DECIMAL(36,18) NULL AFTER rewardTokensPerThsHour,
  ADD COLUMN IF NOT EXISTS rewardAmountUsd DECIMAL(36,18) NOT NULL DEFAULT 0 AFTER tokenAmount,
  ADD COLUMN IF NOT EXISTS calculationModel VARCHAR(32) NOT NULL DEFAULT 'package_daily' AFTER configVersion;

CREATE TABLE IF NOT EXISTS mining_reward_package_allocations (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rewardEventId INT NOT NULL,
  userId INT NOT NULL,
  customerPackageId INT NOT NULL,
  packageId INT NOT NULL,
  packageVersionId INT NOT NULL,
  intervalStart DATETIME(3) NOT NULL,
  intervalEnd DATETIME(3) NOT NULL,
  expectedDailyRewardCkiSnapshot DECIMAL(36,18) NULL,
  rewardAmountCki DECIMAL(36,18) NOT NULL,
  tokenUnitsPerUsdSnapshot DECIMAL(36,18) NOT NULL,
  rewardAmountUsdSnapshot DECIMAL(36,18) NOT NULL,
  calculationModel VARCHAR(32) NOT NULL,
  calculationSegmentsJson LONGTEXT NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_mining_reward_allocation_event_package (rewardEventId,customerPackageId),
  UNIQUE KEY uq_mining_reward_allocation_contract_interval (userId,customerPackageId,intervalStart,intervalEnd),
  INDEX idx_mining_reward_allocation_contract (customerPackageId,intervalEnd),
  INDEX idx_mining_reward_allocation_package (packageId,packageVersionId,intervalEnd)
) ENGINE=InnoDB;
