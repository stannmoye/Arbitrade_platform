INSERT INTO `opportunity_package_policies`
  (`packageName`, `maxPopupsPerDay`, `maxVisibleOffers`, `minHourlyTarget`, `normalHourlyTarget`, `marketInfluenceBps`, `burstEnabled`, `maxBurstSize`, `enabled`)
VALUES
  ('Starter', 50, 10, 2, 2, 3000, FALSE, 0, TRUE),
  ('Growth', 100, 20, 2, 4, 5000, TRUE, 2, TRUE),
  ('Pro', 200, 40, 4, 6, 7000, TRUE, 3, TRUE),
  ('Institutional', 500, 100, 6, 10, 8500, TRUE, 3, TRUE)
ON DUPLICATE KEY UPDATE
  `packageName` = VALUES(`packageName`);
