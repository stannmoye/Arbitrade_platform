ALTER TABLE `customer_controls`
  ADD COLUMN IF NOT EXISTS `autoTradeEnabled` boolean NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS `autoTradeAmountMinor` int NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS `autoTradeMinRewardBps` int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `autoTradeDailyLimit` int NOT NULL DEFAULT 5;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `missed_opportunities` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `offerId` int NOT NULL,
  `symbol` varchar(40) NOT NULL,
  `currency` varchar(12) NOT NULL,
  `amountMinor` int NOT NULL,
  `potentialRewardMinor` int NOT NULL,
  `expectedRewardBps` int NOT NULL,
  `reason` varchar(80) NOT NULL,
  `status` enum('MISSED','EXECUTED') NOT NULL DEFAULT 'MISSED',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE now(),
  CONSTRAINT `missed_opportunities_id` PRIMARY KEY(`id`),
  UNIQUE KEY `missed_opportunities_user_offer_unique` (`userId`,`offerId`),
  KEY `missed_opportunities_user_status_idx` (`userId`,`status`,`createdAt`)
);
--> statement-breakpoint

UPDATE `customer_controls` SET `autoTradeEnabled`=TRUE WHERE `autoTradeEnabled` IS NULL;
