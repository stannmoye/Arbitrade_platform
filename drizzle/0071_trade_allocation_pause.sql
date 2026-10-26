-- Durable administrator safety gate for new allocations only. Existing trades and settlement remain available.
INSERT INTO `app_settings` (`settingKey`, `settingValue`, `updatedBy`)
VALUES (
  'trading.allocations.paused',
  '{"allocationsPaused":false,"reason":"","updatedAt":null,"updatedBy":null}',
  NULL
)
ON DUPLICATE KEY UPDATE `settingKey` = VALUES(`settingKey`);
