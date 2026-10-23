-- Required by the background workers even when no rewards or campaigns have been created yet.
-- Keep this migration in the main Drizzle journal so hosted deployments that run only
-- the standard Drizzle migration command still receive the worker tables.
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `mining_pending_boost_rewards` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `userId` INT NOT NULL,
  `rewardEventId` INT NULL,
  `rewardDay` DATE NOT NULL,
  `amountCki` DECIMAL(36,18) NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'pending',
  `settledAt` DATETIME(3) NULL,
  `settlementReference` VARCHAR(120) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_pending_boost_reward_event` (`rewardEventId`),
  UNIQUE KEY `uq_pending_boost_settlement_reference` (`settlementReference`),
  INDEX `idx_pending_boost_day_status` (`rewardDay`,`status`,`userId`)
) ENGINE=InnoDB;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `notification_campaigns` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `createdBy` INT NOT NULL,
  `eventKey` VARCHAR(120) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `body` TEXT NOT NULL,
  `category` VARCHAR(40) NOT NULL,
  `priority` VARCHAR(20) NOT NULL,
  `href` VARCHAR(512) NULL,
  `targetUserId` INT NULL,
  `status` ENUM('draft','scheduled','published','expired','failed','withdrawn') NOT NULL DEFAULT 'draft',
  `scheduledAt` TIMESTAMP NULL DEFAULT NULL,
  `expiresAt` TIMESTAMP NULL DEFAULT NULL,
  `publishedAt` TIMESTAMP NULL DEFAULT NULL,
  `totalRecipientCount` INT NOT NULL DEFAULT 0,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `notification_campaign_creator_event_uq` (`createdBy`, `eventKey`),
  KEY `notification_campaign_status_scheduled_idx` (`status`, `scheduledAt`),
  KEY `notification_campaign_expiry_idx` (`expiresAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `notification_campaign_deliveries` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `campaignId` INT NOT NULL,
  `userId` INT NOT NULL,
  `notificationId` INT NULL,
  `status` ENUM('pending','delivered','read','failed','expired','withdrawn') NOT NULL DEFAULT 'pending',
  `errorCode` VARCHAR(80) NULL,
  `attemptedAt` TIMESTAMP NULL DEFAULT NULL,
  `deliveredAt` TIMESTAMP NULL DEFAULT NULL,
  `readAt` TIMESTAMP NULL DEFAULT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `notification_campaign_delivery_recipient_uq` (`campaignId`, `userId`),
  KEY `notification_campaign_delivery_status_idx` (`campaignId`, `status`),
  KEY `notification_campaign_delivery_user_status_idx` (`userId`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
