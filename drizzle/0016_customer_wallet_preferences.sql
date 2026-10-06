CREATE TABLE IF NOT EXISTS `customer_wallet_preferences` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `tradingCurrency` varchar(32) NOT NULL DEFAULT 'USD',
  `swapCurrency` varchar(32) NOT NULL DEFAULT 'USD',
  `autoTopUpEnabled` boolean NOT NULL DEFAULT false,
  `withdrawalWhitelistEnabled` boolean NOT NULL DEFAULT true,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_wallet_preferences_user_unique` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
