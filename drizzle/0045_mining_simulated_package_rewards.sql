-- Keep simulated estimate credits independently versioned from verified farm
-- settlement posting and from conversion/other global Mining controls.
ALTER TABLE mining_economics_versions
  ADD COLUMN IF NOT EXISTS simulatedRewardsEnabled TINYINT(1) NOT NULL DEFAULT 0 AFTER globalEnabled;

-- Start the approved simulated package-estimate mode from this migration's
-- effective time; do not reinterpret earlier economics versions as enabled.
CREATE TABLE IF NOT EXISTS mining_schema_migrations (
  migrationKey VARCHAR(120) NOT NULL PRIMARY KEY,
  detailsJson LONGTEXT NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

INSERT INTO mining_economics_versions
  (version,effectiveAt,globalEnabled,simulatedRewardsEnabled,packagePurchasesEnabled,boostsEnabled,tokenName,tokenSymbol,
   defaultContractDurationMonths,calculationModel,difficultyBaselineThs,tokenUnitsPerUsd,rewardTokensPerThsHour,swapFeeBps,
   purchaseFeeBps,minSwapTokens,maxSwapTokens,defaultAutoConversionThreshold,boostCycleSeconds,boostDurationSeconds,
   quoteTtlSeconds,fiatMaxAgeSeconds,cryptoMaxAgeSeconds,maxRateDeviationBps,dailyRewardCapTokens,dualApprovalThresholdUsd,
   updatedBy,reason)
SELECT
  (SELECT COALESCE(MAX(version),0)+1 FROM (SELECT version FROM mining_economics_versions) AS versions),
  UTC_TIMESTAMP(3),source.globalEnabled,1,source.packagePurchasesEnabled,source.boostsEnabled,source.tokenName,source.tokenSymbol,
  source.defaultContractDurationMonths,source.calculationModel,source.difficultyBaselineThs,source.tokenUnitsPerUsd,
  source.rewardTokensPerThsHour,source.swapFeeBps,source.purchaseFeeBps,source.minSwapTokens,source.maxSwapTokens,
  source.defaultAutoConversionThreshold,source.boostCycleSeconds,source.boostDurationSeconds,source.quoteTtlSeconds,
  source.fiatMaxAgeSeconds,source.cryptoMaxAgeSeconds,source.maxRateDeviationBps,source.dailyRewardCapTokens,
  source.dualApprovalThresholdUsd,NULL,
  'Enable simulated package-daily CKI estimate credits from this effective time; verified farm settlement posting remains separate.'
FROM mining_economics_versions AS source
WHERE source.id=(SELECT currentVersion.id FROM (SELECT id FROM mining_economics_versions WHERE effectiveAt<=UTC_TIMESTAMP(3) ORDER BY version DESC LIMIT 1) AS currentVersion)
  AND NOT EXISTS (SELECT 1 FROM mining_schema_migrations WHERE migrationKey='0045_mining_simulated_package_rewards')
  AND NOT EXISTS (SELECT 1 FROM mining_economics_versions WHERE simulatedRewardsEnabled=1 AND reason='Enable simulated package-daily CKI estimate credits from this effective time; verified farm settlement posting remains separate.');

INSERT INTO v5_audit_events (actorUserId,action,entityType,entityId,reason,reference,metadataJson)
SELECT NULL,'mining.economics.version.created','mining_economics_version',CAST(e.id AS CHAR),
  'Enable simulated package-daily CKI estimate credits from this effective time; verified farm settlement posting remains separate.',
  '0045_mining_simulated_package_rewards',
  JSON_OBJECT('simulatedRewardsEnabled',true,'globalEnabled',e.globalEnabled,'calculationModel','package_daily','retroactiveCredits',false)
FROM mining_economics_versions e
WHERE e.simulatedRewardsEnabled=1
  AND e.reason='Enable simulated package-daily CKI estimate credits from this effective time; verified farm settlement posting remains separate.'
  AND NOT EXISTS (SELECT 1 FROM v5_audit_events WHERE action='mining.economics.version.created' AND reference='0045_mining_simulated_package_rewards')
ORDER BY e.version DESC LIMIT 1;

INSERT IGNORE INTO mining_schema_migrations (migrationKey,detailsJson)
VALUES ('0045_mining_simulated_package_rewards','{"simulatedRewardsEnabled":true,"globalEnabled":false,"calculationModel":"package_daily","retroactiveCredits":false}');

-- Preserve the configured estimate of the exact immutable package version for
-- currently active/replaced customers whose snapshot was missing.
UPDATE mining_customer_packages cp
JOIN mining_package_versions v ON v.id=cp.packageVersionId
SET cp.expectedDailyRewardCkiSnapshot=v.expectedDailyRewardCki
WHERE cp.status IN ('active','replaced')
  AND cp.expectedDailyRewardCkiSnapshot IS NULL
  AND v.expectedDailyRewardCki IS NOT NULL;
