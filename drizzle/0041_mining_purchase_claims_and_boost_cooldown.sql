CREATE TABLE IF NOT EXISTS mining_package_purchase_claims (
  userId INT NOT NULL,
  packageId INT NOT NULL,
  firstPurchaseId INT NULL,
  firstQuoteId INT NULL,
  claimedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (userId,packageId),
  UNIQUE KEY uq_mining_package_claim_purchase (firstPurchaseId),
  UNIQUE KEY uq_mining_package_claim_quote (firstQuoteId),
  INDEX idx_mining_package_claim_package (packageId,claimedAt)
) ENGINE=InnoDB;

INSERT IGNORE INTO mining_package_purchase_claims
  (userId,packageId,firstPurchaseId,firstQuoteId,claimedAt)
SELECT cp.userId,cp.packageId,cp.id,cp.quoteId,COALESCE(cp.purchasedAt,UTC_TIMESTAMP(3))
FROM mining_customer_packages cp
JOIN mining_ledger_transactions tx ON tx.id=cp.ledgerTransactionId
WHERE tx.transactionType='package_purchase' AND cp.quoteId IS NOT NULL;
