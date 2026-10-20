-- Stage 4: persist support-ticket ownership for the admin inbox.
ALTER TABLE `support_tickets`
  ADD COLUMN IF NOT EXISTS `assignedAdminId` int NULL;

CREATE INDEX IF NOT EXISTS `support_tickets_assigned_admin_idx`
  ON `support_tickets` (`assignedAdminId`);
