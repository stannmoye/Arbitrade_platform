-- Reconcile non-financial settlement timing metadata on legacy trade rows.
-- creditAt may safely remain NULL (the settlement worker falls back to settlesAt).
-- lifecycleStage is operational metadata; the default does not confirm or settle a trade.
ALTER TABLE `trade_positions`
  ADD COLUMN IF NOT EXISTS `creditAt` timestamp NULL,
  ADD COLUMN IF NOT EXISTS `lifecycleStage` varchar(48) NOT NULL DEFAULT 'Trade Allocated';
