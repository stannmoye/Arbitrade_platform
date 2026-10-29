-- Durable request keys prevent duplicate wallet mutations after client retries or concurrent submissions.
-- The idempotency row and financial transaction response are committed atomically.
CREATE TABLE IF NOT EXISTS `admin_wallet_adjustment_idempotency` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `adminId` INT NOT NULL,
  `idempotencyKey` VARCHAR(160) NOT NULL,
  `requestHash` VARCHAR(64) NOT NULL,
  `responseJson` LONGTEXT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `admin_wallet_adjustment_key_uq` (`idempotencyKey`),
  KEY `admin_wallet_adjustment_created_idx` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
