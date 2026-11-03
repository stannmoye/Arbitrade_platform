-- Establish the canonical singleton for global Trading delivery/safety gates.
-- This migration is additive and forward-only: legacy package columns remain in
-- place for the compatibility-read window and are not rewritten or deleted.
CREATE TABLE IF NOT EXISTS `trade_global_settings` (
  `id` int NOT NULL,
  `policyVersion` int NOT NULL DEFAULT 1,
  `tierEnabled` tinyint(1) NOT NULL DEFAULT 0,
  `popupDeliveryEnabled` tinyint(1) NOT NULL DEFAULT 0,
  `companyRotationEnabled` tinyint(1) NOT NULL DEFAULT 0,
  `randomizedTimingEnabled` tinyint(1) NOT NULL DEFAULT 0,
  `burstDeliveryEnabled` tinyint(1) NOT NULL DEFAULT 0,
  `automaticTradingEnabled` tinyint(1) NOT NULL DEFAULT 0,
  `effectiveAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedBy` int NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `trade_global_settings_migration_conflicts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fieldName` varchar(80) NOT NULL,
  `enabledPackageCount` int NOT NULL DEFAULT 0,
  `disabledPackageCount` int NOT NULL DEFAULT 0,
  `detailJson` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `trade_global_settings_migration_conflicts_field_uq` (`fieldName`)
);

-- Strictest-safety precedence: any disabled legacy package keeps the global
-- gate disabled. No package policy row is changed by this backfill.
INSERT INTO `trade_global_settings` (
  `id`, `policyVersion`, `tierEnabled`, `popupDeliveryEnabled`,
  `companyRotationEnabled`, `randomizedTimingEnabled`, `burstDeliveryEnabled`,
  `automaticTradingEnabled`
)
SELECT
  1,
  1,
  COALESCE(MIN(`enabled`), 0),
  COALESCE(MIN(`automaticDelivery`), 0),
  COALESCE(MIN(`companyRotationEnabled`), 0),
  COALESCE(MIN(`randomizationEnabled`), 0),
  COALESCE(MIN(`burstEnabled`), 0),
  0
FROM `opportunity_package_policies`
ON DUPLICATE KEY UPDATE `id` = `id`;

-- Preserve divergence diagnostics instead of silently choosing a majority value.
INSERT IGNORE INTO `trade_global_settings_migration_conflicts`
  (`fieldName`, `enabledPackageCount`, `disabledPackageCount`, `detailJson`)
SELECT 'tierEnabled', SUM(`enabled` = 1), SUM(`enabled` = 0),
  JSON_OBJECT('legacyColumn', 'enabled', 'precedence', 'strictest-safety')
FROM `opportunity_package_policies`
HAVING SUM(`enabled` = 1) > 0 AND SUM(`enabled` = 0) > 0;
INSERT IGNORE INTO `trade_global_settings_migration_conflicts`
  (`fieldName`, `enabledPackageCount`, `disabledPackageCount`, `detailJson`)
SELECT 'popupDeliveryEnabled', SUM(`automaticDelivery` = 1), SUM(`automaticDelivery` = 0),
  JSON_OBJECT('legacyColumn', 'automaticDelivery', 'precedence', 'strictest-safety')
FROM `opportunity_package_policies`
HAVING SUM(`automaticDelivery` = 1) > 0 AND SUM(`automaticDelivery` = 0) > 0;
INSERT IGNORE INTO `trade_global_settings_migration_conflicts`
  (`fieldName`, `enabledPackageCount`, `disabledPackageCount`, `detailJson`)
SELECT 'companyRotationEnabled', SUM(`companyRotationEnabled` = 1), SUM(`companyRotationEnabled` = 0),
  JSON_OBJECT('legacyColumn', 'companyRotationEnabled', 'precedence', 'strictest-safety')
FROM `opportunity_package_policies`
HAVING SUM(`companyRotationEnabled` = 1) > 0 AND SUM(`companyRotationEnabled` = 0) > 0;
INSERT IGNORE INTO `trade_global_settings_migration_conflicts`
  (`fieldName`, `enabledPackageCount`, `disabledPackageCount`, `detailJson`)
SELECT 'randomizedTimingEnabled', SUM(`randomizationEnabled` = 1), SUM(`randomizationEnabled` = 0),
  JSON_OBJECT('legacyColumn', 'randomizationEnabled', 'precedence', 'strictest-safety')
FROM `opportunity_package_policies`
HAVING SUM(`randomizationEnabled` = 1) > 0 AND SUM(`randomizationEnabled` = 0) > 0;
INSERT IGNORE INTO `trade_global_settings_migration_conflicts`
  (`fieldName`, `enabledPackageCount`, `disabledPackageCount`, `detailJson`)
SELECT 'burstDeliveryEnabled', SUM(`burstEnabled` = 1), SUM(`burstEnabled` = 0),
  JSON_OBJECT('legacyColumn', 'burstEnabled', 'precedence', 'strictest-safety')
FROM `opportunity_package_policies`
HAVING SUM(`burstEnabled` = 1) > 0 AND SUM(`burstEnabled` = 0) > 0;
