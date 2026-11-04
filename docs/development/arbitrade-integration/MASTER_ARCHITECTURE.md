# Arbitrade Opportunity Architecture

**Updated:** 2026-11-04  
**Integration authority:** Window 7

## Shared flow

1. **Catalogue and rotation (Window 1):** preserve the static 1,811-entry brand catalogue and expose the verified-for-display, enabled, non-archived company selection contract.
2. **Opportunity generation (Window 3):** own the non-financial generation engine and consume the Window 1 selection contract; do not create a competing catalogue or selector.
3. **Publishing and delivery:** use the repository's existing durable opportunity publication/delivery lifecycle and idempotency boundaries. Exact ownership of other implementation slices remains to be confirmed in the ownership register.
4. **Administration:** package and global settings remain persisted, authorized and audited; the UI must reflect backend policy.
5. **Monitoring and verification:** retain durable worker diagnostics, retries and disposable database/browser verification.
6. **Final integration (Window 7):** reconcile branches and migrations, resolve conflicts, run exact-head verification and produce the integrated handoff.

## Boundaries

Company display approval is not securities verification. Company rotation must not trigger real-money execution, customer fund allocation, transfers or settlement. Preserve authorization, audit and financial safeguards. Existing catalogue rows, local logos, customer records and historical snapshots are non-destructive.
