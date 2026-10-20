-- Stage 4: durable announcement campaign identity and per-recipient delivery reporting.
CREATE TABLE IF NOT EXISTS `notification_campaigns` (
  `id` int NOT NULL AUTO_INCREMENT,
  `createdBy` int NOT NULL,
  `eventKey` varchar(120) NOT NULL,
  `title` varchar(200) NOT NULL,
  `body` text NOT NULL,
  `category` varchar(40) NOT NULL,
  `priority` varchar(20) NOT NULL,
  `href` varchar(512) NULL,
  `targetUserId` int NULL,
  `status` enum('draft','published','expired','failed') NOT NULL DEFAULT 'draft',
  `scheduledAt` timestamp NULL DEFAULT NULL,
  `expiresAt` timestamp NULL DEFAULT NULL,
  `publishedAt` timestamp NULL DEFAULT NULL,
  `totalRecipientCount` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `notification_campaign_creator_event_uq` (`createdBy`, `eventKey`),
  KEY `notification_campaign_status_scheduled_idx` (`status`, `scheduledAt`),
  KEY `notification_campaign_expiry_idx` (`expiresAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notification_campaign_deliveries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `campaignId` int NOT NULL,
  `userId` int NOT NULL,
  `notificationId` int NULL,
  `status` enum('pending','delivered','read','failed','expired') NOT NULL DEFAULT 'pending',
  `errorCode` varchar(80) NULL,
  `attemptedAt` timestamp NULL DEFAULT NULL,
  `deliveredAt` timestamp NULL DEFAULT NULL,
  `readAt` timestamp NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `notification_campaign_delivery_recipient_uq` (`campaignId`, `userId`),
  KEY `notification_campaign_delivery_status_idx` (`campaignId`, `status`),
  KEY `notification_campaign_delivery_user_status_idx` (`userId`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
