-- CoinKi formula-based package rewards. No external mining-pool settlement is used.
-- Per UTC reward day, each package is capped at its configured daily CKI limit:
-- daily_limit_CKI * eligible_active_seconds / 86,400.
-- Boost hash changes capacity only; it does not raise the package reward limit.

START TRANSACTION;

SET @mining_reward_terms = 'This package is a formula-based CoinKi (CKI) reward entitlement. Its published CKI amount is the maximum for a full 24-hour UTC reward day; accrual is calculated as daily maximum × eligible active seconds ÷ 86,400 and is capped per purchased package per UTC day. CKI is credited to the internal database-backed CKI balance and may be converted through the internal swap feature under its current terms. This formula is not measured or verified against a third-party mining pool and is not a guaranteed return. The calculation is simulated from package terms; CKI is not directly withdrawable and there is no cash payout.';

-- Preserve existing economics and append one effective version with formula rewards enabled.
INSERT INTO mining_economics_versions
  (version,effectiveAt,globalEnabled,packagePurchasesEnabled,boostsEnabled,tokenName,tokenSymbol,
   defaultContractDurationMonths,calculationModel,difficultyBaselineThs,tokenUnitsPerUsd,rewardTokensPerThsHour,
   swapFeeBps,purchaseFeeBps,minSwapTokens,maxSwapTokens,defaultAutoConversionThreshold,
   boostCycleSeconds,boostDurationSeconds,quoteTtlSeconds,fiatMaxAgeSeconds,cryptoMaxAgeSeconds,
   maxRateDeviationBps,dailyRewardCapTokens,dualApprovalThresholdUsd,updatedBy,reason)
SELECT
  (SELECT COALESCE(MAX(version),0)+1 FROM mining_economics_versions),UTC_TIMESTAMP(3),1,1,1,
  e.tokenName,e.tokenSymbol,24,'package_daily',e.difficultyBaselineThs,e.tokenUnitsPerUsd,e.rewardTokensPerThsHour,
  e.swapFeeBps,e.purchaseFeeBps,e.minSwapTokens,e.maxSwapTokens,e.defaultAutoConversionThreshold,
  600,120,e.quoteTtlSeconds,e.fiatMaxAgeSeconds,e.cryptoMaxAgeSeconds,e.maxRateDeviationBps,0,
  e.dualApprovalThresholdUsd,NULL,
  'Enable internal CKI formula rewards; per-package daily maximum prorated by eligible active seconds/86,400, capped per package and UTC day. Boosts do not increase reward limits.'
FROM mining_economics_versions AS e
WHERE e.effectiveAt<=UTC_TIMESTAMP(3)
  AND NOT EXISTS (SELECT 1 FROM mining_schema_migrations WHERE migrationKey='0045_cki_reward_schedule_activation')
ORDER BY e.version DESC
LIMIT 1;

-- Ensure the six established catalogue entries exist. Existing identifiers are preserved.
INSERT INTO mining_packages (code,name,displayOrder,status)
VALUES
  ('CKI_GENESIS','CKI Genesis',1,'draft'),
  ('CKI_VELOCITY','CKI Velocity',2,'draft'),
  ('CKI_QUANTUM','CKI Quantum',3,'draft'),
  ('CKI_TITAN','CKI Titan',4,'draft'),
  ('CKI_INFINITY','CKI Infinity',5,'draft'),
  ('CKI_SINGULARITY','CKI Singularity',6,'draft')
ON DUPLICATE KEY UPDATE code=VALUES(code);

-- Publish a new version only when the current published version does not match the supplied settings.
INSERT INTO mining_package_versions
  (packageId,version,displayName,versionStatus,priceAmount,priceAsset,baseThs,boostBonusThs,
   boostDurationSeconds,maxPerCustomer,stackingPolicy,expirySeconds,durationMonths,expectedDailyRewardCki,
   termsText,simulationAcknowledgementRequired,effectiveAt,createdBy)
