CREATE TABLE IF NOT EXISTS `customer_controls` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `accountStatus` enum('active','suspended','restricted') NOT NULL DEFAULT 'active',
  `tradingEnabled` tinyint(1) NOT NULL DEFAULT 1,
  `withdrawalsEnabled` tinyint(1) NOT NULL DEFAULT 0,
  `kycRequired` tinyint(1) NOT NULL DEFAULT 1,
  `twoFactorRequired` tinyint(1) NOT NULL DEFAULT 0,
  `emailVerified` tinyint(1) NOT NULL DEFAULT 0,
  `riskTier` varchar(24) NOT NULL DEFAULT 'standard',
  `dailyTradeLimitMinor` int NOT NULL DEFAULT 2500000,
  `adminNote` text NULL,
  `updatedBy` int NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_controls_user_unique` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
