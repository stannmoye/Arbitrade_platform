-- Retire the duplicate customer_controls daily limit. The enforced per-customer
-- daily allocation is maintained in customer_opportunity_rules.maxDailyAllocationMinor.
ALTER TABLE `customer_controls`
  DROP COLUMN `dailyTradeLimitMinor`;
