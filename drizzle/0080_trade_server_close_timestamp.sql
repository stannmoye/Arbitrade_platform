-- Persist the authoritative server-owned close timestamp for each allocated trade.
-- Existing rows remain NULL because their historical opening/close policy cannot be reconstructed safely.
ALTER TABLE `trade_positions`
  ADD COLUMN IF NOT EXISTS `closesAt` timestamp NULL;
