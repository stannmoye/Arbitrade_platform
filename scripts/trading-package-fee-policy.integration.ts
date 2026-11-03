import { eq } from "drizzle-orm";
import { closeDbPool, getDb, getPackageFeeHistory, getPackageFeePolicies, updatePackageFeePolicy } from "../server/db";
import { packages, tradingPackageFeePolicyVersions, v5AuditEvents } from "../drizzle/schema";

async function main() {
  if (process.env.RUN_DISPOSABLE_PACKAGE_FEE_INTEGRATION !== "1") {
    throw new Error("Refusing to run: set RUN_DISPOSABLE_PACKAGE_FEE_INTEGRATION=1 only for a disposable test database.");
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the disposable integration test.");
  const url = new URL(process.env.DATABASE_URL);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!/(?:^|[_-])(test|disposable)(?:[_-]|$)/i.test(databaseName)) {
    throw new Error("Refusing to connect: database name must explicitly include a test or disposable marker.");
  }
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");

  const packageName = `fee-test-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  let packageId: number | undefined;
  const auditReferences: string[] = [];
  try {
    const inserted = await db.insert(packages).values({ name: packageName });
    packageId = Number((inserted[0] as any).insertId);
    if (!Number.isSafeInteger(packageId) || packageId < 1) throw new Error("Could not create disposable package fixture.");
    let positiveVersionRejected = false;
    try {
      await updatePackageFeePolicy({
        packageId, expectedVersion: 1, feeRateBps: 1500, roundingMode: "half_up",
        effectiveAt: new Date(Date.now() + 5_000).toISOString(), reason: "Must be rejected before initialization",
      }, 2_147_000_001);
    } catch (error) {
      positiveVersionRejected = error instanceof Error && error.message.includes("not configured");
    }
    if (!positiveVersionRejected) throw new Error("Positive expected version was accepted for an unconfigured package.");
    const initialized = await updatePackageFeePolicy({
      packageId, expectedVersion: 0, feeRateBps: 1500, roundingMode: "half_up",
      effectiveAt: new Date(Date.now() + 5_000).toISOString(), reason: "Disposable admin initialization",
    }, 2_147_000_001);
    const initialAuditReference = `trading-package-fee-policy:${packageId}:1`;
    auditReferences.push(initialAuditReference);
    if (initialized.version !== 1 || initialized.feeRateBps !== 1500 || initialized.roundingMode !== "half_up" || initialized.source !== "admin_initial" || initialized.reason !== "Disposable admin initialization") {
      throw new Error("Admin-initialized package fee policy did not pass fresh read-back.");
    }
    const initial = (await getPackageFeePolicies()).find((row) => row.packageId === packageId);
    if (!initial || initial.packageName !== packageName || initial.feeRateBps !== 1500 || initial.version !== 1 || initial.source !== "admin_initial") {
      throw new Error("Package fee policy initial read failed.");
    }
    const initialAudit = (await db.select().from(v5AuditEvents).where(eq(v5AuditEvents.reference, initialAuditReference)).limit(1))[0];
    if (!initialAudit || initialAudit.actorUserId !== 2_147_000_001 || initialAudit.reason !== "Disposable admin initialization") {
      throw new Error("Package fee policy initialization audit record is missing or incorrect.");
    }

    const updated = await updatePackageFeePolicy({
      packageId, expectedVersion: 1, feeRateBps: 2375, roundingMode: "half_even",
      effectiveAt: new Date(Date.now() + 5_000).toISOString(), reason: "Disposable integration update",
    }, 2_147_000_001);
    const auditReference = `trading-package-fee-policy:${packageId}:2`;
    auditReferences.push(auditReference);
    if (updated.version !== 2 || updated.feeRateBps !== 2375 || updated.roundingMode !== "half_even" || updated.changedBy !== "2147000001") {
      throw new Error("Updated package fee policy did not pass fresh read-back.");
    }
    const history = await getPackageFeeHistory(packageId);
    if (history.length !== 2 || history[0].version !== 2 || history[1].version !== 1) {
      throw new Error("Package fee history was not append-only or did not return both versions.");
    }
    const audit = (await db.select().from(v5AuditEvents).where(eq(v5AuditEvents.reference, auditReference)).limit(1))[0];
    if (!audit || audit.actorUserId !== 2_147_000_001 || audit.reason !== "Disposable integration update") {
      throw new Error("Package fee policy update audit record is missing or incorrect.");
    }
    let staleRejected = false;
    try {
      await updatePackageFeePolicy({
        packageId, expectedVersion: 1, feeRateBps: 2500, roundingMode: "half_up",
        effectiveAt: new Date(Date.now() + 10_000).toISOString(), reason: "Must be rejected as stale",
      }, 2_147_000_001);
    } catch (error) {
      staleRejected = error instanceof Error && error.message.includes("stale");
    }
    if (!staleRejected || (await getPackageFeeHistory(packageId)).length !== 2) {
      throw new Error("Stale package fee write was not rejected without adding a version.");
    }
    console.log("Package fee policy disposable integration passed.");
  } finally {
    if (packageId) {
      for (const reference of auditReferences) await db.delete(v5AuditEvents).where(eq(v5AuditEvents.reference, reference));
      await db.delete(tradingPackageFeePolicyVersions).where(eq(tradingPackageFeePolicyVersions.packageId, packageId));
      await db.delete(packages).where(eq(packages.id, packageId));
    }
    await closeDbPool();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Disposable integration failed.");
  process.exit(1);
});
