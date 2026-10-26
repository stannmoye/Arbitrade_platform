-- Durable, bounded same-day retries for temporary Trading allocation failures.
ALTER TABLE `opportunity_popup_events`
  ADD COLUMN `executionStatus` enum('READY','RUNNING','RETRYING','SUCCEEDED','FAILED') NOT NULL DEFAULT 'READY',
  ADD COLUMN `executionAttemptCount` int NOT NULL DEFAULT 0,
  ADD COLUMN `executionRetryAfter` timestamp NULL DEFAULT NULL,
  ADD COLUMN `executionRetryDay` varchar(10) DEFAULT NULL,
  ADD COLUMN `executionLastErrorCode` varchar(80) DEFAULT NULL,
  ADD KEY `opportunity_popup_execution_retry_idx` (`executionStatus`, `executionRetryAfter`, `id`);
