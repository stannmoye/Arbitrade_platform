-- Stage 4: persist support-ticket ownership for the admin inbox.
ALTER TABLE `support_tickets`
  ADD COLUMN IF NOT EXISTS `assignedAdminId` int NULL;

-- MySQL does not support CREATE INDEX IF NOT EXISTS. Inspect information_schema
-- so repeated installs remain safe on both MySQL and MariaDB.
SET @stage4_ticket_assignment_index_exists = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'support_tickets'
    AND index_name = 'support_tickets_assigned_admin_idx'
);
SET @stage4_ticket_assignment_index_sql = IF(
  @stage4_ticket_assignment_index_exists = 0,
  'CREATE INDEX support_tickets_assigned_admin_idx ON support_tickets (assignedAdminId)',
  'SELECT 1'
);
PREPARE stage4_ticket_assignment_index_stmt FROM @stage4_ticket_assignment_index_sql;
EXECUTE stage4_ticket_assignment_index_stmt;
DEALLOCATE PREPARE stage4_ticket_assignment_index_stmt;
