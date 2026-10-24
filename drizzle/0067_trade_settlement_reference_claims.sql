-- Enforce global uniqueness for new settlement references under concurrent manual settlement.
-- Existing trade history remains untouched; legacy references are still checked against trade_positions.
CREATE TABLE IF NOT EXISTS `trade_settlement_reference_claims` (
  `settlementReference` varchar(160) NOT NULL,
  `tradeId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`settlementReference`),
  UNIQUE KEY `trade_settlement_reference_claim_trade_unique` (`tradeId`),
  KEY `trade_settlement_reference_claim_created_idx` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
