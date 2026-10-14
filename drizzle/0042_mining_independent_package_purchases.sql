ALTER TABLE mining_economics_versions
  ADD COLUMN IF NOT EXISTS packagePurchasesEnabled TINYINT(1) NOT NULL DEFAULT 0 AFTER globalEnabled;
