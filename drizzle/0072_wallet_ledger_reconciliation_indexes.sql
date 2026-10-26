-- Non-unique indexes support bounded reconciliation scans. Wallet uniqueness is intentionally not imposed,
-- because duplicate rows must remain detectable and require evidence-backed reconciliation.
CREATE INDEX IF NOT EXISTS `customer_balances_user_currency_idx`
  ON `customer_balances` (`userId`, `currency`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `balance_ledger_user_currency_idx`
  ON `balance_ledger` (`userId`, `currency`, `id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `balance_ledger_reference_idx`
  ON `balance_ledger` (`reference`);
--> statement-breakpoint
-- The main journal runs before the standalone portal migration chain on a fresh install.
-- Ensure the columns used by these indexes exist without changing existing settlement data.
ALTER TABLE `trade_positions`
  ADD COLUMN IF NOT EXISTS `settlementStatus` varchar(32) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS `settlementReference` varchar(160) NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `trade_positions_status_settlement_user_currency_idx`
  ON `trade_positions` (`status`, `settlementStatus`, `userId`, `currency`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `trade_positions_settlement_reference_idx`
  ON `trade_positions` (`settlementReference`);
