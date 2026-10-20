# Arbitrade Installer v2 — Sandbox Release

**Installer version:** 2.0.0-sandbox.1  
**Source branch:** `release/arbitrade-installer-v2-sandbox`  
**Purpose:** Let the owner install and inspect the existing Arbitrade application after the first three development stages, using the existing universal installer design.

## What this package contains

- The built production client and server (`dist/`).
- The existing browser setup wizard (`installer/index.php`).
- The existing guarded Node.js installer, migration safeguards, diagnostics, and VPS tools.
- The locked dependency manifests and setup documentation.
- A version marker so the sandbox package is distinguishable from the earlier installer.

The package is built from the Stage 3 branch and includes the existing repository work. It does not include the Stage 4 dashboard pull request.

## Download the sandbox installer

After the package workflow completes, open the workflow run and download the artifact named:

`arbitrade-installer-v2.0.0-sandbox.1`

The downloaded artifact contains `arbitrade-installer-v2.0.0-sandbox.1.zip`.

## Safe sandbox test

1. Use a disposable sandbox or a new, empty database. Do not point a fresh install at a database containing data you need.
2. Download and extract the ZIP into a private application directory.
3. Follow `DEPLOYMENT-README.txt` and `installer/README.md` for the cPanel or supported VPS path.
4. Use the browser wizard and the matching private-terminal install command. The installer refuses unsafe fresh-install/database states; do not remove its lock files to bypass a refusal.
5. Configure the Node.js app with startup file `dist/index.js`, then run `pnpm installer:verify` and `pnpm installer:diagnose`.
6. Remove or deny public access to `/installer/` after setup.

## Required environment

- Node.js 20+ (Node.js 22 recommended)
- pnpm 10.18.x
- MySQL 8-compatible or MariaDB
- HTTPS and private configuration storage for a hosted test

The installer package intentionally excludes `database.sql`, environment files, secrets, private keys, database dumps, and nested ZIP files. It does not contain live credentials or seed accounts.

## What this build proves — and does not prove

The workflow builds the production application and validates the installer archive structure and forbidden-file exclusions. It does not claim that deployment on your specific sandbox has passed; the actual installation and runtime behavior will be confirmed when you run it there.
