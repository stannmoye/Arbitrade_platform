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
INSERT INTO `app_settings` (`settingKey`,`settingValue`,`updatedBy`)
SELECT
  'trade.globalControls.migrationDiagnostic',
  JSON_OBJECT(
    'migration', '0100_global_trade_master_controls',
    'sourcePolicyCount', COUNT(*),
    'tierPolicyDisabledPackages', (SELECT JSON_ARRAYAGG(`packageName`) FROM (SELECT `packageName` FROM `opportunity_package_policies` WHERE `enabled` = 0 ORDER BY `packageName`) AS p),
    'deliveryDisabledPackages', (SELECT JSON_ARRAYAGG(`packageName`) FROM (SELECT `packageName` FROM `opportunity_package_policies` WHERE `automaticDelivery` = 0 ORDER BY `packageName`) AS p),
    'companyRotationDisabledPackages', (SELECT JSON_ARRAYAGG(`packageName`) FROM (SELECT `packageName` FROM `opportunity_package_policies` WHERE `companyRotationEnabled` = 0 ORDER BY `packageName`) AS p),
    'randomizationDisabledPackages', (SELECT JSON_ARRAYAGG(`packageName`) FROM (SELECT `packageName` FROM `opportunity_package_policies` WHERE `randomizationEnabled` = 0 ORDER BY `packageName`) AS p),
    'burstDisabledPackages', (SELECT JSON_ARRAYAGG(`packageName`) FROM (SELECT `packageName` FROM `opportunity_package_policies` WHERE `burstEnabled` = 0 ORDER BY `packageName`) AS p),
    'settlementGuardDisabledPackages', (SELECT JSON_ARRAYAGG(`packageName`) FROM (SELECT `packageName` FROM `opportunity_package_policies` WHERE `requirePreviousSettlement` = 0 ORDER BY `packageName`) AS p)
  ),
  NULL
FROM `opportunity_package_policies`
ON DUPLICATE KEY UPDATE `settingKey`=VALUES(`settingKey`);
--> statement-breakpoint
INSERT INTO `v5_audit_events`
  (`actorUserId`,`action`,`entityType`,`entityId`,`reason`,`reference`,`metadataJson`)
SELECT
  NULL,
  'trade_global_controls_migrated',
  'trade_global_control_policy',
  'global',
  'Forward migration initialized global Trade masters using restrictive precedence. See the migration diagnostic for legacy package values.',
  'trade-global-controls-migration-0100',
  (SELECT `settingValue` FROM `app_settings` WHERE `settingKey`='trade.globalControls.migrationDiagnostic' LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM `v5_audit_events` WHERE `reference`='trade-global-controls-migration-0100'
);
