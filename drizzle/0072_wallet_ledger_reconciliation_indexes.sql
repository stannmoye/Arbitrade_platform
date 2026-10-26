-- Non-unique indexes support bounded reconciliation scans. Wallet uniqueness is intentionally not imposed,
-- because duplicate rows must remain detectable and require evidence-backed reconciliation.
ALTER TABLE `customer_balances`
  ADD INDEX `customer_balances_user_currency_idx` (`userId`, `currency`);

ALTER TABLE `balance_ledger`
  ADD INDEX `balance_ledger_user_currency_idx` (`userId`, `currency`, `id`),
  ADD INDEX `balance_ledger_reference_idx` (`reference`);

ALTER TABLE `trade_positions`
  ADD INDEX `trade_positions_status_settlement_user_currency_idx` (`status`, `settlementStatus`, `userId`, `currency`),
  ADD INDEX `trade_positions_settlement_reference_idx` (`settlementReference`);
