-- Stage 4: metadata and database-enforced idempotency for persistent notifications.
ALTER TABLE `customer_notifications`
  ADD COLUMN IF NOT EXISTS `eventKey` varchar(180) NULL,
  ADD COLUMN IF NOT EXISTS `category` varchar(40) NOT NULL DEFAULT 'account',
  ADD COLUMN IF NOT EXISTS `priority` varchar(20) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS `href` varchar(512) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS `customer_notifications_event_key_uq`
  ON `customer_notifications` (`eventKey`);

CREATE INDEX IF NOT EXISTS `customer_notifications_user_read_created_idx`
  ON `customer_notifications` (`userId`, `readAt`, `createdAt`);
