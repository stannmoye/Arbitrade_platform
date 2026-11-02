import assert from "node:assert/strict";
import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  closeDbPool,
  getDb,
  updateAdminTradingPackageSettings,
} from "../server/db";
import {
  opportunityPackagePolicies,
  packages,
  users,
  v5AuditEvents,
} from "../drizzle/schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
  throw new Error(
    "DATABASE_URL must target the disposable Package Settings integration database."
  );

let parsedUrl: URL;
try {
  parsedUrl = new URL(databaseUrl);
} catch {
  throw new Error(
    "DATABASE_URL is malformed; refusing to run Package Settings integration."
  );
}
const hostname = parsedUrl.hostname.replace(/^\[|\]$/g, "").toLowerCase();
const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ""));
if (!new Set(["localhost", "127.0.0.1", "::1"]).has(hostname)) {
  throw new Error(
    "Refusing Package Settings integration against a non-loopback database host."
  );
}
if (
  !/(?:^|_)(?:test|testing|integration|disposable)(?:_|$)/i.test(databaseName)
) {
  throw new Error(
    `Refusing Package Settings integration against non-disposable database '${databaseName}'.`
  );
}

const db = await getDb();
if (!db)
  throw new Error(
    "Package Settings integration requires the migrated disposable database."
  );
const pool = (db as any).$client;
if (!pool || typeof pool.query !== "function")
  throw new Error(
    "The database client does not expose the expected MySQL pool."
  );

const token = crypto.randomUUID().replace(/-/g, "");
const initialName = `pkg-settings-${token.slice(0, 24)}`;
const renamedName = `${initialName}-saved`;
const rollbackName = `${initialName}-rollback`;
const triggerName = `pkg_settings_rb_${token.slice(0, 32)}`;
const successReason = `Package Settings integration ${token}`;
const rollbackReason = `Package Settings rollback ${token}`;
let adminId = 0;
let packageId = 0;
let policyId = 0;
let triggerCreated = false;

function matchesInjectedSqlSignal(
  error: unknown,
  expectedMessage: string
): boolean {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const value = current as {
      cause?: unknown;
      message?: unknown;
      sqlMessage?: unknown;
      sqlState?: unknown;
    };
    const message = `${String(value.sqlMessage ?? "")} ${String(value.message ?? "")}`;
    if (value.sqlState === "45000" && message.includes(expectedMessage))
      return true;
    current = value.cause;
  }
  return false;
}

function settings(
  name: string,
  reason: string,
  overrides: Partial<
    Parameters<typeof updateAdminTradingPackageSettings>[1]
  > = {}
) {
  return {
    id: packageId,
    name,
    minimumQualifyingBalanceUsdMinor: 25000,
    durationMonths: 6,
    opportunitiesPerDay: 8,
    maxPopupsPerDay: 12,
    maxActiveInvestments: 2,
    startsAt: null,
    expiresAt: null,
    enabled: false,
    minimumPlatformFeeBps: 1250,
    maximumPlatformFeeBps: 2400,
    platformFeeRoundingMode: "up" as const,
    reason,
    ...overrides,
  };
}

async function readState() {
  const packageRow = (
    await db.select().from(packages).where(eq(packages.id, packageId)).limit(1)
  )[0];
  const policyRow = (
    await db
      .select()
      .from(opportunityPackagePolicies)
      .where(eq(opportunityPackagePolicies.id, policyId))
      .limit(1)
  )[0];
  assert.ok(
    packageRow,
    "The disposable Package Settings package fixture must exist."
  );
  assert.ok(
    policyRow,
    "The disposable Package Settings policy fixture must exist."
  );
  return { packageRow, policyRow };
}

