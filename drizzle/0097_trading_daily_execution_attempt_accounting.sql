-- Keep the customer-wide UTC-day attempt budget separate from lifetime per-event retry counts.
-- Legacy executionAttemptCount is cumulative, while executionRetryDay records only
-- the latest technical retry window. Neither field can reconstruct each historical
-- attempt's UTC day, so legacy rows intentionally start uncharged (0 / NULL).
-- New claims populate and reset the dedicated daily counter using the current UTC day.
ALTER TABLE `opportunity_popup_events`
  ADD COLUMN IF NOT EXISTS `executionDailyAttemptCount` int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `executionDailyAttemptDay` varchar(10) NULL;

-- Bound customer/day aggregate reads as the event table grows.
CREATE INDEX IF NOT EXISTS `opportunity_popup_user_daily_attempt_day_idx`
  ON `opportunity_popup_events` (`userId`, `executionDailyAttemptDay`);
