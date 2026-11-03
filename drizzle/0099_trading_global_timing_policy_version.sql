-- Seed the optimistic-concurrency version for the existing canonical Trade timing keys.
-- Existing timing values are deliberately preserved; this migration does not infer
-- or copy settings from per-package policy rows.
INSERT INTO app_settings (settingKey, settingValue, updatedBy)
VALUES ('trade.timingPolicyVersion', '1', NULL)
ON DUPLICATE KEY UPDATE settingKey = VALUES(settingKey);