try {
  const userInsert = await db.insert(users).values({
    openId: `pkg-settings-${token}-admin`,
    name: "Package Settings integration administrator",
    email: `pkg-settings-${token}@example.invalid`,
    role: "admin",
    packageName: "Starter",
  });
  adminId = Number(userInsert[0].insertId);

  const packageInsert = await db.insert(packages).values({
    name: initialName,
    minimumQualifyingBalanceUsdMinor: 10000,
    durationMonths: 1,
    opportunitiesPerDay: 3,
    termsVersion: 7,
    maxPopupsPerDay: 5,
    maxActiveInvestments: 1,
    enabled: false,
  });
  packageId = Number(packageInsert[0].insertId);

  const policyInsert = await db.insert(opportunityPackagePolicies).values({
    packageName: initialName,
    enabled: false,
    automaticDelivery: false,
    minimumPayoutRateBps: 200,
    maximumPayoutRateBps: 300,
    minimumTradeDurationSeconds: 300,
    maximumTradeDurationSeconds: 900,
    minimumPlatformFeeBps: 1500,
    maximumPlatformFeeBps: 1500,
    platformFeeRoundingMode: "up",
    policyVersion: 11,
  });
  policyId = Number(policyInsert[0].insertId);

  const beforeCommit = await readState();
  await assert.rejects(
    updateAdminTradingPackageSettings(
      adminId,
      settings(initialName, successReason, {
        minimumPlatformFeeBps: 3000,
        maximumPlatformFeeBps: 2000,
      })
    ),
    /Platform fee bounds must satisfy/
  );
  const afterInvalid = await readState();
  assert.equal(
    afterInvalid.packageRow.termsVersion,
    beforeCommit.packageRow.termsVersion,
    "Invalid settings must not increment the package version."
  );
  assert.equal(
    afterInvalid.policyRow.policyVersion,
    beforeCommit.policyRow.policyVersion,
    "Invalid settings must not increment the policy version."
  );
  assert.equal(
    afterInvalid.packageRow.name,
    beforeCommit.packageRow.name,
    "Invalid settings must not change the package."
  );
  assert.equal(
    afterInvalid.policyRow.minimumPlatformFeeBps,
    beforeCommit.policyRow.minimumPlatformFeeBps,
    "Invalid settings must not change the package policy."
  );

  await updateAdminTradingPackageSettings(
    adminId,
    settings(renamedName, successReason)
  );
  const afterCommit = await readState();
  assert.equal(afterCommit.packageRow.name, renamedName);
  assert.equal(afterCommit.packageRow.minimumQualifyingBalanceUsdMinor, 25000);
  assert.equal(afterCommit.packageRow.durationMonths, 6);
  assert.equal(afterCommit.packageRow.opportunitiesPerDay, 8);
  assert.equal(
    afterCommit.packageRow.termsVersion,
    Number(beforeCommit.packageRow.termsVersion) + 1,
    "A successful Package Settings save must increment the package version exactly once."
  );
  assert.equal(
    afterCommit.policyRow.packageName,
    renamedName,
    "Renaming a package must rename its policy in the same committed transaction."
  );
  assert.equal(afterCommit.policyRow.minimumPlatformFeeBps, 1250);
  assert.equal(afterCommit.policyRow.maximumPlatformFeeBps, 2400);
  assert.equal(afterCommit.policyRow.platformFeeRoundingMode, "up");
  assert.equal(
    afterCommit.policyRow.policyVersion,
    Number(beforeCommit.policyRow.policyVersion) + 1,
    "A successful Package Settings save must increment the policy version exactly once."
  );

  const committedAudits = await db
    .select()
    .from(v5AuditEvents)
    .where(
      and(
        eq(v5AuditEvents.action, "trading_package_settings_updated"),
        eq(v5AuditEvents.entityId, String(packageId)),
        eq(v5AuditEvents.reason, successReason)
      )
    );
  assert.equal(
    committedAudits.length,
    1,
    "A successful atomic save must persist exactly one audit event."
  );
  assert.equal(committedAudits[0].actorUserId, adminId);
  assert.match(
    String(committedAudits[0].reference),
    new RegExp(`^trading-package-settings:${packageId}:`)
  );
  const auditMetadata = JSON.parse(String(committedAudits[0].metadataJson));
  assert.equal(
    auditMetadata.new.termsVersion,
    Number(afterCommit.packageRow.termsVersion)
  );
  assert.equal(
    auditMetadata.new.policyVersion,
    Number(afterCommit.policyRow.policyVersion)
  );

  const beforeRollback = await readState();
  await pool.query(`CREATE TRIGGER \`${triggerName}\` BEFORE INSERT ON v5_audit_events FOR EACH ROW
    BEGIN
      IF NEW.action='trading_package_settings_updated' AND NEW.reason='${rollbackReason}' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='forced package settings rollback';
      END IF;
    END`);
  triggerCreated = true;

  await assert.rejects(
    updateAdminTradingPackageSettings(
      adminId,
      settings(rollbackName, rollbackReason, {
        minimumQualifyingBalanceUsdMinor: 50000,
        durationMonths: 12,
        opportunitiesPerDay: 10,
        maxPopupsPerDay: 20,
        minimumPlatformFeeBps: 1800,
        maximumPlatformFeeBps: 2800,
        platformFeeRoundingMode: "half_even",
      })
    ),
    error => matchesInjectedSqlSignal(error, "forced package settings rollback")
  );

  const afterRollback = await readState();
  assert.equal(
    afterRollback.packageRow.name,
    beforeRollback.packageRow.name,
    "An audit insert failure must roll back the package rename."
  );
  assert.equal(
    afterRollback.packageRow.minimumQualifyingBalanceUsdMinor,
    beforeRollback.packageRow.minimumQualifyingBalanceUsdMinor,
    "An audit insert failure must roll back all package term changes."
  );
  assert.equal(
    afterRollback.packageRow.durationMonths,
    beforeRollback.packageRow.durationMonths
  );
  assert.equal(
    afterRollback.packageRow.opportunitiesPerDay,
    beforeRollback.packageRow.opportunitiesPerDay
  );
  assert.equal(
    afterRollback.packageRow.maxPopupsPerDay,
    beforeRollback.packageRow.maxPopupsPerDay
  );
  assert.equal(
    afterRollback.packageRow.termsVersion,
    beforeRollback.packageRow.termsVersion,
    "An audit insert failure must roll back the package version."
  );
  assert.equal(
    afterRollback.policyRow.packageName,
    beforeRollback.policyRow.packageName,
    "An audit insert failure must roll back the matching policy rename."
  );
  assert.equal(
    afterRollback.policyRow.minimumPlatformFeeBps,
    beforeRollback.policyRow.minimumPlatformFeeBps
  );
  assert.equal(
    afterRollback.policyRow.maximumPlatformFeeBps,
    beforeRollback.policyRow.maximumPlatformFeeBps
  );
  assert.equal(
    afterRollback.policyRow.platformFeeRoundingMode,
    beforeRollback.policyRow.platformFeeRoundingMode
  );
  assert.equal(
    afterRollback.policyRow.policyVersion,
    beforeRollback.policyRow.policyVersion,
    "An audit insert failure must roll back the policy version."
  );
  const rolledBackAudits = await db
    .select()
    .from(v5AuditEvents)
    .where(
      and(
        eq(v5AuditEvents.action, "trading_package_settings_updated"),
        eq(v5AuditEvents.entityId, String(packageId)),
        eq(v5AuditEvents.reason, rollbackReason)
      )
    );
  assert.equal(
    rolledBackAudits.length,
    0,
    "A rolled-back save must not leave an audit event."
  );

  await pool.query(`DROP TRIGGER \`${triggerName}\``);
  triggerCreated = false;
  console.log(
    "Package Settings integration passed: invalid-input no-write, atomic package/policy commit, single version/audit increments, rename consistency, and rollback after injected audit persistence failure."
  );
} finally {
  if (triggerCreated)
    await pool
      .query(`DROP TRIGGER IF EXISTS \`${triggerName}\``)
      .catch(() => {});
  if (packageId) {
    await db
      .delete(v5AuditEvents)
      .where(
        and(
          eq(v5AuditEvents.action, "trading_package_settings_updated"),
          eq(v5AuditEvents.entityId, String(packageId))
        )
      )
      .catch(() => {});
    await db
      .delete(opportunityPackagePolicies)
      .where(eq(opportunityPackagePolicies.id, policyId))
      .catch(() => {});
    await db
      .delete(packages)
      .where(eq(packages.id, packageId))
      .catch(() => {});
  }
  if (adminId)
    await db
      .delete(users)
      .where(eq(users.id, adminId))
      .catch(() => {});
  await closeDbPool();
}
