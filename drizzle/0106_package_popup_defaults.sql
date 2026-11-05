-- Persist a usable informational-popup policy for every existing package.
-- Existing administrator-edited policy values are preserved. Only missing policy
-- rows are created, and only untouched migration-created rows (updatedBy IS NULL)
-- receive established defaults where financial bounds are incomplete.
-- Global delivery masters remain owned by trade.globalControls (migration 0105).
-- Company approval remains administrator-owned; this migration never verifies companies.
-- Automatic financial execution remains hard-disabled.
--> statement-breakpoint
UPDATE `opportunity_package_policies` policy
JOIN `packages` package ON LOWER(policy.`packageName`) = LOWER(package.`name`)
JOIN (
  SELECT ranked.`id`, 180 + ((ranked.`packageOrder` - 1) * 120) AS `intervalSeconds`
  FROM (
    SELECT `id`, ROW_NUMBER() OVER (ORDER BY `id`) AS `packageOrder`
    FROM `packages`
  ) ranked
) schedule ON schedule.`id` = package.`id`
SET
  policy.`minimumPayoutRateBps` = CASE
    WHEN policy.`minimumPayoutRateBps` BETWEEN 1 AND 5000
     AND policy.`maximumPayoutRateBps` BETWEEN policy.`minimumPayoutRateBps` AND 5000
    THEN policy.`minimumPayoutRateBps` ELSE 200 END,
  policy.`maximumPayoutRateBps` = CASE
    WHEN policy.`minimumPayoutRateBps` BETWEEN 1 AND 5000
     AND policy.`maximumPayoutRateBps` BETWEEN policy.`minimumPayoutRateBps` AND 5000
    THEN policy.`maximumPayoutRateBps` ELSE 300 END,
  policy.`minimumTradeDurationSeconds` = CASE
    WHEN policy.`minimumTradeDurationSeconds` BETWEEN 10 AND 86400
     AND policy.`maximumTradeDurationSeconds` BETWEEN policy.`minimumTradeDurationSeconds` AND 86400
    THEN policy.`minimumTradeDurationSeconds` ELSE 300 END,
  policy.`maximumTradeDurationSeconds` = CASE
    WHEN policy.`minimumTradeDurationSeconds` BETWEEN 10 AND 86400
     AND policy.`maximumTradeDurationSeconds` BETWEEN policy.`minimumTradeDurationSeconds` AND 86400
    THEN policy.`maximumTradeDurationSeconds` ELSE 900 END,
  policy.`minIntervalSeconds` = CASE
    WHEN policy.`minIntervalSeconds` = 45 AND policy.`maxIntervalSeconds` = 3600
    THEN schedule.`intervalSeconds` ELSE policy.`minIntervalSeconds` END,
  policy.`maxIntervalSeconds` = CASE
    WHEN policy.`minIntervalSeconds` = 45 AND policy.`maxIntervalSeconds` = 3600
    THEN schedule.`intervalSeconds` ELSE policy.`maxIntervalSeconds` END
WHERE policy.`updatedBy` IS NULL;
--> statement-breakpoint
INSERT INTO `opportunity_package_policies` (
  `packageName`, `minimumPayoutRateBps`, `maximumPayoutRateBps`,
  `minimumTradeDurationSeconds`, `maximumTradeDurationSeconds`,
  `companyRotationEnabled`, `companyRotationRepeatPolicy`,
  `maxPopupsPerDay`, `maxVisibleOffers`, `minimumTradeUnits`, `maximumTradeUnits`,
  `dailyPopupTarget`, `schedulingPeriod`, `minIntervalSeconds`, `maxIntervalSeconds`,
  `randomizationEnabled`, `popupDisplayTargetSeconds`, `completionDisplaySeconds`,
  `postCompletionIntervalSeconds`, `maxPendingDeliveries`,
  `enabled`, `automaticDelivery`, `burstEnabled`, `automaticTradingEnabled`,
  `policyVersion`, `updatedBy`
)
SELECT
  package.`name`, 200, 300, 300, 900,
  FALSE, 'avoid_until_exhausted',
  GREATEST(1, package.`opportunitiesPerDay`), 3, 1000, 100000,
  0, 'rolling_24h', schedule.`intervalSeconds`, schedule.`intervalSeconds`,
  FALSE, 120, 60, 60, 3,
  FALSE, FALSE, FALSE, FALSE, 1, NULL
FROM `packages` package
JOIN (
  SELECT ranked.`id`, 180 + ((ranked.`packageOrder` - 1) * 120) AS `intervalSeconds`
  FROM (
    SELECT `id`, ROW_NUMBER() OVER (ORDER BY `id`) AS `packageOrder`
    FROM `packages`
  ) ranked
) schedule ON schedule.`id` = package.`id`
LEFT JOIN `opportunity_package_policies` existing
  ON LOWER(existing.`packageName`) = LOWER(package.`name`)
WHERE existing.`id` IS NULL;
--> statement-breakpoint
INSERT IGNORE INTO `v5_audit_events`
  (`actorUserId`,`action`,`entityType`,`entityId`,`reason`,`reference`,`metadataJson`)
SELECT NULL, 'trade_package_popup_defaults_seeded', 'trading_package_policy',
  CAST(package.`id` AS CHAR),
  'Forward migration 0106 provisions missing informational popup policy defaults while preserving administrator-edited package settings.',
  CONCAT('trade-package-popup-defaults-0106:', package.`id`),
  JSON_OBJECT('packageName', package.`name`,
    'minimumPayoutRateBps', policy.`minimumPayoutRateBps`,
    'maximumPayoutRateBps', policy.`maximumPayoutRateBps`,
    'minimumTradeDurationSeconds', policy.`minimumTradeDurationSeconds`,
    'maximumTradeDurationSeconds', policy.`maximumTradeDurationSeconds`,
    'minIntervalSeconds', policy.`minIntervalSeconds`,
    'maxIntervalSeconds', policy.`maxIntervalSeconds`,
    'source', '0106_package_popup_defaults')
FROM `packages` package
JOIN `opportunity_package_policies` policy
  ON LOWER(policy.`packageName`) = LOWER(package.`name`)
WHERE policy.`updatedBy` IS NULL;
