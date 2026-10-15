import mysql from "mysql2/promise";

const raw = process.env.DATABASE_URL;
if (!raw) throw new Error("DATABASE_URL is required");
const url = new URL(raw);
if (!["mysql:", "mariadb:"].includes(url.protocol)) throw new Error("DATABASE_URL must use mysql:// or mariadb://");
if (url.protocol === "mariadb:") url.protocol = "mysql:";
url.searchParams.set("timezone", "Z");
const db = await mysql.createConnection(url.toString());

async function hasColumn(table, column) {
  const [rows] = await db.query(
    "SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=? LIMIT 1",
    [table, column],
  );
  return rows.length > 0;
}

async function addColumn(table, column, definition) {
  if (!(await hasColumn(table, column))) {
    await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    console.log(`Added ${table}.${column}`);
  }
}

try {
  await db.query(`CREATE TABLE IF NOT EXISTS mining_schema_migrations (
    migrationKey VARCHAR(120) NOT NULL PRIMARY KEY,
    detailsJson LONGTEXT NULL,
    createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB`);

  await addColumn("mining_economics_versions", "tokenName", "VARCHAR(64) NOT NULL DEFAULT 'CoinKi'");
  await addColumn("mining_economics_versions", "tokenSymbol", "VARCHAR(16) NOT NULL DEFAULT 'CKI'");
  await addColumn("mining_economics_versions", "defaultContractDurationMonths", "INT NOT NULL DEFAULT 24");
  await addColumn("mining_economics_versions", "calculationModel", "VARCHAR(32) NOT NULL DEFAULT 'package_daily'");
  await addColumn("mining_economics_versions", "difficultyBaselineThs", "DECIMAL(30,12) NOT NULL DEFAULT 100");
  await addColumn("mining_economics_versions", "ckiPerThsPerDay", "DECIMAL(36,18) NOT NULL DEFAULT 0");
  await addColumn("mining_economics_versions", "packagePurchasesEnabled", "TINYINT(1) NOT NULL DEFAULT 0");
  await addColumn("mining_economics_versions", "boostRewardCkiPerDay", "DECIMAL(36,18) NOT NULL DEFAULT 0");
  await addColumn("mining_economics_versions", "boostActivationBonusCki", "DECIMAL(36,18) NOT NULL DEFAULT 0");
  await addColumn("mining_economics_versions", "globalHashPowerThs", "DECIMAL(30,12) NOT NULL DEFAULT 0");
  await db.query(`UPDATE mining_economics_versions SET globalHashPowerThs=67 WHERE globalHashPowerThs=0`);

  await addColumn("mining_packages", "displayOrder", "INT NOT NULL DEFAULT 0");
  await addColumn("mining_package_versions", "displayName", "VARCHAR(120) NULL");
  await addColumn("mining_package_versions", "durationMonths", "INT NULL");
  await addColumn("mining_package_versions", "expectedDailyRewardCki", "DECIMAL(36,18) NULL");

  await addColumn("mining_customer_packages", "packageNameSnapshot", "VARCHAR(120) NULL");
  await addColumn("mining_customer_packages", "durationMonthsSnapshot", "INT NULL");
  await addColumn("mining_customer_packages", "expectedDailyRewardCkiSnapshot", "DECIMAL(36,18) NULL");
  await addColumn("mining_customer_packages", "calculationModelSnapshot", "VARCHAR(32) NOT NULL DEFAULT 'legacy_boost_daily'");
  await addColumn("mining_customer_packages", "ckiPerThsPerDaySnapshot", "DECIMAL(36,18) NULL");
  await addColumn("mining_boost_activations", "customerPackageId", "INT NULL");

  await addColumn("mining_reward_events", "expectedDailyRewardCki", "DECIMAL(36,18) NULL");
  await addColumn("mining_reward_events", "rewardAmountUsd", "DECIMAL(36,18) NOT NULL DEFAULT 0");
  await addColumn("mining_reward_events", "calculationModel", "VARCHAR(32) NOT NULL DEFAULT 'package_daily'");

  await db.query(`CREATE TABLE IF NOT EXISTS mining_package_purchase_claims (
    userId INT NOT NULL,
    packageId INT NOT NULL,
    firstPurchaseId INT NULL,
    firstQuoteId INT NULL,
    claimedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (userId,packageId),
    UNIQUE KEY uq_mining_package_claim_purchase (firstPurchaseId),
    UNIQUE KEY uq_mining_package_claim_quote (firstQuoteId),
    INDEX idx_mining_package_claim_package (packageId,claimedAt)
  ) ENGINE=InnoDB`);

  await db.query(`CREATE TABLE IF NOT EXISTS mining_reward_package_allocations (
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
  ) ENGINE=InnoDB`);

  await db.query(`CREATE TABLE IF NOT EXISTS mining_engine_activity (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    userId INT NOT NULL,
    customerPackageId INT NOT NULL,
    packageId INT NOT NULL,
    packageVersionId INT NOT NULL,
    intervalStart DATETIME(3) NOT NULL,
    intervalEnd DATETIME(3) NOT NULL,
    baseThsSnapshot DECIMAL(30,12) NOT NULL,
    boostThsSnapshot DECIMAL(30,12) NOT NULL DEFAULT 0,
    eligibleSeconds DECIMAL(12,3) NOT NULL,
    economicsVersion INT NOT NULL,
    settlementStatus VARCHAR(32) NOT NULL DEFAULT 'awaiting_settlement',
    createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_mining_engine_activity_package_interval (customerPackageId,intervalStart,intervalEnd),
    INDEX idx_mining_engine_activity_user_date (userId,intervalEnd),
    INDEX idx_mining_engine_activity_settlement (settlementStatus,intervalEnd)
  ) ENGINE=InnoDB`);

  await db.query(`UPDATE mining_package_versions SET displayName=(SELECT name FROM mining_packages p WHERE p.id=mining_package_versions.packageId) WHERE displayName IS NULL`);
  await db.query(`UPDATE mining_customer_packages cp JOIN mining_packages p ON p.id=cp.packageId JOIN mining_package_versions v ON v.id=cp.packageVersionId SET cp.packageNameSnapshot=COALESCE(v.displayName,p.name) WHERE cp.packageNameSnapshot IS NULL`);
  await db.query(`UPDATE mining_customer_packages cp JOIN mining_package_versions v ON v.id=cp.packageVersionId SET cp.durationMonthsSnapshot=COALESCE(v.durationMonths,ROUND(v.expirySeconds/2629800)) WHERE cp.durationMonthsSnapshot IS NULL AND (v.durationMonths IS NOT NULL OR v.expirySeconds IS NOT NULL)`);
  await db.query(`UPDATE mining_package_versions SET durationMonths=24 WHERE durationMonths IS NULL`);
  await db.query(`UPDATE mining_customer_packages SET durationMonthsSnapshot=24 WHERE durationMonthsSnapshot IS NULL`);
  await db.query(`UPDATE mining_economics_versions SET tokenName='CoinKi' WHERE tokenName IS NULL OR tokenName=''`);
  await db.query(`UPDATE mining_economics_versions SET tokenSymbol='CKI' WHERE tokenSymbol IS NULL OR tokenSymbol=''`);
  await db.query(`UPDATE mining_customer_packages cp JOIN mining_packages p ON p.id=cp.packageId JOIN mining_package_versions v ON v.id=p.currentVersionId SET cp.expectedDailyRewardCkiSnapshot=v.expectedDailyRewardCki, cp.calculationModelSnapshot='package_daily' WHERE cp.expectedDailyRewardCkiSnapshot IS NULL AND v.expectedDailyRewardCki IS NOT NULL`);

  console.log(JSON.stringify({ status: "ok", message: "Current mining schema is ready" }));
} finally {
  await db.end();
}
