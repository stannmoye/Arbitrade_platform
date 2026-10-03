CREATE TABLE `opportunity_package_policies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`packageName` varchar(40) NOT NULL,
	`maxPopupsPerMinute` int NOT NULL DEFAULT 10,
	`maxVisibleOffers` int NOT NULL DEFAULT 10,
	`enabled` boolean NOT NULL DEFAULT true,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `opportunity_package_policies_id` PRIMARY KEY(`id`),
	CONSTRAINT `opportunity_package_policies_packageName_unique` UNIQUE(`packageName`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `packageName` varchar(40) DEFAULT 'Starter' NOT NULL;