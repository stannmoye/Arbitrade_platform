ALTER TABLE `customer_balances` ADD COLUMN `lockedMinor` int NOT NULL DEFAULT 0 AFTER `availableMinor`;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `stake_products` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(160) NOT NULL,
  `category` enum('CORE_STAKING','LIQUIDITY','LENDING','RESTAKING','YIELD','RWA') NOT NULL,
  `asset` varchar(32) NOT NULL,
  `annualRateBps` int NOT NULL,
  `durationDays` int NOT NULL,
  `minMinor` int NOT NULL,
  `maxMinor` int NOT NULL,
  `rewardFrequency` enum('DAILY','WEEKLY','MONTHLY') NOT NULL,
  `lockDays` int NOT NULL,
  `riskLevel` enum('LOW','MODERATE','ELEVATED','HIGH') NOT NULL,
  `status` enum('AVAILABLE','PAUSED') NOT NULL DEFAULT 'AVAILABLE',
  `supportsCompounding` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `stake_products_id` PRIMARY KEY(`id`),
  CONSTRAINT `stake_products_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `stake_positions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `positionCode` varchar(40) NOT NULL,
  `userId` int NOT NULL,
  `productId` int NOT NULL,
  `asset` varchar(32) NOT NULL,
  `principalMinor` int NOT NULL,
  `rewardMinor` int NOT NULL DEFAULT 0,
  `rewardCount` int NOT NULL DEFAULT 0,
  `status` enum('PENDING','PROCESSING','ACTIVE','REWARD_ACCRUING','SETTLING','COMPLETED','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `openedAt` timestamp NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `maturityAt` timestamp NOT NULL,
  `completedAt` timestamp NULL,
  `nextRewardAt` timestamp NULL,
  `originalLedgerReference` varchar(160) NOT NULL,
  CONSTRAINT `stake_positions_id` PRIMARY KEY(`id`),
  CONSTRAINT `stake_positions_code_unique` UNIQUE(`positionCode`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `stake_transactions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `transactionCode` varchar(48) NOT NULL,
  `userId` int NOT NULL,
  `positionId` int NOT NULL,
  `type` varchar(48) NOT NULL,
  `amountMinor` int NOT NULL,
  `asset` varchar(32) NOT NULL,
  `status` varchar(32) NOT NULL,
  `ledgerReference` varchar(160) NOT NULL,
  `idempotencyKey` varchar(160) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `completedAt` timestamp NULL,
  CONSTRAINT `stake_transactions_id` PRIMARY KEY(`id`),
  CONSTRAINT `stake_transactions_code_unique` UNIQUE(`transactionCode`),
  CONSTRAINT `stake_transactions_idempotency_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `stake_rewards` (
  `id` int AUTO_INCREMENT NOT NULL,
  `positionId` int NOT NULL,
  `userId` int NOT NULL,
  `amountMinor` int NOT NULL,
  `asset` varchar(32) NOT NULL,
  `status` enum('CALCULATED','VALIDATED','APPROVED','POSTED','FAILED') NOT NULL,
  `calculatedAt` timestamp NOT NULL,
  `postedAt` timestamp NULL,
  `ledgerReference` varchar(160),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `stake_rewards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `stake_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `positionId` int NOT NULL,
  `eventType` varchar(80) NOT NULL,
  `previousState` varchar(40) NOT NULL,
  `newState` varchar(40) NOT NULL,
  `amountMinor` int NOT NULL DEFAULT 0,
  `asset` varchar(32) NOT NULL,
  `metadataJson` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `stake_events_id` PRIMARY KEY(`id`)
);
