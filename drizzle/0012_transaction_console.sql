CREATE TABLE IF NOT EXISTS `transaction_console_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sessionKey` varchar(96) NOT NULL,
  `userId` int NOT NULL,
  `eventType` varchar(64) NOT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'COMPLETED',
  `title` varchar(200) NOT NULL,
  `message` text NOT NULL,
  `transactionCode` varchar(80),
  `amountMinor` int,
  `asset` varchar(32),
  `metadataJson` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `transaction_console_events_id` PRIMARY KEY(`id`),
  INDEX `transaction_console_events_session_idx` (`userId`,`sessionKey`,`id`)
);
