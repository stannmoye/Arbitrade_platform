# Arbitrade PHP/MySQL cPanel port — first slice

This folder is a **separate PHP/PDO implementation track**. It does not replace the existing Node application yet; the Node deployment remains the rollback/reference implementation while the remaining customer and admin workflows are ported and tested.

## Compatibility target

- PHP **8.2+** (tested here with PHP 8.3.6)
- `PDO` and `pdo_mysql`
- MySQL 8 or compatible MariaDB, InnoDB, `utf8mb4`
- Apache `mod_rewrite` (enabled on typical cPanel accounts)
- HTTPS enabled for the site

No Node runtime is required to run `public/index.php`. The original React/TypeScript source remains in the repository as the visual/behavior reference during the migration.

## Import the single database file

1. In cPanel, create an empty MySQL database and a dedicated database user; grant that user privileges on only this database.
2. Open phpMyAdmin, select the empty database, choose **Import**, and upload the separately delivered `arbitrade_sandbox_full.sql` backup. The private backup is intentionally not committed to this repository.
3. The file contains the current sandbox schema and records (86 tables), including the two portal accounts. It does not contain database connection credentials or plaintext passwords. The final two `UPDATE` statements convert the portal account hashes to PHP `password_hash()`-compatible bcrypt hashes so this PHP port can authenticate them with `password_verify()`.
4. Treat the SQL file as private: it contains account emails, salted password hashes, and application data. Do not place it in `public_html` or commit it to GitHub.

The SQL file was imported into a disposable MySQL database and verified: all 86 tables imported, both account rows were present, and PHP `password_verify()` accepted the shared password for both roles.

## Configure cPanel

1. Upload this `cpanel/php` folder to a private directory such as `/home/CPANELUSER/arbitrade-php/`.
2. Set the domain's document root to that folder's `public/` directory. Keep `app/`, `views/`, `config.local.php`, and the SQL file outside the document root.
3. Copy `config.example.php` to `config.local.php` in the `cpanel/php/` root and enter the cPanel database host, name, user, and password. Set `force_https` to `true`. Make the local config readable only by the cPanel account (normally mode `0600`).
4. Ensure `public/.htaccess` is uploaded and `mod_rewrite` is enabled. Do not expose SQL exports, config files, logs, or installer utilities through the document root.
5. Open `/login`, then use the account address and password supplied for this sandbox. The server reads the user's role from MySQL; choosing an admin URL does not grant admin permissions.

Routes in this slice:

- `GET /api/health` — confirms PHP can query MySQL
- `GET /api/auth/me`, `POST /api/auth/login`, `POST /api/auth/logout`
- `GET /customer` — customer wallet/ledger **read-only** view
- `GET /ops-console-7f3a` — role-protected admin overview and customer directory **read-only** view

The PHP API dispatcher also has staged, role-gated modules for wallet summaries, trade history, notifications, support tickets, KYC status, customer administration, and KYC administration. Dotted source-procedure names are accepted in the final URL segment, for example `/api/php/customer-wallet/customer.balances`. Every route checks the authenticated role; writes require the existing CSRF token.

Financial execution is deliberately not exposed: customer opportunity delivery, investing, trade settlement, staking allocations/rewards, auto-trading controls, administrator balance adjustments, and manual currency-rate updates are unavailable in this PHP slice. Customer KYC is status-only until email/SMS/document/liveness providers and protected evidence storage are configured. Unsupported operations return 404 rather than silently simulating success.

## Status and remaining work

This is an initial migration slice, **not full feature parity or production-ready for operations**. The customer/admin pages and authentication are implemented in PHP; wallet, ledger, account-count, support-ticket, and KYC-status reads use PDO. Limited administrative account changes and support actions are available through role-gated APIs, but the customer/admin UI is not yet connected to every migrated module. Mutating financial actions are intentionally absent from this PHP phase.

The remaining work includes porting and testing the current Node API features: opportunity lifecycle and trade workflows, staking, wallet/preferences, KYC/verification, customer support and attachments, notifications/email, admin controls/audit/treasury, OAuth, scheduled jobs, and their UI actions. Until that is complete, keep the original Node application available and do not use this PHP slice to operate live funds. Real-money execution remains disabled unless a verified provider has been configured and approved.

## Local smoke test

Create a private `config.local.php` based on the example, then run:

```sh
php -S 127.0.0.1:8080 -t public public/router.php
```

Open `http://127.0.0.1:8080/login`. For localhost only, use `force_https => false`; retain `true` on the public cPanel site.
