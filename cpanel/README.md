# cPanel deployment

This repository is a production Node.js application. It requires cPanel **Setup Node.js App** (Node 20+), MySQL/MariaDB, HTTPS, and cron. PHP-only hosting cannot run the Express server.

## 1. Create the cPanel resources

1. Create a MySQL database and a dedicated database user.
2. Grant that user all privileges on the application database.
3. Create a Node.js application in cPanel with the repository directory as the application root.
4. Set the startup file to `dist/index.js` and the application URL to the HTTPS domain.
5. Create the environment variables from `.env.example` in cPanel; do not upload `.env` to a public directory.

## 2. Install and initialize

From the Node application terminal:

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm build
ADMIN_EMAIL=admin@your-domain.example ADMIN_PASSWORD='use-a-new-12-character-password' \
CUSTOMER_EMAIL=customer@your-domain.example CUSTOMER_PASSWORD='use-a-different-12-character-password' \
pnpm accounts:provision
```

Run the provisioning command only through the private cPanel terminal. It creates or updates one administrator row and one customer row in `users`. Passwords are salted and hashed with scrypt and are never stored in the repository or `.env`.

The command prints the account email addresses only. Keep the two passwords in your private password manager and change them after the first login if they were used as temporary onboarding credentials.

## 3. Start and verify

Start/restart the cPanel Node application, then verify:

- `GET /api/health` returns `{"status":"ok"}`
- customer registration creates a row in `users`
- administrator login uses the provisioned database account
- no customer can access administrator procedures
- HTTPS cookies are enabled and the application URL is correct

## 4. Cron

Use cPanel Cron Jobs with UTC schedules for the scheduled handlers documented in `docs/deployment-v5.md`. Use the application's signed scheduler secret or protected server route; never expose a cron endpoint without authentication.

## 5. Production boundary

The product is production-deployable, but real-money execution and verified returns remain disabled until an actual execution/settlement provider is configured and approved. The application must not credit configured rates as real profit. Do not import development/demo seed data into production.

## 6. Recovery

Back up MySQL before migrations. Restore the database first, run forward migrations, reconcile wallet balances against the immutable ledger, then restart the Node application. Keep `.env`, uploads, logs, and database backups outside the public web root.
