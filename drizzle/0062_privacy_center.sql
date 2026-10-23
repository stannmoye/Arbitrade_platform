-- Privacy Centre: versioned notices, scoped customer requests, request history and privacy audit events.
CREATE TABLE IF NOT EXISTS `privacy_policy_versions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `versionLabel` VARCHAR(40) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `summary` VARCHAR(700) NOT NULL DEFAULT '',
  `controllerName` VARCHAR(200) NOT NULL DEFAULT 'Platform operator',
  `controllerAddress` VARCHAR(500) NOT NULL DEFAULT '',
  `privacyContact` VARCHAR(320) NOT NULL DEFAULT 'Use the Privacy Centre request form or authenticated Support Centre',
  `applicableJurisdiction` VARCHAR(180) NOT NULL DEFAULT '',
  `sectionsJson` LONGTEXT NOT NULL,
  `status` ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  `effectiveAt` TIMESTAMP NULL,
  `publishedAt` TIMESTAMP NULL,
  `publishedBy` INT NULL,
  `createdBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `privacy_policy_version_label_uq` (`versionLabel`),
  KEY `privacy_policy_status_published_idx` (`status`, `publishedAt`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `privacy_requests` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `requestReference` VARCHAR(48) NOT NULL,
  `idempotencyKey` VARCHAR(80) NOT NULL,
  `userId` INT NOT NULL,
  `requestType` ENUM('access','correction','deletion','restriction','objection','other') NOT NULL,
  `subject` VARCHAR(180) NOT NULL,
  `details` TEXT NULL,
  `status` ENUM('submitted','identity_check','in_review','awaiting_customer','completed','declined','cancelled') NOT NULL DEFAULT 'submitted',
  `assignedAdminId` INT NULL,
  `reviewedBy` INT NULL,
  `reviewedAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `privacy_request_reference_uq` (`requestReference`),
  UNIQUE KEY `privacy_request_idempotency_uq` (`userId`, `idempotencyKey`),
  KEY `privacy_requests_user_created_idx` (`userId`, `createdAt`, `id`),
  KEY `privacy_requests_status_created_idx` (`status`, `createdAt`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `privacy_request_events` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `requestId` INT NOT NULL,
  `actorType` ENUM('customer','admin','system') NOT NULL,
  `actorUserId` INT NULL,
  `eventType` VARCHAR(48) NOT NULL,
  `previousStatus` VARCHAR(32) NULL,
  `newStatus` VARCHAR(32) NULL,
  `customerMessage` TEXT NULL,
  `internalNote` TEXT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `privacy_request_events_request_created_idx` (`requestId`, `createdAt`, `id`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `privacy_audit_events` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `actorUserId` INT NOT NULL,
  `action` VARCHAR(80) NOT NULL,
  `entityType` VARCHAR(64) NOT NULL,
  `entityId` VARCHAR(80) NULL,
  `metadataJson` TEXT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `privacy_audit_actor_created_idx` (`actorUserId`, `createdAt`, `id`),
  KEY `privacy_audit_action_created_idx` (`action`, `createdAt`)
) ENGINE=InnoDB;

INSERT INTO `privacy_policy_versions`
  (`versionLabel`, `title`, `summary`, `controllerName`, `controllerAddress`, `privacyContact`, `applicableJurisdiction`, `sectionsJson`, `status`, `effectiveAt`, `publishedAt`)
SELECT
  '1.0',
  'Privacy Notice',
  'How information is handled across account services, financial records, security and customer rights.',
  'Platform operator',
  '',
  'Use the Privacy Centre request form or authenticated Support Centre',
  '',
  '[{"id":"overview","title":"Our privacy commitment","body":"This Privacy Notice explains how information is handled in connection with your account and your use of this platform. Our approach is designed to use information for defined service, security and recordkeeping purposes, restrict access according to responsibility, and keep our practices understandable. The information and choices described below depend on the services available to your account and the requirements that apply to your circumstances. Where applicable privacy law provides additional rights, those rights remain available in accordance with that law."},{"id":"information","title":"Information we handle","body":"Depending on your account and the features you use, information may include your name, email address, account identifiers, profile details, identity-verification submissions and outcomes, financial account and activity records, service instructions, device and browser details, IP address information, session and authentication events, and messages you send to customer support. We aim to collect information relevant to the service or review being performed."},{"id":"purposes","title":"How information is used","body":"Information supports account administration, authentication, identity and eligibility reviews, fraud and misuse prevention, financial recordkeeping and reconciliation, customer service, security investigations, service reliability, required reporting, and the establishment or defence of legal rights. Where consent is required for a specific use, that use should not proceed until the appropriate consent has been obtained."},{"id":"financial-records","title":"Financial records and account integrity","body":"Records relating to account balances, financial activity, instructions, statements, and ledger or reconciliation history help maintain accurate customer records and support review, audit, dispute resolution, and applicable recordkeeping obligations. These records may be subject to retention requirements that differ from those applying to general profile preferences."},{"id":"sharing","title":"When information may be shared","body":"Information may be made available to authorized service providers supporting hosting, communications, identity verification, security, or other required platform functions; professional advisers and auditors with a legitimate role; public or regulatory authorities where disclosure is lawfully required; or other parties where you direct the disclosure or where a necessary legal, security, or dispute-resolution purpose permits it. Access should be limited to what is reasonably necessary and subject to appropriate safeguards."},{"id":"security","title":"Safeguards and restricted access","body":"The platform uses account authentication, password hashing, signed HTTP-only session cookies, role-based server-side authorization, and available additional-authentication controls. Access to sensitive information should be limited by role and operational need. Safeguards vary by information type and hosting or provider arrangement. No electronic system or method of transmission can be guaranteed to be completely secure."},{"id":"retention","title":"Retention and deletion","body":"Information is retained for as long as reasonably necessary for its stated purpose and to meet applicable legal, regulatory, security, accounting, audit, fraud-prevention, and dispute-resolution obligations. When information is no longer required, it should be securely deleted, anonymized, or otherwise disposed of where permitted. Account closure does not automatically mean that every associated record can be immediately erased."},{"id":"rights","title":"Your privacy rights","body":"Depending on the law that applies to you, you may be able to request access to, correction of, deletion of, or restriction of certain personal information, or raise an objection or question about its handling. Some requests may be limited by applicable retention obligations or other lawful exceptions. We may need to verify your identity before responding. Use the privacy request form in this Centre so your request receives a reference and a tracked review."},{"id":"storage","title":"Cookies, sessions and preferences","body":"Essential browser storage and session cookies support sign-in and core account functionality. The application may also remember preferences selected in the workspace. Clearing browser storage can sign you out or reset local preferences, but it does not itself erase records held in authorized account systems. Any optional tracking or storage must be described according to the features actually enabled and the choices required by applicable law."},{"id":"transfers","title":"Service providers and processing locations","body":"Information may be processed in locations where the platform operator or its authorized service providers operate. Where cross-border transfer requirements apply, the operator should use appropriate safeguards and provide any notices required by law. To ask which service providers or processing locations may apply to your account, submit a request through this Centre."},{"id":"updates-contact","title":"Policy updates and privacy contact","body":"This Notice may be revised when services, safeguards, or applicable requirements change. The published version, effective date, and revision history are shown in this Centre. Where required by applicable law, we will provide notice of material changes and request any necessary consent or renewed acknowledgement through the relevant process. For questions or requests, use the Privacy Centre request form or the authenticated Support Centre. Do not include passwords, authentication codes, or unnecessary sensitive documents in ordinary messages."}]',
  'published',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM `privacy_policy_versions` WHERE `status` = 'published'
);
