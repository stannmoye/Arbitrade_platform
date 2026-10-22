ARBITRADE — FULL APPLICATION RELEASE
=====================================

This ZIP is the complete Arbitrade application package, not a stage-only patch.
Use INSTALLER-VERSION.txt, INSTALLER-BUILD.txt, and BUILD_PROVENANCE.txt to
identify the exact version, source commit, and integrated stages in this build.

BEFORE INSTALLING
1. Test in a disposable sandbox first and keep a verified backup of any
   existing database. Never use fresh-install mode against a database that
   contains data you need.
2. Keep the application root private, preferably outside public_html.
3. Configure a supported Node.js application (Node.js 22 recommended) with
   startup file dist/index.js. The production build and dependency tree are
   bundled in the ZIP.
4. Create a dedicated database and database user. Follow installer/README.md
   and cpanel/README.md for the supported deployment path.
5. Open /installer/ over HTTPS and follow the browser wizard. For a fresh,
   empty database, run this from the private application root:
     node installer/run-install.mjs --fresh-install
   For an existing database already imported from a verified backup, use only
   the guarded existing-database flow:
     node installer/run-install.mjs --existing-database --confirm-existing-migrations
6. Restart the Node.js application and run the installer verification and
   diagnostic commands documented in the installer README.
7. Configure HTTPS, verify /api/health, and then remove or deny public access
   to /installer/.

FRESH VPS
Use a disposable supported Debian/Ubuntu VPS. Review installer/vps-preflight.sh
and installer/vps-setup.sh --help before any sudo/root provisioning. Do not run
provisioning against a server with existing applications unless every proposed
host change has been reviewed.

SAFETY
- The release must not contain environment secrets, private keys, credentials,
  database dumps, database snapshots, or nested release ZIPs.
- Back up existing databases before migration.
- Never delete installer locks to force a reinstall.
- Real-money execution remains blocked until approved providers and an
  independently verified settlement mechanism are configured.
- Do not deploy to production or apply migrations without explicit owner
  authorization and the required acceptance evidence.
