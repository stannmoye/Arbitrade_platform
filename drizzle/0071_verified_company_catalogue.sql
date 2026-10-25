ALTER TABLE `companies`
  ADD COLUMN `ticker` varchar(32) NULL,
  ADD COLUMN `exchangeCode` varchar(32) NULL,
  ADD COLUMN `instrumentType` varchar(24) NOT NULL DEFAULT 'equity',
  ADD COLUMN `listingStatus` varchar(24) NOT NULL DEFAULT 'unverified',
  ADD COLUMN `headquartersCity` varchar(120) NULL,
  ADD COLUMN `headquartersCountry` varchar(120) NULL,
  ADD COLUMN `countryCode` char(2) NULL,
  ADD COLUMN `sector` varchar(120) NULL,
  ADD COLUMN `providerId` varchar(120) NULL,
  ADD COLUMN `dataSource` varchar(160) NULL,
  ADD COLUMN `sourceUrl` varchar(512) NULL,
  ADD COLUMN `lastVerifiedAt` timestamp NULL,
  ADD COLUMN `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

CREATE INDEX `companies_listing_country_idx` ON `companies` (`listingStatus`, `countryCode`);
CREATE INDEX `companies_exchange_ticker_idx` ON `companies` (`exchangeCode`, `ticker`);
CREATE UNIQUE INDEX `companies_provider_identity_unique` ON `companies` (`providerId`);

CREATE TABLE `company_rotation_events` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `eventKey` varchar(180) NOT NULL,
  `companyId` int NOT NULL,
  `opportunityId` int NULL,
  `userId` int NULL,
  `rotationCycle` bigint NOT NULL,
  `selectionReason` varchar(160) NOT NULL,
  `filterSnapshotJson` text NULL,
  `selectedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `company_rotation_event_key_unique` (`eventKey`),
  KEY `company_rotation_selected_at_idx` (`selectedAt`),
  KEY `company_rotation_company_idx` (`companyId`, `selectedAt`)
);
