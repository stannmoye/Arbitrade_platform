-- Index active automatically assigned entitlements for bounded Trading worker batches.
CREATE INDEX IF NOT EXISTS `customer_package_subscriptions_worker_status_user_idx`
  ON `customer_package_subscriptions` (`status`, `userId`, `startsAt`);
