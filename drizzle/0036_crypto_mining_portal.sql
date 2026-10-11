CREATE TABLE IF NOT EXISTS mining_economics_versions (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  version INT NOT NULL UNIQUE,
  effectiveAt DATETIME(3) NOT NULL,
  globalEnabled TINYINT(1) NOT NULL DEFAULT 0,
  boostsEnabled TINYINT(1) NOT NULL DEFAULT 1,
  tokenUnitsPerUsd DECIMAL(36,18) NOT NULL DEFAULT 1000,
  rewardTokensPerThsHour DECIMAL(36,18) NOT NULL DEFAULT 0,
  swapFeeBps INT NOT NULL DEFAULT 0,
  purchaseFeeBps INT NOT NULL DEFAULT 0,
  minSwapTokens DECIMAL(36,18) NOT NULL DEFAULT 1,
  maxSwapTokens DECIMAL(36,18) NOT NULL DEFAULT 1000000,
  defaultAutoConversionThreshold DECIMAL(36,18) NOT NULL DEFAULT 0,
  boostCycleSeconds INT NOT NULL DEFAULT 14400,
  boostDurationSeconds INT NOT NULL DEFAULT 300,
  quoteTtlSeconds INT NOT NULL DEFAULT 90,
  fiatMaxAgeSeconds INT NOT NULL DEFAULT 172800,
  cryptoMaxAgeSeconds INT NOT NULL DEFAULT 900,
  maxRateDeviationBps INT NOT NULL DEFAULT 5000,
  dailyRewardCapTokens DECIMAL(36,18) NOT NULL DEFAULT 0,
  dualApprovalThresholdUsd DECIMAL(36,18) NOT NULL DEFAULT 100,
  updatedBy INT NULL,
  reason TEXT NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_mining_economics_effective (effectiveAt, version)
) ENGINE=InnoDB;

INSERT IGNORE INTO mining_economics_versions
  (version, effectiveAt, globalEnabled, boostsEnabled, tokenUnitsPerUsd, rewardTokensPerThsHour,
   swapFeeBps, purchaseFeeBps, minSwapTokens, maxSwapTokens, defaultAutoConversionThreshold,
   boostCycleSeconds, boostDurationSeconds, quoteTtlSeconds, fiatMaxAgeSeconds, cryptoMaxAgeSeconds,
   maxRateDeviationBps, dailyRewardCapTokens, dualApprovalThresholdUsd, reason)
VALUES
  (1, UTC_TIMESTAMP(3), 0, 1, 1000, 0, 0, 0, 1, 1000000, 0, 14400, 300, 90, 172800, 900,
   5000, 0, 100,
   'Simulation-only defaults. The 1,000 TOKEN per USD value is an illustrative platform reference, not a market price or redemption promise. Mining is paused until an administrator configures economics and publishes a package.');

