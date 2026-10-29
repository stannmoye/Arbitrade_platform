CREATE TABLE IF NOT EXISTS admin_wallet_adjustment_requests (
  id INT NOT NULL AUTO_INCREMENT,
  adminId INT NOT NULL,
  idempotencyKey VARCHAR(160) NOT NULL,
  requestHash VARCHAR(64) NOT NULL,
  resultJson LONGTEXT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY admin_wallet_adjustment_requests_admin_key_uq (adminId, idempotencyKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
