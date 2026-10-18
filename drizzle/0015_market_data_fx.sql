ALTER TABLE `opportunity_offers`
  ADD COLUMN IF NOT EXISTS `instrumentId` int NULL,
  ADD COLUMN IF NOT EXISTS `marketSnapshotId` int NULL,
  ADD COLUMN IF NOT EXISTS `marketValueUsd` varchar(64) NULL,
  ADD COLUMN IF NOT EXISTS `sector` varchar(120) NULL,
  ADD COLUMN IF NOT EXISTS `industry` varchar(160) NULL,
  ADD COLUMN IF NOT EXISTS `listingStatus` varchar(40) NULL,
  ADD COLUMN IF NOT EXISTS `marketObservedAt` timestamp NULL,
  ADD COLUMN IF NOT EXISTS `simulationSeed` varchar(128) NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `market_instruments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `symbol` varchar(40) NOT NULL,
  `name` varchar(240) NOT NULL,
  `exchange` varchar(80) NULL,
  `country` varchar(80) NULL,
  `sector` varchar(120) NULL,
  `industry` varchar(160) NULL,
  `listingStatus` varchar(40) NOT NULL DEFAULT 'active',
  `source` varchar(80) NOT NULL,
  `rawJson` text NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), UNIQUE KEY `market_instruments_symbol_unique` (`symbol`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `market_snapshots` (
  `id` int AUTO_INCREMENT NOT NULL,
  `instrumentId` int NOT NULL,
  `priceUsd` varchar(64) NULL,
  `marketValueUsd` varchar(64) NULL,
  `volume` varchar(64) NULL,
  `netChange` varchar(64) NULL,
  `percentChange` varchar(64) NULL,
  `observedAt` timestamp NOT NULL,
  `source` varchar(80) NOT NULL,
  `rawJson` text NOT NULL,
  PRIMARY KEY (`id`), KEY `market_snapshots_instrument_observed_idx` (`instrumentId`,`observedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `fx_rate_snapshots` (
  `id` int AUTO_INCREMENT NOT NULL,
  `baseAsset` varchar(16) NOT NULL,
  `quoteAsset` varchar(16) NOT NULL,
  `rate` varchar(64) NOT NULL,
  `provider` varchar(80) NOT NULL,
  `sourceDate` varchar(16) NULL,
  `observedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `rawJson` text NOT NULL,
  PRIMARY KEY (`id`), KEY `fx_rate_snapshots_pair_observed_idx` (`baseAsset`,`quoteAsset`,`observedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
