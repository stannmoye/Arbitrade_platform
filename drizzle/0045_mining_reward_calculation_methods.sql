-- Add administrator-controlled Method A / Method B settings and immutable per-contract snapshots.
-- This migration adds columns only; it does not rewrite existing contract terms, wallets, or ledgers.
SET @has_cki_per_ths_per_day = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'mining_economics_versions'
    AND column_name = 'ckiPerThsPerDay'
);
SET @add_cki_per_ths_per_day = IF(
  @has_cki_per_ths_per_day = 0,
  'ALTER TABLE mining_economics_versions ADD COLUMN ckiPerThsPerDay DECIMAL(36,18) NOT NULL DEFAULT 0 AFTER difficultyBaselineThs',
  'SELECT 1'
);
PREPARE mining_reward_method_stmt FROM @add_cki_per_ths_per_day;
EXECUTE mining_reward_method_stmt;
DEALLOCATE PREPARE mining_reward_method_stmt;

SET @has_contract_calculation_model = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'mining_customer_packages'
    AND column_name = 'calculationModelSnapshot'
);
SET @add_contract_calculation_model = IF(
  @has_contract_calculation_model = 0,
  'ALTER TABLE mining_customer_packages ADD COLUMN calculationModelSnapshot VARCHAR(32) NOT NULL DEFAULT ''legacy_boost_daily'' AFTER expectedDailyRewardCkiSnapshot',
  'SELECT 1'
);
PREPARE mining_contract_model_stmt FROM @add_contract_calculation_model;
EXECUTE mining_contract_model_stmt;
DEALLOCATE PREPARE mining_contract_model_stmt;

SET @has_contract_production_snapshot = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'mining_customer_packages'
    AND column_name = 'ckiPerThsPerDaySnapshot'
);
SET @add_contract_production_snapshot = IF(
  @has_contract_production_snapshot = 0,
  'ALTER TABLE mining_customer_packages ADD COLUMN ckiPerThsPerDaySnapshot DECIMAL(36,18) NULL AFTER calculationModelSnapshot',
  'SELECT 1'
);
PREPARE mining_contract_production_stmt FROM @add_contract_production_snapshot;
EXECUTE mining_contract_production_stmt;
DEALLOCATE PREPARE mining_contract_production_stmt;
