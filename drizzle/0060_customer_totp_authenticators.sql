-- Customer authenticator enrollment. Secrets are AES-256-GCM encrypted by the application.
-- Configure TOTP_ENCRYPTION_KEY before enabling enrollment; no plaintext secret is persisted.
CREATE TABLE IF NOT EXISTS `customer_totp_authenticators` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `secretCiphertext` varchar(512) NULL,
  `pendingSecretCiphertext` varchar(512) NULL,
  `pendingExpiresAt` timestamp NULL,
  `confirmedAt` timestamp NULL,
  `lastUsedStep` bigint NOT NULL DEFAULT -1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_totp_user_unique` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
