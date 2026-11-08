CREATE TABLE IF NOT EXISTS `settlement_evidence_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tradeId` int NOT NULL,
  `evidenceReference` varchar(160) NOT NULL,
  `evidenceType` varchar(40) NOT NULL,
  `originalFilename` varchar(255) NULL,
  `mimeType` varchar(160) NULL,
  `sizeBytes` int NULL,
  `sha256` varchar(64) NULL,
  `storageKey` varchar(512) NULL,
  `submittedBy` int NOT NULL,
  `submittedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `verificationStatus` enum('submitted','under_review','approved','rejected') NOT NULL DEFAULT 'submitted',
  `verifiedBy` int NULL,
  `verifiedAt` timestamp NULL,
  `verificationNotes` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `settlement_evidence_trade_reference_uq` (`tradeId`,`evidenceReference`),
  UNIQUE KEY `settlement_evidence_storage_key_uq` (`storageKey`),
  KEY `settlement_evidence_trade_status_idx` (`tradeId`,`verificationStatus`,`id`)
);

CREATE TABLE IF NOT EXISTS `settlement_evidence_audit_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `evidenceId` int NOT NULL,
  `tradeId` int NOT NULL,
  `action` varchar(80) NOT NULL,
  `fromStatus` varchar(40) NULL,
  `toStatus` varchar(40) NULL,
  `actorUserId` int NOT NULL,
  `notes` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `settlement_evidence_audit_evidence_idx` (`evidenceId`,`createdAt`,`id`),
  KEY `settlement_evidence_audit_trade_idx` (`tradeId`,`createdAt`,`id`)
);
