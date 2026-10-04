ALTER TABLE `support_tickets` ADD COLUMN `category` varchar(40) NOT NULL DEFAULT 'account' AFTER `subject`;