CREATE TABLE IF NOT EXISTS mining_packages (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(48) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  status ENUM('draft','published','paused','retired') NOT NULL DEFAULT 'draft',
  currentVersionId INT NULL,
  createdBy INT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_mining_packages_status (status, updatedAt)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mining_package_versions (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  packageId INT NOT NULL,
  version INT NOT NULL,
  versionStatus ENUM('draft','published','retired') NOT NULL DEFAULT 'draft',
  priceAmount DECIMAL(36,18) NOT NULL,
  priceAsset VARCHAR(12) NOT NULL,
  baseThs DECIMAL(30,12) NOT NULL,
  boostBonusThs DECIMAL(30,12) NOT NULL DEFAULT 0,
  boostDurationSeconds INT NULL,
  maxPerCustomer INT NOT NULL DEFAULT 0,
  stackingPolicy ENUM('stack','replace') NOT NULL DEFAULT 'replace',
  expirySeconds INT NULL,
  termsText TEXT NOT NULL,
  simulationAcknowledgementRequired TINYINT(1) NOT NULL DEFAULT 1,
  effectiveAt DATETIME(3) NULL,
  createdBy INT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_mining_package_version (packageId, version),
  INDEX idx_mining_package_version_active (packageId, versionStatus, effectiveAt)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mining_customer_packages (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  packageId INT NOT NULL,
  packageVersionId INT NOT NULL,
  status ENUM('active','replaced','expired','cancelled') NOT NULL DEFAULT 'active',
  purchasedAt DATETIME(3) NOT NULL,
  startsAt DATETIME(3) NOT NULL,
  expiresAt DATETIME(3) NULL,
  endedAt DATETIME(3) NULL,
  baseThsSnapshot DECIMAL(30,12) NOT NULL,
  boostBonusThsSnapshot DECIMAL(30,12) NOT NULL,
  priceAmount DECIMAL(36,18) NOT NULL,
  priceAsset VARCHAR(12) NOT NULL,
  paymentAmount DECIMAL(36,18) NOT NULL,
  paymentAsset VARCHAR(12) NOT NULL,
  quoteId INT NULL,
  ledgerTransactionId INT NOT NULL,
  idempotencyKey VARCHAR(160) NOT NULL UNIQUE,
  termsSnapshot TEXT NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_mining_customer_packages_active (userId, status, startsAt, expiresAt),
  INDEX idx_mining_customer_packages_package (packageId, packageVersionId)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mining_checkpoints (
  userId INT NOT NULL PRIMARY KEY,
  lastAccruedAt DATETIME(3) NOT NULL,
  workerVersion VARCHAR(32) NOT NULL DEFAULT '1',
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mining_ledger_transactions (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId INT NULL,
  actorUserId INT NULL,
  transactionType VARCHAR(48) NOT NULL,
  status ENUM('posted','reversed','pending') NOT NULL DEFAULT 'posted',
  idempotencyKey VARCHAR(160) NOT NULL UNIQUE,
  referenceCode VARCHAR(72) NOT NULL UNIQUE,
  reversalOfId INT NULL UNIQUE,
  reason TEXT NULL,
  metadataJson LONGTEXT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_mining_ledger_user_date (userId, createdAt),
  INDEX idx_mining_ledger_type_date (transactionType, createdAt)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mining_reward_events (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  intervalStart DATETIME(3) NOT NULL,
  intervalEnd DATETIME(3) NOT NULL,
  baseThs DECIMAL(30,12) NOT NULL,
  boostThs DECIMAL(30,12) NOT NULL,
  rewardTokensPerThsHour DECIMAL(36,18) NOT NULL,
  tokenAmount DECIMAL(36,18) NOT NULL,
  configVersion INT NOT NULL,
  packageSnapshotJson LONGTEXT NOT NULL,
  idempotencyKey VARCHAR(160) NOT NULL UNIQUE,
  ledgerTransactionId INT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_mining_reward_interval (userId, intervalStart, intervalEnd),
  INDEX idx_mining_reward_user_date (userId, intervalEnd),
  INDEX idx_mining_reward_config (configVersion, intervalEnd)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mining_boost_activations (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  cycleStart DATETIME(3) NOT NULL,
  eligibleAt DATETIME(3) NOT NULL,
  cycleExpiresAt DATETIME(3) NOT NULL,
  startedAt DATETIME(3) NOT NULL,
  endsAt DATETIME(3) NOT NULL,
  bonusThs DECIMAL(30,12) NOT NULL,
  packageVersionId INT NOT NULL,
  status ENUM('active','expired','cancelled') NOT NULL DEFAULT 'active',
  idempotencyKey VARCHAR(160) NOT NULL UNIQUE,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_mining_boost_cycle (userId, cycleStart),
  INDEX idx_mining_boost_active (userId, status, endsAt)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mining_conversion_preferences (
  userId INT NOT NULL PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  targetDenomination VARCHAR(12) NOT NULL DEFAULT 'USD',
  minimumThreshold DECIMAL(36,18) NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mining_conversion_preference_versions (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  version INT NOT NULL,
  enabled TINYINT(1) NOT NULL,
  targetDenomination VARCHAR(12) NOT NULL,
  minimumThreshold DECIMAL(36,18) NOT NULL,
  effectiveAt DATETIME(3) NOT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_mining_preference_version (userId, version),
  INDEX idx_mining_preference_effective (userId, effectiveAt, version)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mining_conversion_jobs (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rewardEventId INT NOT NULL UNIQUE,
  userId INT NOT NULL,
  targetDenomination VARCHAR(12) NOT NULL,
  tokenAmount DECIMAL(36,18) NOT NULL,
  minimumThreshold DECIMAL(36,18) NOT NULL,
  preferenceVersion INT NOT NULL,
  status ENUM('queued','waiting','retrying','completed','failed') NOT NULL DEFAULT 'queued',
  attempts INT NOT NULL DEFAULT 0,
  availableAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  lastError VARCHAR(500) NULL,
  lastNotifiedAt DATETIME(3) NULL,
  conversionId INT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_mining_conversion_queue (status, availableAt, id),
  INDEX idx_mining_conversion_user (userId, createdAt)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mining_quote_snapshots (
  quoteId INT NOT NULL PRIMARY KEY,
  userId INT NOT NULL,
  purpose ENUM('manual_swap','package_purchase','auto_conversion') NOT NULL,
  packageVersionId INT NULL,
  tokenUnitsPerUsd DECIMAL(36,18) NOT NULL,
  sourceUsdRate DECIMAL(36,18) NOT NULL,
  targetUsdRate DECIMAL(36,18) NOT NULL,
  marketProvider VARCHAR(120) NOT NULL,
  marketObservedAt DATETIME(3) NOT NULL,
  targetScale INT NOT NULL,
  feeBps INT NOT NULL,
  roundingMode VARCHAR(24) NOT NULL DEFAULT 'down',
  detailsJson LONGTEXT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_mining_quote_user (userId, purpose, createdAt)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mining_adjustment_requests (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  assetCode VARCHAR(12) NOT NULL,
  amount DECIMAL(36,18) NOT NULL,
  direction ENUM('credit','debit') NOT NULL,
  reason TEXT NOT NULL,
  status ENUM('pending','posted','approved','rejected') NOT NULL DEFAULT 'pending',
  requestedBy INT NOT NULL,
  approvedBy INT NULL,
  ledgerTransactionId INT NULL,
  idempotencyKey VARCHAR(160) NOT NULL UNIQUE,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  resolvedAt DATETIME(3) NULL,
  INDEX idx_mining_adjustments_pending (status, createdAt),
  INDEX idx_mining_adjustments_user (userId, createdAt)
) ENGINE=InnoDB;

-- Seed zero-balance platform clearing/issuance wallets in the existing high-precision ledger.
-- Customer balances remain isolated from the legacy minor-unit wallet and are never payout balances.
CREATE TABLE IF NOT EXISTS mining_wallet_baselines (
  walletId INT NOT NULL PRIMARY KEY,
  assetCode VARCHAR(32) NOT NULL,
  openingAmount DECIMAL(36,18) NOT NULL,
  capturedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

INSERT INTO v5_wallets (userId, assetCode, availableAmount, lockedAmount, pendingAmount)
SELECT 0, 'TOKEN', '0', '0', '0' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM v5_wallets WHERE userId=0 AND assetCode='TOKEN');
INSERT INTO v5_wallets (userId, assetCode, availableAmount, lockedAmount, pendingAmount)
SELECT 0, 'CKI', '0', '0', '0' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM v5_wallets WHERE userId=0 AND assetCode='CKI');
INSERT INTO v5_wallets (userId, assetCode, availableAmount, lockedAmount, pendingAmount)
SELECT 0, 'USD', '0', '0', '0' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM v5_wallets WHERE userId=0 AND assetCode='USD');
INSERT INTO v5_wallets (userId, assetCode, availableAmount, lockedAmount, pendingAmount)
SELECT 0, 'EUR', '0', '0', '0' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM v5_wallets WHERE userId=0 AND assetCode='EUR');
INSERT INTO v5_wallets (userId, assetCode, availableAmount, lockedAmount, pendingAmount)
SELECT 0, 'GBP', '0', '0', '0' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM v5_wallets WHERE userId=0 AND assetCode='GBP');
INSERT INTO v5_wallets (userId, assetCode, availableAmount, lockedAmount, pendingAmount)
SELECT 0, 'BTC', '0', '0', '0' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM v5_wallets WHERE userId=0 AND assetCode='BTC');
INSERT INTO v5_wallets (userId, assetCode, availableAmount, lockedAmount, pendingAmount)
SELECT 0, 'ETH', '0', '0', '0' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM v5_wallets WHERE userId=0 AND assetCode='ETH');
INSERT INTO v5_wallets (userId, assetCode, availableAmount, lockedAmount, pendingAmount)
SELECT 0, 'USDT', '0', '0', '0' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM v5_wallets WHERE userId=0 AND assetCode='USDT');
