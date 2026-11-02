-- Trade Settings redesign Checkpoint 2.
-- This migration is forward-only. It preserves package rows and all customer,
-- opportunity, trade, wallet and settlement records.

ALTER TABLE `opportunity_package_policies`
  ADD COLUMN IF NOT EXISTS `minimumPlatformFeeBps` int NOT NULL DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS `maximumPlatformFeeBps` int NOT NULL DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS `platformFeeRoundingMode` varchar(16) NOT NULL DEFAULT 'up';

ALTER TABLE `opportunity_popup_events`
  ADD COLUMN IF NOT EXISTS `platformFeeRateBps` int NOT NULL DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS `platformFeeRoundingMode` varchar(16) NOT NULL DEFAULT 'up',
  ADD COLUMN IF NOT EXISTS `feePolicyVersion` int NOT NULL DEFAULT 1;

-- The approved fee policy is package-scoped. Existing packages receive an
-- explicit 15% inclusive bound snapshot until an administrator changes it.
UPDATE `opportunity_package_policies`
SET `minimumPlatformFeeBps` = 1500,
    `maximumPlatformFeeBps` = 1500,
    `platformFeeRoundingMode` = 'up'
WHERE `minimumPlatformFeeBps` IS NULL
   OR `maximumPlatformFeeBps` IS NULL
   OR `platformFeeRoundingMode` IS NULL
   OR `platformFeeRoundingMode` NOT IN ('up', 'down', 'half_up', 'half_even');

-- Missing, disabled, malformed, or non-delivery legacy policies are preserved
-- as paused in the new global masters. No package row is silently enabled.
INSERT INTO `app_settings` (`settingKey`, `settingValue`)
VALUES (
  'trade.settings.global.v1',
  JSON_OBJECT(
    'migrationVersion', 1,
    'tierPolicyMaster', IF(EXISTS (
      SELECT 1 FROM `opportunity_package_policies` p
      WHERE p.`packageName` IS NULL
         OR p.`packageName` = ''
         OR p.`enabled` = 0
         OR p.`automaticDelivery` = 0
    ), FALSE, TRUE),
    'popupDelivery', IF(EXISTS (
      SELECT 1 FROM `opportunity_package_policies` p
      WHERE p.`packageName` IS NULL
         OR p.`packageName` = ''
         OR p.`enabled` = 0
         OR p.`automaticDelivery` = 0
    ), FALSE, TRUE),
    'companyRotation', IF(EXISTS (
      SELECT 1 FROM `opportunity_package_policies` p
      WHERE p.`packageName` IS NULL
         OR p.`packageName` = ''
         OR p.`enabled` = 0
         OR p.`automaticDelivery` = 0
    ), FALSE, TRUE),
    'randomizedTiming', IF(EXISTS (
      SELECT 1 FROM `opportunity_package_policies` p
      WHERE p.`packageName` IS NULL
         OR p.`packageName` = ''
         OR p.`enabled` = 0
         OR p.`automaticDelivery` = 0
    ), FALSE, TRUE),
    'burstDelivery', IF(EXISTS (
      SELECT 1 FROM `opportunity_package_policies` p
      WHERE p.`packageName` IS NULL
         OR p.`packageName` = ''
         OR p.`enabled` = 0
         OR p.`automaticDelivery` = 0
    ), FALSE, TRUE),
    'requirePreviousSettlement', TRUE,
    'automaticFinancialExecution', FALSE,
    'legacySafetyPaused', IF(EXISTS (
      SELECT 1 FROM `opportunity_package_policies` p
      WHERE p.`packageName` IS NULL
         OR p.`packageName` = ''
         OR p.`enabled` = 0
         OR p.`automaticDelivery` = 0
    ), TRUE, FALSE),
    'source', 'migration:0099_trade_settings_global_registry'
  )
)
ON DUPLICATE KEY UPDATE `settingKey` = `settingKey`;

INSERT INTO `app_settings` (`settingKey`, `settingValue`)
VALUES (
  'trade.settings.global.migrationReport.v1',
  JSON_OBJECT(
    'migrationVersion', 1,
    'legacyPolicyCount', (SELECT COUNT(*) FROM `opportunity_package_policies`),
    'unsafePolicyCount', (SELECT COUNT(*) FROM `opportunity_package_policies` p
      WHERE p.`packageName` IS NULL
         OR p.`packageName` = ''
         OR p.`enabled` = 0
         OR p.`automaticDelivery` = 0),
    'unsafePackageNames', COALESCE((SELECT JSON_ARRAYAGG(p.`packageName`)
      FROM `opportunity_package_policies` p
      WHERE p.`packageName` IS NULL
         OR p.`packageName` = ''
         OR p.`enabled` = 0
         OR p.`automaticDelivery` = 0), JSON_ARRAY()),
    'requirePreviousSettlementInitialized', TRUE,
    'source', 'migration:0099_trade_settings_global_registry'
  )
)
ON DUPLICATE KEY UPDATE `settingKey` = `settingKey`;