SELECT p.id,
  (SELECT COALESCE(MAX(v2.version),0)+1 FROM mining_package_versions v2 WHERE v2.packageId=p.id),
  s.displayName,'published',s.priceAmount,'USD',s.baseThs,0,120,
  COALESCE(currentVersion.maxPerCustomer,1),COALESCE(currentVersion.stackingPolicy,'replace'),NULL,24,s.dailyLimit,
  @mining_reward_terms,1,UTC_TIMESTAMP(3),NULL
FROM (
  SELECT 'CKI_GENESIS' code,'CKI Genesis' displayName,100.00 priceAmount,1.000000000000 baseThs,0.100000000000000000 dailyLimit
  UNION ALL SELECT 'CKI_VELOCITY','CKI Velocity',300.00,3.000000000000,0.300000000000000000
  UNION ALL SELECT 'CKI_QUANTUM','CKI Quantum',600.00,7.000000000000,0.700000000000000000
  UNION ALL SELECT 'CKI_TITAN','CKI Titan',1200.00,16.000000000000,1.600000000000000000
  UNION ALL SELECT 'CKI_INFINITY','CKI Infinity',2500.00,40.000000000000,4.000000000000000000
  UNION ALL SELECT 'CKI_SINGULARITY','CKI Singularity',5000.00,80.000000000000,8.000000000000000000
) AS s
JOIN mining_packages AS p ON p.code=s.code
LEFT JOIN mining_package_versions AS currentVersion ON currentVersion.id=p.currentVersionId
WHERE NOT EXISTS (SELECT 1 FROM mining_schema_migrations WHERE migrationKey='0045_cki_reward_schedule_activation')
  AND (
    currentVersion.id IS NULL OR currentVersion.versionStatus<>'published' OR NOT (
      currentVersion.displayName <=> s.displayName
      AND currentVersion.priceAmount <=> s.priceAmount
      AND currentVersion.priceAsset <=> 'USD'
      AND currentVersion.baseThs <=> s.baseThs
      AND currentVersion.durationMonths <=> 24
      AND currentVersion.expectedDailyRewardCki <=> s.dailyLimit
      AND currentVersion.boostBonusThs <=> 0
      AND currentVersion.boostDurationSeconds <=> 120
      AND currentVersion.termsText <=> @mining_reward_terms
      AND currentVersion.simulationAcknowledgementRequired=1
    )
  );

-- Make the six configured offers available for purchase with their published versions.
UPDATE mining_packages AS p
JOIN (
  SELECT 'CKI_GENESIS' code,'CKI Genesis' displayName,1 displayOrder
  UNION ALL SELECT 'CKI_VELOCITY','CKI Velocity',2
  UNION ALL SELECT 'CKI_QUANTUM','CKI Quantum',3
  UNION ALL SELECT 'CKI_TITAN','CKI Titan',4
  UNION ALL SELECT 'CKI_INFINITY','CKI Infinity',5
  UNION ALL SELECT 'CKI_SINGULARITY','CKI Singularity',6
) AS s ON s.code=p.code
JOIN (
  SELECT packageId,MAX(version) version FROM mining_package_versions
  WHERE versionStatus='published' GROUP BY packageId
) AS latest ON latest.packageId=p.id
JOIN mining_package_versions AS v ON v.packageId=latest.packageId AND v.version=latest.version
SET p.name=s.displayName,p.displayOrder=s.displayOrder,p.status='published',p.currentVersionId=v.id,p.updatedAt=UTC_TIMESTAMP(3)
WHERE NOT EXISTS (SELECT 1 FROM mining_schema_migrations WHERE migrationKey='0045_cki_reward_schedule_activation');

