-- Establish one canonical global Trade control value. Package rows remain intact
-- during the compatibility window; existing OFF copies force the corresponding
-- global delivery master OFF until an administrator explicitly changes it.
-- Tier lifecycle (`packages.enabled`) remains separate and is not changed here.
INSERT INTO `app_settings` (`settingKey`,`settingValue`,`updatedBy`)
SELECT
  'trade.globalControls',
  JSON_OBJECT(
    'tierPolicyMasterEnabled', IF(COUNT(*) > 0 AND MIN(`enabled`) = 1, TRUE, FALSE),
    'informationalPopupDeliveryEnabled', IF(COUNT(*) > 0 AND MIN(`automaticDelivery`) = 1, TRUE, FALSE),
    'companyRotationEnabled', IF(COUNT(*) > 0 AND MIN(`companyRotationEnabled`) = 1, TRUE, FALSE),
    'randomizedTimingEnabled', IF(COUNT(*) > 0 AND MIN(`randomizationEnabled`) = 1, TRUE, FALSE),
    'burstDeliveryEnabled', IF(COUNT(*) > 0 AND MIN(`burstEnabled`) = 1, TRUE, FALSE),
    'requirePreviousSettlement', TRUE,
    'policyVersion', 1,
    'updatedBy', NULL,
    'updatedAt', NULL
  ),
  NULL
FROM `opportunity_package_policies`
ON DUPLICATE KEY UPDATE `settingKey`=VALUES(`settingKey`);
--> statement-breakpoint
-- Build the diagnostic document from one aggregate source scan. The package-name
-- arrays are filled by separate statements below so MySQL does not have to
-- reopen opportunity_package_policies from an outer SELECT and nested subquery.
INSERT INTO `app_settings` (`settingKey`,`settingValue`,`updatedBy`)
SELECT
  'trade.globalControls.migrationDiagnostic',
  JSON_OBJECT(
    'migration', '0100_global_trade_master_controls',
    'sourcePolicyCount', CAST(COUNT(*) AS UNSIGNED),
    'tierPolicyDisabledPackages', JSON_ARRAY(),
    'deliveryDisabledPackages', JSON_ARRAY(),
    'companyRotationDisabledPackages', JSON_ARRAY(),
    'randomizationDisabledPackages', JSON_ARRAY(),
    'burstDisabledPackages', JSON_ARRAY(),
    'settlementGuardDisabledPackages', JSON_ARRAY(),
    'conflicts', JSON_OBJECT(
      'tierPolicyMasterEnabled', JSON_EXTRACT(IF(SUM(`enabled` = 0) > 0 AND SUM(`enabled` = 1) > 0, 'true', 'false'), '$'),
      'informationalPopupDeliveryEnabled', JSON_EXTRACT(IF(SUM(`automaticDelivery` = 0) > 0 AND SUM(`automaticDelivery` = 1) > 0, 'true', 'false'), '$'),
      'companyRotationEnabled', JSON_EXTRACT(IF(SUM(`companyRotationEnabled` = 0) > 0 AND SUM(`companyRotationEnabled` = 1) > 0, 'true', 'false'), '$'),
      'randomizedTimingEnabled', JSON_EXTRACT(IF(SUM(`randomizationEnabled` = 0) > 0 AND SUM(`randomizationEnabled` = 1) > 0, 'true', 'false'), '$'),
      'burstDeliveryEnabled', JSON_EXTRACT(IF(SUM(`burstEnabled` = 0) > 0 AND SUM(`burstEnabled` = 1) > 0, 'true', 'false'), '$'),
      'requirePreviousSettlement', JSON_EXTRACT(IF(SUM(`requirePreviousSettlement` = 0) > 0 AND SUM(`requirePreviousSettlement` = 1) > 0, 'true', 'false'), '$')
    )
  ),
  NULL
