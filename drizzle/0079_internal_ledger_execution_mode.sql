-- Retire legacy practice/simulation/research opportunity modes.
-- Existing records are normalized to the approved internal-ledger model.
-- Historical migrations remain immutable; this is the forward schema transition.
ALTER TABLE `trading_types`
  MODIFY COLUMN `mode` ENUM('PRACTICE','SIMULATION','RESEARCH','LIVE','INTERNAL_LEDGER')
  NOT NULL DEFAULT 'INTERNAL_LEDGER';
--> statement-breakpoint
UPDATE `trading_types` SET `mode` = 'INTERNAL_LEDGER';
--> statement-breakpoint
ALTER TABLE `trading_types`
  MODIFY COLUMN `mode` ENUM('INTERNAL_LEDGER','LIVE')
  NOT NULL DEFAULT 'INTERNAL_LEDGER';
--> statement-breakpoint
ALTER TABLE `v5_opportunities`
  MODIFY COLUMN `practiceMode` ENUM('PRACTICE','SIMULATION','RESEARCH','INTERNAL_LEDGER','LIVE')
  NOT NULL DEFAULT 'INTERNAL_LEDGER';
--> statement-breakpoint
UPDATE `v5_opportunities` SET `practiceMode` = 'INTERNAL_LEDGER';
--> statement-breakpoint
ALTER TABLE `v5_opportunities`
  CHANGE COLUMN `practiceMode` `executionMode`
  ENUM('INTERNAL_LEDGER','LIVE') NOT NULL DEFAULT 'INTERNAL_LEDGER';
