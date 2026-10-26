-- Admin-configurable bounded delay for temporary Trading execution retries.
ALTER TABLE `opportunity_package_policies`
  ADD COLUMN IF NOT EXISTS `tradeRetryDelaySeconds` int NOT NULL DEFAULT 30;
