-- Durable, append-only operational history for opportunity delivery diagnostics.
-- Existing lifecycle rows remain the state source of truth; history rows record
-- only transitions actually observed by the current code paths.
CREATE TABLE IF NOT EXISTS `opportunity_delivery_history` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `offerId` INT NOT NULL,
  `eventKey` VARCHAR(120) NOT NULL,
  `eventType` VARCHAR(40) NOT NULL,
  `observedStatus` VARCHAR(24) NULL,
  `attemptNumber` INT NULL,
  `errorCode` VARCHAR(80) NULL,
  `occurredAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `opportunity_delivery_history_offer_event_uq` (`offerId`,`eventKey`),
  KEY `opportunity_delivery_history_offer_time_idx` (`offerId`,`occurredAt`,`id`),
  CONSTRAINT `opportunity_delivery_history_offer_fk`
    FOREIGN KEY (`offerId`) REFERENCES `opportunity_offers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `opportunity_popup_events`
  ADD KEY `opportunity_popup_customer_offer_history_idx` (`userId`,`offerId`,`id`);
--> statement-breakpoint
ALTER TABLE `users`
  ADD KEY `users_delivery_diagnostics_name_idx` (`name`(120),`id`);
--> statement-breakpoint
ALTER TABLE `opportunity_popup_events`
  ADD KEY `opportunity_popup_delivery_package_idx` (`packageName`,`createdAt`,`id`),
  ADD KEY `opportunity_popup_delivery_company_idx` (`companyDisplayName`,`createdAt`,`id`),
  ADD KEY `opportunity_popup_delivery_status_created_idx` (`deliveryStatus`,`createdAt`,`id`);
--> statement-breakpoint
ALTER TABLE `opportunity_generation_assignments`
  ADD KEY `opportunity_generation_assignments_delivery_generated_idx` (`generatedAt`,`id`),
  ADD KEY `opportunity_generation_assignments_delivery_package_idx` (`packageName`,`generatedAt`,`id`),
  ADD KEY `opportunity_generation_assignments_delivery_company_idx` (`companyReferenceId`,`generatedAt`,`id`);
--> statement-breakpoint
ALTER TABLE `opportunity_delivery_history`
  ADD KEY `opportunity_delivery_history_type_offer_time_idx` (`eventType`,`offerId`,`occurredAt`);
