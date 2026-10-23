CREATE TABLE IF NOT EXISTS `customer_api_keys` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `name` varchar(80) NOT NULL,
  `keyPrefix` varchar(24) NOT NULL,
  `keyHash` varchar(64) NOT NULL,
  `scopesJson` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastUsedAt` timestamp NULL DEFAULT NULL,
  `revokedAt` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_api_keys_hash_uq` (`keyHash`),
  KEY `customer_api_keys_user_created_idx` (`userId`, `createdAt`, `id`),
  KEY `customer_api_keys_user_revoked_idx` (`userId`, `revokedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
