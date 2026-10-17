CREATE UNIQUE INDEX `trade_positions_user_offer_unique` ON `trade_positions` (`userId`, `offerId`);
--> statement-breakpoint
CREATE UNIQUE INDEX `opportunity_delivery_user_offer_day_unique` ON `opportunity_delivery_events` (`userId`, `offerId`, `quotaDay`);
--> statement-breakpoint
CREATE UNIQUE INDEX `balance_ledger_reference_unique` ON `balance_ledger` (`reference`);
