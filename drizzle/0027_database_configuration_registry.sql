INSERT INTO `app_settings` (`settingKey`, `settingValue`)
VALUES
  ('autoTrade.globalEnabled', 'false'),
  ('email.provider', 'disabled'),
  ('email.fromName', 'WiseBond Support'),
  ('email.fromAddress', 'no-reply@wisebond.org'),
  ('email.replyTo', ''),
  ('ticket.maxAttachmentMb', '25'),
  ('ticket.allowedMimeTypes', 'image/*,application/pdf,text/plain,.doc,.docx,.xls,.xlsx'),
  ('opportunity.countdownSeconds', '90'),
  ('signup.autoCreditMinor', '1000'),
  ('signup.autoCreditCurrency', 'USD'),
  ('sound.settings', '{"opportunity":"soft-chime","credit":"credit","debit":"debit","enabled":true,"loopOpportunity":false}'),
  ('signup.defaultRule', 'automatic'),
  ('signup.countryRules', '{}'),
  ('signup.features', '{"emailVerification":true,"twofa":true,"deviceAlerts":true,"passwordPolicy":true,"duplicateDetection":true,"riskScoring":true,"referrals":false,"termsConsent":true,"ageGate":true,"welcomeEmail":true}'),
  ('policy.defaults', '{"kyc":true,"withdrawals":true,"twofa":true,"facial":false}'),
  ('branding.settings', '{"platformName":"WiseBond","tagline":"Transparent digital asset intelligence","browserTitle":"WiseBond","accentColor":"#7CE7C2","logoUrl":"/arbitrade-mark.svg","faviconUrl":"/arbitrade-mark.svg","shareImageUrl":""}')
ON DUPLICATE KEY UPDATE `settingKey` = `settingKey`;
