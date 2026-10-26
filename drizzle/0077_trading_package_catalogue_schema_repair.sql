-- Forward-only repair for legacy package tables used by the Trading package catalogue.
-- Add only absent columns. New legacy rows remain disabled by default so this cannot
-- accidentally activate old package records or alter existing customer entitlements.
ALTER TABLE `packages`
  ADD COLUMN IF NOT EXISTS `startsAt` timestamp NULL,
  ADD COLUMN IF NOT EXISTS `expiresAt` timestamp NULL,
  ADD COLUMN IF NOT EXISTS `maxPopupsPerDay` int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `maxActiveInvestments` int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `enabled` tinyint(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
