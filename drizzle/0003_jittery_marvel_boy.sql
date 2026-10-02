CREATE TABLE `balance_ledger` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`currency` varchar(12) NOT NULL,
	`amountMinor` int NOT NULL,
	`entryType` varchar(40) NOT NULL,
	`reference` varchar(80) NOT NULL,
	`withdrawable` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `balance_ledger_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customer_balances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`currency` varchar(12) NOT NULL,
	`availableMinor` int NOT NULL DEFAULT 0,
	`promotionalMinor` int NOT NULL DEFAULT 0,
	`earnedMinor` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_balances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `opportunity_offers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`symbol` varchar(40) NOT NULL,
	`venueFrom` varchar(80) NOT NULL,
	`venueTo` varchar(80) NOT NULL,
	`currency` varchar(12) NOT NULL,
	`minimumMinor` int NOT NULL,
	`expectedRewardBps` int NOT NULL,
	`durationSeconds` int NOT NULL,
	`opensAt` timestamp NOT NULL,
	`closesAt` timestamp NOT NULL,
	`rewardAt` timestamp NOT NULL,
	`status` enum('scheduled','open','closed','settled','cancelled') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `opportunity_offers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trade_positions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`offerId` int NOT NULL,
	`currency` varchar(12) NOT NULL,
	`principalMinor` int NOT NULL,
	`expectedRewardMinor` int NOT NULL,
	`status` enum('pending','confirmed','settled','cancelled') NOT NULL DEFAULT 'confirmed',
	`confirmedAt` timestamp NOT NULL DEFAULT (now()),
	`settlesAt` timestamp NOT NULL,
	`settledAt` timestamp,
	CONSTRAINT `trade_positions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);