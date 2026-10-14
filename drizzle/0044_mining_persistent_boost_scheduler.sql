CREATE TABLE IF NOT EXISTS mining_boost_preferences (
  userId INT NOT NULL PRIMARY KEY,
  autoActivateEnabled TINYINT(1) NOT NULL DEFAULT 1,
  scheduleStatus ENUM('ready','active','cooldown','disabled','unavailable') NOT NULL DEFAULT 'ready',
  lastActivationId INT NULL,
  lastActivationAt DATETIME(3) NULL,
  activeEndsAt DATETIME(3) NULL,
  nextEligibleAt DATETIME(3) NULL,
  lastCheckedAt DATETIME(3) NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_mining_boost_scheduler (autoActivateEnabled,nextEligibleAt),
  INDEX idx_mining_boost_active_end (activeEndsAt)
) ENGINE=InnoDB;

INSERT INTO mining_boost_preferences
  (userId,autoActivateEnabled,scheduleStatus,lastActivationId,lastActivationAt,activeEndsAt,nextEligibleAt,lastCheckedAt)
SELECT activation.userId,1,
  CASE WHEN activation.endsAt>UTC_TIMESTAMP(3) THEN 'active' WHEN activation.cycleExpiresAt>UTC_TIMESTAMP(3) THEN 'cooldown' ELSE 'ready' END,
  activation.id,activation.startedAt,IF(activation.endsAt>UTC_TIMESTAMP(3),activation.endsAt,NULL),activation.cycleExpiresAt,UTC_TIMESTAMP(3)
FROM mining_boost_activations activation
JOIN (
  SELECT userId,MAX(id) AS latestId
  FROM mining_boost_activations
  GROUP BY userId
) latest ON latest.userId=activation.userId AND latest.latestId=activation.id
ON DUPLICATE KEY UPDATE
  lastActivationId=VALUES(lastActivationId),
  lastActivationAt=VALUES(lastActivationAt),
  scheduleStatus=CASE WHEN VALUES(scheduleStatus)='active' THEN 'active' WHEN mining_boost_preferences.autoActivateEnabled=0 THEN 'disabled' ELSE VALUES(scheduleStatus) END,
  activeEndsAt=VALUES(activeEndsAt),
  nextEligibleAt=VALUES(nextEligibleAt),
  lastCheckedAt=VALUES(lastCheckedAt);
