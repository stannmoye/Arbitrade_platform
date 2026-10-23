-- Preserve raw HTML/CSS notice content alongside structured sections.
-- LONGTEXT intentionally has no application-level word-count cap.
ALTER TABLE `privacy_policy_versions`
  ADD COLUMN `htmlContent` LONGTEXT NULL;
