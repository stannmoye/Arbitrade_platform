-- Manual settlement is authoritative: elapsed time may mark a trade due, but never credits it.
ALTER TABLE `trade_positions`
  ADD COLUMN IF NOT EXISTS `settlementReference` varchar(160) NULL,
  ADD COLUMN IF NOT EXISTS `settlementConfirmedAt` timestamp NULL,
  ADD COLUMN IF NOT EXISTS `settlementConfirmedBy` int NULL,
  ADD COLUMN IF NOT EXISTS `settlementNotes` varchar(2000) NULL;

CREATE TABLE IF NOT EXISTS `trade_lifecycle_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tradeId` int NOT NULL,
  `userId` int NOT NULL,
  `eventType` varchar(48) NOT NULL,
  `stage` varchar(64) NOT NULL,
  `payloadJson` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `trade_lifecycle_event_unique` (`tradeId`,`eventType`),
  KEY `trade_lifecycle_trade_idx` (`tradeId`,`createdAt`),
  KEY `trade_lifecycle_user_idx` (`userId`,`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `app_settings` (`settingKey`,`settingValue`)
VALUES ('advancedAutoTrading.settlementMode','manual_admin_confirmation')
ON DUPLICATE KEY UPDATE `settingValue`=`settingValue`;
