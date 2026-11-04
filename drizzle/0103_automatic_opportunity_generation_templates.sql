-- Forward-only informational opportunity generation schema. This migration does not
-- change wallet, ledger, trade allocation, execution, result, or settlement records.
ALTER TABLE `opportunity_offers`
  ADD COLUMN `assignedUserId` INT NULL,
  ADD COLUMN `assignedPackageId` INT NULL,
  ADD COLUMN `assignedPackageSubscriptionId` INT NULL,
  ADD COLUMN `generationTemplateId` INT NULL,
  ADD COLUMN `generationKey` VARCHAR(180) NULL,
  ADD COLUMN `companyReferenceId` VARCHAR(32) NULL,
  ADD COLUMN `companyDisplayName` VARCHAR(240) NULL,
  ADD COLUMN `companyLogoUrl` VARCHAR(500) NULL,
  ADD COLUMN `companyReferenceMetadataJson` LONGTEXT NULL,
  ADD COLUMN `configuredProfitRateBps` INT NULL,
  ADD COLUMN `configuredDurationSeconds` INT NULL,
  ADD COLUMN `packagePolicyVersionSnapshot` INT NULL,
  ADD UNIQUE KEY `opportunity_offers_generation_key_uq` (`generationKey`),
  ADD KEY `opportunity_offers_assigned_user_status_idx` (`assignedUserId`,`status`,`closesAt`),
  ADD KEY `opportunity_offers_generation_template_idx` (`generationTemplateId`,`createdAt`);
--> statement-breakpoint
CREATE TABLE `opportunity_generation_templates` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `templateName` VARCHAR(120) NOT NULL,
  `companyReferenceId` VARCHAR(32) NOT NULL,
  `symbol` VARCHAR(40) NOT NULL,
  `venueFrom` VARCHAR(80) NOT NULL,
  `venueTo` VARCHAR(80) NOT NULL,
  `currency` VARCHAR(12) NOT NULL,
  `minimumMinor` BIGINT NOT NULL,
  `sourceReference` VARCHAR(160) NOT NULL,
  `reviewNotes` TEXT NOT NULL,
  `status` ENUM('draft','approved','disabled','archived') NOT NULL DEFAULT 'draft',
  `version` INT NOT NULL DEFAULT 1,
  `createdBy` INT NOT NULL,
  `updatedBy` INT NOT NULL,
  `approvedBy` INT NULL,
  `approvedAt` TIMESTAMP NULL DEFAULT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `opportunity_generation_templates_status_company_idx` (`status`,`companyReferenceId`),
  KEY `opportunity_generation_templates_company_idx` (`companyReferenceId`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `opportunity_generation_batches` (
  `id` VARCHAR(64) NOT NULL,
  `status` ENUM('running','completed','partial','failed') NOT NULL DEFAULT 'running',
  `batchSize` INT NOT NULL,
  `customersScanned` INT NOT NULL DEFAULT 0,
  `opportunitiesGenerated` INT NOT NULL DEFAULT 0,
  `failures` INT NOT NULL DEFAULT 0,
  `failureSummary` LONGTEXT NULL,
  `startedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completedAt` TIMESTAMP NULL DEFAULT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `opportunity_generation_batches_status_started_idx` (`status`,`startedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `opportunity_generation_assignments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `generationKey` VARCHAR(180) NOT NULL,
  `batchId` VARCHAR(64) NOT NULL,
  `userId` INT NOT NULL,
  `offerId` INT NOT NULL,
  `templateId` INT NOT NULL,
  `templateVersion` INT NOT NULL,
  `packageId` INT NOT NULL,
  `packageSubscriptionId` INT NOT NULL,
  `packageName` VARCHAR(80) NOT NULL,
  `packagePolicyVersion` INT NOT NULL,
  `companyReferenceId` VARCHAR(32) NOT NULL,
  `configuredProfitRateBps` INT NOT NULL,
  `configuredDurationSeconds` INT NOT NULL,
  `packageSnapshotJson` LONGTEXT NOT NULL,
  `status` ENUM('generated','delivered','failed','expired','cancelled') NOT NULL DEFAULT 'generated',
  `failureReason` VARCHAR(240) NULL,
  `generatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `assignedAt` TIMESTAMP NULL DEFAULT NULL,
  `deliveredAt` TIMESTAMP NULL DEFAULT NULL,
  `expiresAt` TIMESTAMP NOT NULL,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `opportunity_generation_assignments_generation_key_uq` (`generationKey`),
  UNIQUE KEY `opportunity_generation_assignments_offer_uq` (`offerId`),
  KEY `opportunity_generation_assignments_user_status_expiry_idx` (`userId`,`status`,`expiresAt`),
  KEY `opportunity_generation_assignments_package_window_idx` (`packageSubscriptionId`,`generatedAt`),
  KEY `opportunity_generation_assignments_template_idx` (`templateId`,`generatedAt`),
  KEY `opportunity_generation_assignments_batch_idx` (`batchId`,`generatedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
-- Generation defaults ON for installations receiving this migration. Existing saved
-- administrator OFF/ON values are preserved by the duplicate-key no-op.
INSERT INTO `app_settings` (`settingKey`,`settingValue`,`updatedBy`)
VALUES (
  'trade.opportunityGeneration.control',
  JSON_OBJECT('enabled',TRUE,'version',1,'updatedBy',NULL,'updatedAt',NULL,'reason','Default automatic informational opportunity generation control; approved templates and active package rules are still required.'),
  NULL
)
ON DUPLICATE KEY UPDATE `settingKey`=VALUES(`settingKey`);
