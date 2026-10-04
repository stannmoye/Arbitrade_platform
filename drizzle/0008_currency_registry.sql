CREATE TABLE IF NOT EXISTS `currency_registry` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(32) NOT NULL,
  `name` varchar(120) NOT NULL,
  `symbol` varchar(16) NOT NULL,
  `scale` int NOT NULL DEFAULT 2,
  `assetType` enum('fiat','crypto','token') NOT NULL DEFAULT 'fiat',
  `usdRate` varchar(64) NOT NULL DEFAULT '1',
  `rateProvider` varchar(120) NOT NULL DEFAULT 'manual',
  `externalCode` varchar(80) NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `currency_registry_code_unique` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO `currency_registry` (`code`,`name`,`symbol`,`scale`,`assetType`,`usdRate`,`rateProvider`,`externalCode`) VALUES
('USD','US Dollar','$',2,'fiat','1','manual','USD'),
('EUR','Euro','€',2,'fiat','1.08','manual','EUR'),
('GBP','British Pound','£',2,'fiat','1.27','manual','GBP'),
('BTC','Bitcoin','₿',8,'crypto','65000','manual','BTC'),
('ETH','Ethereum','Ξ',8,'crypto','3500','manual','ETH');
