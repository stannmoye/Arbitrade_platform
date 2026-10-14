-- Boost policy: 20% of the customer's active purchased TH/s, active for 120 seconds,
-- followed by a 600-second cooldown. The application applies the 20% formula.
-- Preserve immutable historical economics versions; append one effective version.
INSERT INTO mining_economics_versions
  (version,effectiveAt,globalEnabled,packagePurchasesEnabled,boostsEnabled,tokenName,tokenSymbol,
   defaultContractDurationMonths,calculationModel,difficultyBaselineThs,tokenUnitsPerUsd,rewardTokensPerThsHour,
   swapFeeBps,purchaseFeeBps,minSwapTokens,maxSwapTokens,defaultAutoConversionThreshold,
   boostCycleSeconds,boostDurationSeconds,quoteTtlSeconds,fiatMaxAgeSeconds,cryptoMaxAgeSeconds,
   maxRateDeviationBps,dailyRewardCapTokens,dualApprovalThresholdUsd,updatedBy,reason)
SELECT
  (SELECT COALESCE(MAX(version),0)+1 FROM mining_economics_versions), UTC_TIMESTAMP(3),
  e.globalEnabled,e.packagePurchasesEnabled,1,e.tokenName,e.tokenSymbol,
  e.defaultContractDurationMonths,e.calculationModel,e.difficultyBaselineThs,
  e.tokenUnitsPerUsd,e.rewardTokensPerThsHour,e.swapFeeBps,e.purchaseFeeBps,
  e.minSwapTokens,e.maxSwapTokens,e.defaultAutoConversionThreshold,
  600,120,e.quoteTtlSeconds,e.fiatMaxAgeSeconds,e.cryptoMaxAgeSeconds,
  e.maxRateDeviationBps,e.dailyRewardCapTokens,e.dualApprovalThresholdUsd,
  NULL,'Set Mining boost to +20% of active purchased TH/s for 120 seconds, then a 600-second cooldown after the boost expires.'
FROM mining_economics_versions AS e
WHERE e.effectiveAt<=UTC_TIMESTAMP(3)
  AND NOT EXISTS (
    SELECT 1 FROM mining_schema_migrations
    WHERE migrationKey='0044_mining_boost_capacity_cycle'
  )
ORDER BY e.version DESC
LIMIT 1;

INSERT IGNORE INTO mining_schema_migrations (migrationKey,detailsJson)
VALUES ('0044_mining_boost_capacity_cycle','{"boostPercent":20,"boostDurationSeconds":120,"cooldownSecondsAfterExpiry":600}');
