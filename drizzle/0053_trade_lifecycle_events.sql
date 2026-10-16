-- Durable backend lifecycle events for customer trade progress restoration.
-- Append-only and additive; internal ledger settlement is not external market execution.
CREATE TABLE IF NOT EXISTS `trade_lifecycle_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `eventKey` varchar(100) NOT NULL,
  `tradeId` int NOT NULL,
  `userId` int NOT NULL,
  `stage` varchar(48) NOT NULL,
  `status` varchar(24) NOT NULL,
  `reference` varchar(160) NULL,
  `policyVersion` int NOT NULL DEFAULT 1,
  `detailJson` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `trade_lifecycle_event_key_unique` (`eventKey`),
  KEY `trade_lifecycle_trade_idx` (`tradeId`,`createdAt`),
  KEY `trade_lifecycle_user_idx` (`userId`,`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- USDT wallet representation uses six native decimal places. The USD reference is
-- explicitly manual and is not a live market quote; administrators must maintain it.
INSERT INTO `currency_registry` (`code`,`name`,`symbol`,`scale`,`assetType`,`usdRate`,`rateProvider`,`externalCode`,`enabled`)
SELECT 'USDT','Tether USD','₮',6,'token','1','manual-reference','USDT',1
WHERE NOT EXISTS (SELECT 1 FROM `currency_registry` WHERE `code`='USDT');
