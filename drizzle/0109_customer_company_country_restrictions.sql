-- Persist administrator-controlled company-country restrictions per customer.
-- NULL or an empty list means the customer has no additional country restriction.
ALTER TABLE `customer_controls`
  ADD COLUMN IF NOT EXISTS `companyCountryRestrictions` TEXT NULL;
