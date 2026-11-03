-- Package-specific append-only fee policy versions and immutable allocation snapshots.
-- The compatibility baseline is copied from existing, validated global settings only.
CREATE TABLE IF NOT EXISTS `trading_package_fee_policy_versions` (
  `packageId` INT NOT NULL,
  `version` INT NOT NULL,
  `feeRateBps` INT NOT NULL,
  `roundingMode` VARCHAR(20) NOT NULL,
  `effectiveAt` DATETIME(3) NOT NULL,
  `changedBy` VARCHAR(80) NOT NULL,
  `changedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reason` TEXT NOT NULL,
  `source` VARCHAR(80) NOT NULL,
  PRIMARY KEY (`packageId`, `version`),
  KEY `trading_package_fee_policy_effective_idx` (`packageId`, `effectiveAt`, `version`),
  CONSTRAINT `trading_package_fee_rate_range_chk` CHECK (`feeRateBps` BETWEEN 0 AND 10000),
  CONSTRAINT `trading_package_fee_rounding_mode_chk` CHECK (`roundingMode` IN ('half_up','down','up','half_even'))
);
--> statement-breakpoint
ALTER TABLE `trade_positions`
  ADD COLUMN IF NOT EXISTS `packageIdSnapshot` INT NULL,
  ADD COLUMN IF NOT EXISTS `packageFeeRateBpsSnapshot` INT NULL,
  ADD COLUMN IF NOT EXISTS `packageFeeRoundingModeSnapshot` VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS `packageFeePolicyVersionSnapshot` INT NULL,
  ADD COLUMN IF NOT EXISTS `packageFeeEffectiveAtSnapshot` DATETIME(3) NULL;
--> statement-breakpoint
-- For each package without a baseline, the SELECT deliberately yields NULL for any
-- absent/invalid legacy source. NOT NULL/CHECK constraints then abort the migration
-- instead of silently assigning defaults when packages exist.
INSERT INTO `trading_package_fee_policy_versions`
  (`packageId`,`version`,`feeRateBps`,`roundingMode`,`effectiveAt`,`changedBy`,`changedAt`,`reason`,`source`)
SELECT
  p.`id`,
  1,
  CASE
    WHEN r.`settingValue` REGEXP '^(0|[1-9][0-9]{0,4})$' AND CAST(r.`settingValue` AS UNSIGNED) <= 10000
      THEN CAST(r.`settingValue` AS UNSIGNED)
    ELSE 10001
  END,
  CASE WHEN m.`settingValue` IN ('half_up','down','up','half_even') THEN m.`settingValue` ELSE '__invalid__' END,
  UTC_TIMESTAMP(3),
  'migration:0101',
  UTC_TIMESTAMP(3),
  'Behavior-preserving baseline copied from the validated legacy global Trading fee policy.',
  'legacy_global_baseline_0101'
FROM `packages` p
LEFT JOIN `app_settings` r ON r.`settingKey`='trade.platformFeeBps'
LEFT JOIN `app_settings` m ON m.`settingKey`='trade.feeRoundingMode'
LEFT JOIN `trading_package_fee_policy_versions` existing
  ON existing.`packageId`=p.`id` AND existing.`version`=1
WHERE existing.`packageId` IS NULL;
--> statement-breakpoint
INSERT INTO `v5_audit_events`
  (`actorUserId`,`action`,`entityType`,`entityId`,`reason`,`reference`,`metadataJson`)
SELECT
  NULL,
  'trading_package_fee_policy_baseline_created',
  'trading_package_fee_policy',
  CAST(v.`packageId` AS CHAR),
  v.`reason`,
  CONCAT('trading-package-fee-policy:0101:',v.`packageId`),
  JSON_OBJECT('packageId',v.`packageId`,'version',v.`version`,'feeRateBps',v.`feeRateBps`,
    'roundingMode',v.`roundingMode`,'effectiveAt',DATE_FORMAT(v.`effectiveAt`,'%Y-%m-%dT%H:%i:%s.%fZ'),
    'source',v.`source`)
FROM `trading_package_fee_policy_versions` v
WHERE v.`version`=1 AND v.`source`='legacy_global_baseline_0101'
  AND NOT EXISTS (
    SELECT 1 FROM `v5_audit_events` a
    WHERE a.`reference`=CONCAT('trading-package-fee-policy:0101:',v.`packageId`)
  );
