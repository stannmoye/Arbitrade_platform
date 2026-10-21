-- Stage 4: enforce one database owner for each private support attachment object.
-- The portal migration runner preflights duplicate keys before executing this DDL.
ALTER TABLE `support_attachments`
  ADD UNIQUE INDEX `uq_support_attachment_storage_key` (`storageKey`);
