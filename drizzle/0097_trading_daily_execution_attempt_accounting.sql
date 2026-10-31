-- Keep the customer-wide UTC-day attempt budget separate from lifetime per-event retry counts.
-- Existing attempts are attributed to their recorded retry day; future claims update
-- an independently resettable daily counter.
ALTER TABLE `opportunity_popup_events`
  ADD COLUMN IF NOT EXISTS `executionDailyAttemptCount` int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `executionDailyAttemptDay` varchar(10) NULL;

UPDATE `opportunity_popup_events`
SET `executionDailyAttemptCount` = `executionAttemptCount`,
    `executionDailyAttemptDay` = `executionRetryDay`
WHERE `executionAttemptCount` > 0
  AND `executionRetryDay` IS NOT NULL
  AND `executionDailyAttemptDay` IS NULL;
