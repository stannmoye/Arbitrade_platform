CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  tokenHash VARCHAR(128) NOT NULL UNIQUE,
  expiresAt TIMESTAMP NOT NULL,
  usedAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX password_reset_user_idx (userId),
  INDEX password_reset_expiry_idx (expiresAt)
);

CREATE TABLE IF NOT EXISTS admin_email_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  adminId INT NOT NULL,
  recipientCount INT NOT NULL DEFAULT 0,
  subject VARCHAR(255) NOT NULL,
  htmlBody MEDIUMTEXT NOT NULL,
  textBody TEXT NOT NULL,
  attachmentJson MEDIUMTEXT NULL,
  status ENUM('QUEUED','SENT','FAILED') NOT NULL DEFAULT 'QUEUED',
  lastError TEXT NULL,
  sentAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX admin_email_status_idx (status),
  INDEX admin_email_created_idx (createdAt)
);

INSERT INTO app_settings (settingKey, settingValue)
VALUES ('email.smtp', '{"mode":"direct","host":"127.0.0.1","port":25,"secure":false,"user":"","password":""}')
ON DUPLICATE KEY UPDATE settingKey=VALUES(settingKey);
INSERT INTO app_settings (settingKey, settingValue)
VALUES ('email.dailyCloseHourUtc', '23')
ON DUPLICATE KEY UPDATE settingKey=VALUES(settingKey);
INSERT INTO app_settings (settingKey, settingValue)
VALUES ('email.dailyCloseMinuteUtc', '59')
ON DUPLICATE KEY UPDATE settingKey=VALUES(settingKey);
