-- One-time backup codes for customer authenticator recovery.
-- Only SHA-256 hashes of high-entropy recovery codes are persisted.
ALTER TABLE customer_totp_authenticators
  ADD COLUMN recoveryCodesHash TEXT NULL;
