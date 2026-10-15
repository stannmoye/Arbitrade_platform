-- Portal account provisioning is intentionally database-owned.
-- Do not create default users or passwords from migrations.
-- Use the private installer/provisioning command to write users and salted password hashes.
INSERT INTO app_settings (settingKey,settingValue) VALUES ('opportunity.deskLabel','WiseBond Market Intelligence Desk') ON DUPLICATE KEY UPDATE settingValue=VALUES(settingValue);
