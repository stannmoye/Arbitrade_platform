CREATE TABLE IF NOT EXISTS `opportunity_delivery_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `offerId` int NOT NULL,
  `quotaDay` varchar(10) NOT NULL,
  `deliveredAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `opportunity_delivery_user_offer_day_unique` (`userId`,`offerId`,`quotaDay`),
  KEY `opportunity_delivery_user_day_idx` (`userId`,`quotaDay`,`deliveredAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
