# Opportunity Usage Reset database integration

`server/opportunity-usage-reset.mysql.integration.test.ts` exercises the administrator reset API against a real migrated MySQL/MariaDB database. The suite covers individual and all-customer resets, multiple package subscriptions, expired and pending opportunities, protected active trade positions, wallet and ledger snapshots, package-policy preservation, authorization, operation-id idempotency, concurrent replay, and transaction rollback after a database failure.

Run it against a disposable migrated database only:

```sh
DATABASE_URL=mysql://root:root@127.0.0.1:3306/arbitrade_opportunity_worker_test \
RUN_OPPORTUNITY_USAGE_RESET_DB_INTEGRATION=1 \
pnpm exec vitest run server/opportunity-usage-reset.mysql.integration.test.ts
```

The GitHub Actions workflow `trading-opportunity-worker-integration.yml` runs this suite in its existing MySQL 8.4 and MariaDB 11.4 matrix after applying guarded migrations. The suite refuses non-loopback or non-disposable database names and remains skipped when the integration flag is absent.

The reset transaction now also marks matching pending rows in `opportunity_delivery_events` as expired with `ADMIN_OPPORTUNITY_USAGE_RESET`, so the durable delivery queue cannot retain stale pending records after the popup rows and offers are reset. Protected offers linked to active trade positions remain unchanged.
