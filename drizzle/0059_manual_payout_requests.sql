-- Manual payout tickets reserve funds inside the existing customer wallet ledger.
-- No external payment or custody provider is called by this workflow.
CREATE TABLE IF NOT EXISTS `payout_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `requestReference` varchar(72) NOT NULL,
  `idempotencyKey` varchar(180) NOT NULL,
  `currency` varchar(12) NOT NULL,
  `amountMinor` bigint NOT NULL,
  `destinationType` enum('bank_transfer','crypto_transfer') NOT NULL,
  `destinationDetails` text NOT NULL,
  `status` enum('pending','paid','rejected','cancelled') NOT NULL DEFAULT 'pending',
  `externalReference` varchar(160) NULL,
  `resolutionNote` varchar(1000) NULL,
  `resolvedBy` int NULL,
  `resolvedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `payout_requests_reference_unique` (`requestReference`),
  UNIQUE KEY `payout_requests_idempotency_unique` (`idempotencyKey`),
  KEY `payout_requests_user_created_idx` (`userId`,`createdAt`,`id`),
  KEY `payout_requests_status_created_idx` (`status`,`createdAt`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
