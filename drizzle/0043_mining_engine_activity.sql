CREATE TABLE IF NOT EXISTS mining_engine_activity (
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
  UNIQUE KEY uq_mining_engine_activity_package_interval (customerPackageId, intervalStart, intervalEnd),
  INDEX idx_mining_engine_activity_user_date (userId, intervalEnd),
  INDEX idx_mining_engine_activity_settlement (settlementStatus, intervalEnd)
) ENGINE=InnoDB;
