-- Currency minor-unit values can exceed the signed 32-bit INT range (for example, 10,000 USDT at scale 6).
-- Widen storage without changing existing values, defaults, signedness, or nullability.
ALTER TABLE customer_balances
  MODIFY COLUMN availableMinor BIGINT NOT NULL DEFAULT 0,
  MODIFY COLUMN lockedMinor BIGINT NOT NULL DEFAULT 0,
  MODIFY COLUMN promotionalMinor BIGINT NOT NULL DEFAULT 0,
  MODIFY COLUMN earnedMinor BIGINT NOT NULL DEFAULT 0;

ALTER TABLE balance_ledger
  MODIFY COLUMN amountMinor BIGINT NOT NULL;

ALTER TABLE customer_controls
  MODIFY COLUMN autoTradeAmountMinor BIGINT NOT NULL DEFAULT 10000,
  MODIFY COLUMN dailyTradeLimitMinor BIGINT NOT NULL DEFAULT 2500000;

ALTER TABLE customer_opportunity_rules
  MODIFY COLUMN maxDailyAllocationMinor BIGINT NOT NULL DEFAULT 100000;

ALTER TABLE kyc_stage_requirements
  MODIFY COLUMN transactionLimitMinor BIGINT NULL;

ALTER TABLE missed_opportunities
  MODIFY COLUMN amountMinor BIGINT NOT NULL,
  MODIFY COLUMN potentialRewardMinor BIGINT NOT NULL;

ALTER TABLE opportunity_offers
  MODIFY COLUMN minimumMinor BIGINT NOT NULL;

ALTER TABLE opportunity_popup_events
  MODIFY COLUMN minimumMinor BIGINT NOT NULL,
  MODIFY COLUMN balanceAvailableMinor BIGINT NOT NULL DEFAULT 0;

ALTER TABLE stake_events
  MODIFY COLUMN amountMinor BIGINT NOT NULL DEFAULT 0;

ALTER TABLE stake_positions
  MODIFY COLUMN principalMinor BIGINT NOT NULL,
  MODIFY COLUMN rewardMinor BIGINT NOT NULL DEFAULT 0;

ALTER TABLE stake_products
  MODIFY COLUMN minMinor BIGINT NOT NULL,
  MODIFY COLUMN maxMinor BIGINT NOT NULL;

ALTER TABLE stake_rewards
  MODIFY COLUMN amountMinor BIGINT NOT NULL;

ALTER TABLE stake_transactions
  MODIFY COLUMN amountMinor BIGINT NOT NULL;

ALTER TABLE trade_positions
  MODIFY COLUMN principalMinor BIGINT NOT NULL,
  MODIFY COLUMN expectedRewardMinor BIGINT NOT NULL;

ALTER TABLE transaction_console_events
  MODIFY COLUMN amountMinor BIGINT NULL;
