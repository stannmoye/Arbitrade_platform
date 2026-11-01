-- Automatic financial execution is not enabled by package eligibility or popup delivery.
-- Preserve each package's delivery policy and explicitly clear only the execution switch.
UPDATE `opportunity_package_policies`
SET `automaticTradingEnabled` = 0
WHERE `automaticTradingEnabled` <> 0;
