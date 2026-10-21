-- Support stable, bounded notification history scans for each customer.
CREATE INDEX IF NOT EXISTS `customer_notifications_user_created_id_idx`
  ON `customer_notifications` (`userId`, `createdAt`, `id`);
