CREATE TABLE IF NOT EXISTS `customer_opportunity_rules` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `enabled` boolean NOT NULL DEFAULT true,
  `minimumRewardBps` int NOT NULL DEFAULT 50,
  `maxDailyAllocationMinor` int NOT NULL DEFAULT 100000,
  `allowedAssets` varchar(255) NOT NULL DEFAULT 'USD,EUR,GBP,BTC,ETH',
  `quietHoursStart` varchar(5) NOT NULL DEFAULT '22:00',
  `quietHoursEnd` varchar(5) NOT NULL DEFAULT '07:00',
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_opportunity_rules_user_unique` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
