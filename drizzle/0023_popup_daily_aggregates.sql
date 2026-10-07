CREATE TABLE IF NOT EXISTS `opportunity_popup_daily` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `eventDate` varchar(10) NOT NULL,
  `deliveredCount` int NOT NULL DEFAULT 0,
  `noticedCount` int NOT NULL DEFAULT 0,
  `openedCount` int NOT NULL DEFAULT 0,
  `dismissedCount` int NOT NULL DEFAULT 0,
  `withdrawnCount` int NOT NULL DEFAULT 0,
  `tradedCount` int NOT NULL DEFAULT 0,
  `settledCount` int NOT NULL DEFAULT 0,
  `zeroBalanceCount` int NOT NULL DEFAULT 0,
  `lastEventAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `opportunity_popup_daily_user_date_unique` (`userId`,`eventDate`),
  KEY `opportunity_popup_daily_date_idx` (`eventDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