FROM `opportunity_package_policies`
ON DUPLICATE KEY UPDATE `settingKey`=VALUES(`settingKey`);
--> statement-breakpoint
UPDATE `app_settings`
SET `settingValue` = JSON_SET(`settingValue`, '$.tierPolicyDisabledPackages', JSON_EXTRACT(COALESCE((SELECT JSON_ARRAYAGG(`packageName`) FROM (SELECT `packageName` FROM `opportunity_package_policies` WHERE `enabled` = 0 ORDER BY `packageName`) AS p), JSON_ARRAY()), '$'))
WHERE `settingKey`='trade.globalControls.migrationDiagnostic';
--> statement-breakpoint
UPDATE `app_settings`
SET `settingValue` = JSON_SET(`settingValue`, '$.deliveryDisabledPackages', JSON_EXTRACT(COALESCE((SELECT JSON_ARRAYAGG(`packageName`) FROM (SELECT `packageName` FROM `opportunity_package_policies` WHERE `automaticDelivery` = 0 ORDER BY `packageName`) AS p), JSON_ARRAY()), '$'))
WHERE `settingKey`='trade.globalControls.migrationDiagnostic';
--> statement-breakpoint
UPDATE `app_settings`
SET `settingValue` = JSON_SET(`settingValue`, '$.companyRotationDisabledPackages', JSON_EXTRACT(COALESCE((SELECT JSON_ARRAYAGG(`packageName`) FROM (SELECT `packageName` FROM `opportunity_package_policies` WHERE `companyRotationEnabled` = 0 ORDER BY `packageName`) AS p), JSON_ARRAY()), '$'))
WHERE `settingKey`='trade.globalControls.migrationDiagnostic';
--> statement-breakpoint
UPDATE `app_settings`
SET `settingValue` = JSON_SET(`settingValue`, '$.randomizationDisabledPackages', JSON_EXTRACT(COALESCE((SELECT JSON_ARRAYAGG(`packageName`) FROM (SELECT `packageName` FROM `opportunity_package_policies` WHERE `randomizationEnabled` = 0 ORDER BY `packageName`) AS p), JSON_ARRAY()), '$'))
WHERE `settingKey`='trade.globalControls.migrationDiagnostic';
--> statement-breakpoint
UPDATE `app_settings`
SET `settingValue` = JSON_SET(`settingValue`, '$.burstDisabledPackages', JSON_EXTRACT(COALESCE((SELECT JSON_ARRAYAGG(`packageName`) FROM (SELECT `packageName` FROM `opportunity_package_policies` WHERE `burstEnabled` = 0 ORDER BY `packageName`) AS p), JSON_ARRAY()), '$'))
WHERE `settingKey`='trade.globalControls.migrationDiagnostic';
--> statement-breakpoint
UPDATE `app_settings`
SET `settingValue` = JSON_SET(`settingValue`, '$.settlementGuardDisabledPackages', JSON_EXTRACT(COALESCE((SELECT JSON_ARRAYAGG(`packageName`) FROM (SELECT `packageName` FROM `opportunity_package_policies` WHERE `requirePreviousSettlement` = 0 ORDER BY `packageName`) AS p), JSON_ARRAY()), '$'))
WHERE `settingKey`='trade.globalControls.migrationDiagnostic';
--> statement-breakpoint
INSERT INTO `v5_audit_events`
  (`actorUserId`,`action`,`entityType`,`entityId`,`reason`,`reference`,`metadataJson`)
SELECT
  NULL,
  'trade_global_controls_migrated',
  'trade_global_control_policy',
  'global',
  'Forward migration 0100 initializes missing global controls only; existing values are preserved. Review the migration diagnostic for legacy values and conflicts.',
  'trade-global-controls-migration-0100',
  (SELECT `settingValue` FROM `app_settings` WHERE `settingKey`='trade.globalControls.migrationDiagnostic' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM `v5_audit_events` WHERE `reference`='trade-global-controls-migration-0100'
);
