#!/usr/bin/env node
// SMTP credentials are stored encrypted through Arbitrade's authenticated admin portal.
// This command intentionally does not read SMTP secrets from the host environment.
console.error("SMTP is configured in the Arbitrade admin portal, not in the server environment.");
console.error("Sign in as an administrator, open the Email delivery centre, save the transport settings, and use Send test.");
process.exit(2);
