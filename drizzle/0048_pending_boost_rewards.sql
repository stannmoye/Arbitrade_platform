-- Keep boost earnings in today's CKI reward total until the UTC day closes.
CREATE TABLE IF NOT EXISTS mining_pending_boost_rewards (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  rewardEventId INT NOT NULL,
  rewardDay DATE NOT NULL,
  amountCki DECIMAL(36,18) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  settledAt DATETIME(3) NULL,
  settlementReference VARCHAR(120) NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_pending_boost_reward_event (rewardEventId),
  UNIQUE KEY uq_pending_boost_settlement_reference (settlementReference),
  INDEX idx_pending_boost_day_status (rewardDay,status,userId)
) ENGINE=InnoDB;
