-- Stage 4: allow administrators to withdraw scheduled or published campaigns
-- while retaining delivery records and already-created notification rows.
ALTER TABLE `notification_campaigns`
  MODIFY COLUMN `status` enum('draft','scheduled','published','expired','failed','withdrawn') NOT NULL DEFAULT 'draft';

ALTER TABLE `notification_campaign_deliveries`
  MODIFY COLUMN `status` enum('pending','delivered','read','failed','expired','withdrawn') NOT NULL DEFAULT 'pending';
