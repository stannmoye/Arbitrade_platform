-- Durable ownership token fences a stale worker after a claim expires and is reclaimed.
-- Additive and idempotent for both tracked migrations and runtime-schema repair.
ALTER TABLE `opportunity_popup_events`
  ADD COLUMN IF NOT EXISTS `executionLeaseToken` varchar(64) NULL;
