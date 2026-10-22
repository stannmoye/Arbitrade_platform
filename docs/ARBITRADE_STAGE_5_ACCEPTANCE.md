# Stage 5 Acceptance — Authenticator and Manual Payouts

## Scope represented in source

- Customer authenticator enrollment and TOTP verification, encrypted with the stable `TOTP_ENCRYPTION_KEY`.
- Hashed/one-time recovery-code workflow and tests.
- Manual payout requests with currency/destination validation, idempotency, transactional reservation/release, customer cancellation, and administrator resolution.
- Drizzle migrations `0059_manual_payout_requests.sql`, `0060_customer_totp_authenticators.sql`, and `0061_customer_totp_recovery_codes.sql`.
- Customer/admin payout UI, corresponding server routes/database helpers, contract tests, MySQL integration tests, and browser-acceptance script.

## Automated evidence before consolidation

The original feature branch's exact head (`20d4e3b9516051a1386316aee0c51a65e3e446f7`) passed its installer validation, mining regression, and five-theme workflows:
- [Installer validation](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39748368328)
- [Mining regression](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39748368242)
- [Five-theme validation](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39748368253)

The portal-render-recovery branch's exact head (`ec99a433b76be2c67775fe27743eff278bcc2278`) passed its installer, mining-regression, and five-theme workflows:
- [Installer validation](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39850405791)
- [Mining regression](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39850405628)
- [Five-theme validation](https://github.com/stannmoye/Arbitrade_platform/actions/runs/39850405626)

These results apply to those individual branch heads. The combined candidate must pass CI on its own commit before merge.

## Acceptance checklist

### Source and CI

- [x] Source files, migrations, feature UI, and regression tests are present on the integration candidate.
- [x] `TOTP_ENCRYPTION_KEY` is documented in `.env.example` and the deployment guide.
- [ ] Combined candidate passes TypeScript validation, all tests, and production build.
- [ ] Combined candidate passes installer/migration and MySQL/MariaDB compatibility checks.
- [ ] Combined candidate's portal recovery/browser acceptance checks pass on the exact head.

### Hosted acceptance — required before production certification

- [ ] Back up the production database and verify a recovery path before applying migrations.
- [ ] Confirm a customer can enroll an authenticator, verify a current TOTP code, and use each recovery code only once.
- [ ] Confirm TOTP secrets remain decryptable after a restart using the same configured encryption key.
- [ ] Confirm manual payout requests validate currency and destination, reserve funds atomically, and are idempotent under repeated submission.
- [ ] Confirm customer cancellation and administrator rejection release reservations once; approval/settlement requires the expected external reference and does not duplicate ledger mutations.
- [ ] Confirm the customer and administrator portal show visible content or a recovery card rather than a silent blank main workspace.
- [ ] Confirm theme changes visibly affect nested content panels in both portals.
- [ ] Confirm the live service was built from the verified `main` SHA and reports healthy at `/api/health`.

## Release status

**Implementation source is integrated into the candidate; production acceptance is not yet signed off.** Do not report Stage 5 as production-certified until the exact-head CI and hosted checks above are recorded as passed. No production database migration or live financial operation is claimed by this document.
