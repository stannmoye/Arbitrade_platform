-- Default safe informational opportunity delivery to ON only for the untouched
-- migration-created global control row. A saved administrator decision (updatedBy
-- or a later policyVersion) is never overwritten. Financial execution is not changed.
UPDATE `app_settings`
SET `settingValue` = JSON_SET(
  `settingValue`,
  '$.tierPolicyMasterEnabled', JSON_EXTRACT('true', '$'),
  '$.informationalPopupDeliveryEnabled', JSON_EXTRACT('true', '$'),
  '$.companyRotationEnabled', JSON_EXTRACT('true', '$'),
  '$.randomizedTimingEnabled', JSON_EXTRACT('true', '$'),
  '$.burstDeliveryEnabled', JSON_EXTRACT('true', '$')
),
`updatedAt` = CURRENT_TIMESTAMP
WHERE `settingKey` = 'trade.globalControls'
  AND `updatedBy` IS NULL
  AND JSON_VALID(`settingValue`) = 1
  AND COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(`settingValue`, '$.policyVersion')) AS UNSIGNED), 0) = 1;
