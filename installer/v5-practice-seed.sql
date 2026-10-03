-- V5 practice seed only. Never run this against a live-money database.
INSERT INTO asset_precisions (code, scale, minimumUnit, roundingMode) VALUES
('USD', 2, '0.01', 'half_up'), ('EUR', 2, '0.01', 'half_up'), ('GBP', 2, '0.01', 'half_up'),
('BTC', 8, '0.00000001', 'down'), ('ETH', 18, '0.000000000000000001', 'down')
ON DUPLICATE KEY UPDATE scale=VALUES(scale), minimumUnit=VALUES(minimumUnit), roundingMode=VALUES(roundingMode);
INSERT INTO companies (name, logoUrl) VALUES ('Arbitrade Research Lab', '/arbitrade-mark.svg');
INSERT INTO trading_types (name, description, mode) VALUES
('Spatial Arbitrage', 'Practice route analytics across venues.', 'PRACTICE'),
('Triangular Arbitrage', 'Research-only three-leg route analysis.', 'RESEARCH'),
('Cross-Exchange Arbitrage', 'Simulation-only cross-venue opportunity.', 'SIMULATION')
ON DUPLICATE KEY UPDATE description=VALUES(description), mode=VALUES(mode);
INSERT INTO packages (name, maxPopupsPerMinute, maxActiveInvestments) VALUES
('Starter', 10, 1), ('Growth', 30, 3), ('Pro', 50, 5), ('Institutional', 100, 20)
ON DUPLICATE KEY UPDATE maxPopupsPerMinute=VALUES(maxPopupsPerMinute), maxActiveInvestments=VALUES(maxActiveInvestments);
