-- Forward-only informational delivery lifecycle migration. Delivery fields only;
-- wallet, ledger, trade, allocation, and result columns are never mutated here.
ALTER TABLE `opportunity_popup_events`
  MODIFY COLUMN `deliveryStatus` ENUM('queued','in_progress','retry_wait','delivered','received','rendered','failed','dismissed','expired') NOT NULL DEFAULT 'delivered',
  MODIFY COLUMN `deliveryAttemptCount` INT NOT NULL DEFAULT 0,
  ADD COLUMN `packageId` INT NULL,
  ADD COLUMN `deliveryRetryAfter` TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN `deliveryLeaseToken` VARCHAR(64) NULL DEFAULT NULL,
  ADD COLUMN `deliveryLeaseExpiresAt` TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN `deliveryPolicyVersionSnapshot` INT NOT NULL DEFAULT 1,
  ADD KEY `opportunity_popup_pending_package_id_idx` (`userId`,`packageId`,`deliveryStatus`),
  ADD KEY `opportunity_popup_retry_due_idx` (`deliveryStatus`,`deliveryRetryAfter`);
--> statement-breakpoint
UPDATE `opportunity_popup_events` e
JOIN `packages` p ON p.`name`=e.`packageName`
SET e.`packageId`=p.`id`
WHERE e.`packageId` IS NULL;
--> statement-breakpoint
-- Duplicate legacy delivery records are informational only. Preserve the lowest-ID
-- canonical event and terminalize only surplus rows with no linked/started trade.
UPDATE `opportunity_popup_events` e
JOIN (
  SELECT `userId`,`offerId`,MIN(`id`) AS `canonicalId`
  FROM `opportunity_popup_events`
  GROUP BY `userId`,`offerId`
  HAVING COUNT(*) > 1
) duplicates ON duplicates.`userId`=e.`userId` AND duplicates.`offerId`=e.`offerId`
SET e.`deliveryStatus`='failed',
    e.`deliveryRetryAfter`=NULL,
    e.`deliveryLeaseToken`=NULL,
    e.`deliveryLeaseExpiresAt`=NULL,
    e.`lastErrorCode`='DELIVERY_DUPLICATE_LEGACY',
    e.`updatedAt`=CURRENT_TIMESTAMP
WHERE e.`id`<>duplicates.`canonicalId`
  AND e.`tradeId` IS NULL
  AND e.`eventStatus` NOT IN ('TRADED','SETTLED')
  AND e.`executionStatus` NOT IN ('RUNNING','SUCCEEDED')
  AND e.`deliveryStatus` IN ('queued','in_progress','retry_wait');
--> statement-breakpoint
-- A dispatchable legacy row whose package was renamed/deleted cannot safely be
-- assigned to a mutable-name-derived cap scope; terminalize it rather than let it
-- bypass a per-package pending limit after upgrade.
UPDATE `opportunity_popup_events`
SET `deliveryStatus`='failed',`deliveryRetryAfter`=NULL,`deliveryLeaseToken`=NULL,
    `deliveryLeaseExpiresAt`=NULL,`lastErrorCode`='DELIVERY_PACKAGE_ID_UNRESOLVED',
    `updatedAt`=CURRENT_TIMESTAMP
WHERE `packageId` IS NULL
  AND `deliveryStatus` IN ('queued','in_progress','retry_wait')
  AND `tradeId` IS NULL
  AND `eventStatus` NOT IN ('TRADED','SETTLED')
  AND `executionStatus` NOT IN ('RUNNING','SUCCEEDED');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `opportunity_delivery_idempotency` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `userId` INT NOT NULL,
  `offerId` INT NOT NULL,
  `popupEventId` INT NULL,
  `packageId` INT NOT NULL DEFAULT 0,
  `packageName` VARCHAR(80) NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `opportunity_delivery_idempotency_user_offer_uq` (`userId`,`offerId`),
  KEY `opportunity_delivery_idempotency_popup_idx` (`popupEventId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
INSERT INTO `opportunity_delivery_idempotency` (`userId`,`offerId`,`popupEventId`,`packageId`,`packageName`,`createdAt`)
SELECT e.`userId`,e.`offerId`,e.`id`,COALESCE(e.`packageId`,0),e.`packageName`,e.`createdAt`
FROM `opportunity_popup_events` e
JOIN (
  SELECT `userId`,`offerId`,MIN(`id`) AS `canonicalId`
  FROM `opportunity_popup_events` GROUP BY `userId`,`offerId`
) canonical ON canonical.`canonicalId`=e.`id`
ON DUPLICATE KEY UPDATE `userId`=VALUES(`userId`);
--> statement-breakpoint
UPDATE `opportunity_delivery_idempotency` d
JOIN `opportunity_popup_events` e ON e.`id`=d.`popupEventId`
SET d.`packageId`=COALESCE(e.`packageId`,0),d.`packageName`=e.`packageName`;
--> statement-breakpoint
-- No interval/schedule is inferred. Retry remains disabled until an administrator
-- explicitly configures a bounded schedule; the initial dispatch is still permitted.
INSERT INTO `app_settings` (`settingKey`,`settingValue`,`updatedBy`)
VALUES (
  'trade.deliveryRetryPolicy',
  JSON_OBJECT('policy','none','maxAttempts',1,'intervalsSeconds',JSON_ARRAY(),'version',1,'effectiveAt',NULL,'updatedBy',NULL,'updatedAt',NULL,'reason','Initial fail-closed delivery retry policy; explicit intervals have not been saved.','configured',FALSE),
  NULL
)
ON DUPLICATE KEY UPDATE `settingKey`=VALUES(`settingKey`);
--> statement-breakpoint
UPDATE `opportunity_popup_events`
SET `deliveryStatus`='dismissed',`deliveryRetryAfter`=NULL,`deliveryLeaseToken`=NULL,`deliveryLeaseExpiresAt`=NULL
WHERE `eventStatus`='DISMISSED' AND `deliveryStatus` IN ('queued','in_progress','retry_wait');
--> statement-breakpoint
UPDATE `opportunity_popup_events` e
LEFT JOIN `opportunity_offers` o ON o.`id`=e.`offerId`
SET e.`deliveryStatus`='expired',e.`expiredAt`=COALESCE(e.`expiredAt`,CURRENT_TIMESTAMP),
    e.`deliveryRetryAfter`=NULL,e.`deliveryLeaseToken`=NULL,e.`deliveryLeaseExpiresAt`=NULL
WHERE e.`deliveryStatus` IN ('queued','in_progress','retry_wait')
  AND (o.`id` IS NULL OR o.`status`<>'open' OR o.`closesAt`<=UTC_TIMESTAMP());
