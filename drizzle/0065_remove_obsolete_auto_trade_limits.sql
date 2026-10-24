-- Remove retired auto-trade sizing/count settings. Trade sizing is governed by
-- package bounds and the customer's available balance; reward and daily ceilings remain.
ALTER TABLE `customer_controls`
  DROP COLUMN `autoTradeAmountMinor`,
  DROP COLUMN `autoTradeDailyLimit`;