-- Existing active entitlements with an unset daily snapshot inherit the schedule supplied by the user.
-- Existing non-null snapshots and all historic reward ledger rows are preserved.
UPDATE mining_customer_packages AS cp
JOIN mining_packages AS p ON p.id=cp.packageId
JOIN (
  SELECT 'CKI_GENESIS' code,0.100000000000000000 dailyLimit
  UNION ALL SELECT 'CKI_VELOCITY',0.300000000000000000
  UNION ALL SELECT 'CKI_QUANTUM',0.700000000000000000
  UNION ALL SELECT 'CKI_TITAN',1.600000000000000000
  UNION ALL SELECT 'CKI_INFINITY',4.000000000000000000
  UNION ALL SELECT 'CKI_SINGULARITY',8.000000000000000000
) AS s ON s.code=p.code
SET cp.expectedDailyRewardCkiSnapshot=s.dailyLimit
WHERE NOT EXISTS (SELECT 1 FROM mining_schema_migrations WHERE migrationKey='0045_cki_reward_schedule_activation')
  AND cp.expectedDailyRewardCkiSnapshot IS NULL
  AND cp.status IN ('active','replaced')
  AND cp.startsAt<=UTC_TIMESTAMP(3)
  AND (cp.expiresAt IS NULL OR cp.expiresAt>UTC_TIMESTAMP(3))
  AND (cp.endedAt IS NULL OR cp.endedAt>UTC_TIMESTAMP(3));

-- Audit the enabled economics version and record the migration for safe re-imports.
INSERT INTO v5_audit_events (actorUserId,action,entityType,entityId,reason,reference,metadataJson)
SELECT NULL,'mining.economics.version.created','mining_economics_version',CAST(e.version AS CHAR),e.reason,
  '0045_cki_reward_schedule_activation',
  JSON_OBJECT('version',e.version,'globalEnabled',true,'packagePurchasesEnabled',true,'calculationModel','package_daily',
    'formula','dailyLimitCki * eligibleActiveSeconds / 86400 UTC seconds','dailyRewardCapTokens','0',
    'boostPercent',20,'boostDurationSeconds',120,'cooldownSecondsAfterExpiry',600,
    'packages',JSON_ARRAY('CKI_GENESIS','CKI_VELOCITY','CKI_QUANTUM','CKI_TITAN','CKI_INFINITY','CKI_SINGULARITY'))
FROM mining_economics_versions e
WHERE e.reason='Enable internal CKI formula rewards; per-package daily maximum prorated by eligible active seconds/86,400, capped per package and UTC day. Boosts do not increase reward limits.'
  AND NOT EXISTS (SELECT 1 FROM mining_schema_migrations WHERE migrationKey='0045_cki_reward_schedule_activation')
ORDER BY e.version DESC LIMIT 1;

INSERT IGNORE INTO mining_schema_migrations (migrationKey,detailsJson)
VALUES ('0045_cki_reward_schedule_activation',
  '{"formula":"dailyLimitCki * eligibleActiveSeconds / 86400 UTC seconds","rewardDay":"UTC","globalEnabled":true,"packagePurchasesEnabled":true,"boostPercent":20,"boostDurationSeconds":120,"cooldownSecondsAfterExpiry":600,"boostRaisesDailyRewardCap":false,"packages":[{"code":"CKI_GENESIS","priceUSD":"100.00","baseTHs":"1","dailyLimitCKI":"0.10"},{"code":"CKI_VELOCITY","priceUSD":"300.00","baseTHs":"3","dailyLimitCKI":"0.30"},{"code":"CKI_QUANTUM","priceUSD":"600.00","baseTHs":"7","dailyLimitCKI":"0.70"},{"code":"CKI_TITAN","priceUSD":"1200.00","baseTHs":"16","dailyLimitCKI":"1.60"},{"code":"CKI_INFINITY","priceUSD":"2500.00","baseTHs":"40","dailyLimitCKI":"4.00"},{"code":"CKI_SINGULARITY","priceUSD":"5000.00","baseTHs":"80","dailyLimitCKI":"8.00"}]}');

COMMIT;
