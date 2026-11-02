import assert from "node:assert/strict";
import crypto from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  closeDbPool,
  getDb,
  getTradeSettlementPolicy,
  setTradeSettlementPolicy,
  updateAdminTradingPackageSettings,
} from "../server/db";
import {
  appSettings,
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
const timingTriggerName = `timing_settings_rb_${token.slice(0, 30)}`;
const successReason = `Package Settings integration ${token}`;
const rollbackReason = `Package Settings rollback ${token}`;
const timingSuccessReason = `Timing Settings integration ${token}`;
const timingRollbackReason = `Timing Settings rollback ${token}`;
const timingSettingKeys = [
  "trade.settlementDelaySeconds",
  "trade.creditDelaySeconds",
  "trade.interTradeCooldownSeconds",
  "opportunity.nextPopupFormulaDelaySeconds",
  "opportunity.popup.minGapSeconds",
  "opportunity.popup.displaySeconds",
  "opportunity.popup.preAlertSeconds",
  "opportunity.popup.jitterSeconds",
  "opportunity.popup.maxPerHour",
  "market.refreshIntervalMinutes",
  "trade.blockOpportunitiesUntilSettled",
  "trade.settings.timing.version",
];
let adminId = 0;
let packageId = 0;
let policyId = 0;
let triggerCreated = false;
let timingTriggerCreated = false;
let timingRowsBefore: Array<typeof appSettings.$inferSelect> | null = null;

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

function timingSettings(
  baseline: Awaited<ReturnType<typeof getTradeSettlementPolicy>>,
  reason: string,
  overrides: Partial<Parameters<typeof setTradeSettlementPolicy>[0]> = {}
) {
  return {
    delaySeconds: baseline.settlementDelaySeconds,
    creditDelaySeconds: baseline.creditDelaySeconds,
    cooldownSeconds: baseline.cooldownSeconds,
    nextPopupFormulaDelaySeconds: baseline.nextPopupFormulaDelaySeconds,
    popupCooldownSeconds: baseline.popupCooldownSeconds,
    popupDisplaySeconds: baseline.popupDisplaySeconds,
    popupPreAlertSeconds: baseline.popupPreAlertSeconds,
    popupJitterSeconds: baseline.popupJitterSeconds,
    popupMaxPerHour: baseline.popupMaxPerHour,
    marketRefreshIntervalMinutes: baseline.marketRefreshIntervalMinutes,
    blockUntilSettled: baseline.blockUntilSettled,
    reason,
    expectedVersion: baseline.settingsVersion,
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

  const successStartsAt = new Date("2026-11-03T12:00:00.000Z");
  const successExpiresAt = new Date("2027-11-03T12:00:00.000Z");
  await updateAdminTradingPackageSettings(
    adminId,
    settings(renamedName, successReason, {
      startsAt: successStartsAt,
      expiresAt: successExpiresAt,
    })
  );
  const afterCommit = await readState();
  assert.equal(afterCommit.packageRow.name, renamedName);
  assert.equal(afterCommit.packageRow.minimumQualifyingBalanceUsdMinor, 25000);
  assert.equal(afterCommit.packageRow.durationMonths, 6);
  assert.equal(afterCommit.packageRow.opportunitiesPerDay, 8);
  assert.equal(
    new Date(afterCommit.packageRow.startsAt!).toISOString(),
    successStartsAt.toISOString()
  );
  assert.equal(
    new Date(afterCommit.packageRow.expiresAt!).toISOString(),
    successExpiresAt.toISOString()
  );
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
  assert.equal(auditMetadata.old.name, initialName);
  assert.equal(auditMetadata.old.minimumQualifyingBalanceUsdMinor, 10000);
  assert.equal(auditMetadata.old.durationMonths, 1);
  assert.equal(auditMetadata.old.opportunitiesPerDay, 3);
  assert.equal(auditMetadata.old.maxPopupsPerDay, 5);
  assert.equal(auditMetadata.old.maxActiveInvestments, 1);
  assert.equal(auditMetadata.old.startsAt, null);
  assert.equal(auditMetadata.old.expiresAt, null);
  assert.equal(auditMetadata.old.enabled, false);
  assert.equal(
    auditMetadata.new.termsVersion,
    Number(afterCommit.packageRow.termsVersion)
  );
  assert.equal(
    auditMetadata.old.termsVersion,
    Number(beforeCommit.packageRow.termsVersion)
  );
  assert.equal(auditMetadata.old.minimumPlatformFeeBps, 1500);
  assert.equal(auditMetadata.old.maximumPlatformFeeBps, 1500);
  assert.equal(auditMetadata.old.platformFeeRoundingMode, "up");
  assert.equal(
    auditMetadata.old.policyVersion,
    Number(beforeCommit.policyRow.policyVersion)
  );
  assert.equal(auditMetadata.new.name, renamedName);
  assert.equal(auditMetadata.new.minimumQualifyingBalanceUsdMinor, 25000);
  assert.equal(auditMetadata.new.durationMonths, 6);
  assert.equal(auditMetadata.new.opportunitiesPerDay, 8);
  assert.equal(auditMetadata.new.maxPopupsPerDay, 12);
  assert.equal(auditMetadata.new.maxActiveInvestments, 2);
  assert.equal(
    new Date(auditMetadata.new.startsAt).toISOString(),
    successStartsAt.toISOString()
  );
  assert.equal(
    new Date(auditMetadata.new.expiresAt).toISOString(),
    successExpiresAt.toISOString()
  );
  assert.equal(auditMetadata.new.enabled, false);
  assert.equal(auditMetadata.new.minimumPlatformFeeBps, 1250);
  assert.equal(auditMetadata.new.maximumPlatformFeeBps, 2400);
  assert.equal(auditMetadata.new.platformFeeRoundingMode, "up");
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
    new Date(afterRollback.packageRow.startsAt!).toISOString(),
    successStartsAt.toISOString()
  );
  assert.equal(
    new Date(afterRollback.packageRow.expiresAt!).toISOString(),
    successExpiresAt.toISOString()
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

  const timingBaseline = await getTradeSettlementPolicy();
  timingRowsBefore = await db
    .select()
    .from(appSettings)
    .where(inArray(appSettings.settingKey, timingSettingKeys));
  if (timingBaseline.blockUntilSettled) {
    await assert.rejects(
      setTradeSettlementPolicy(
        timingSettings(timingBaseline, "pause off", {
          blockUntilSettled: false,
        }),
        adminId
      ),
      /at least 10 characters/
    );
  }
  const afterShortReason = await getTradeSettlementPolicy();
  assert.equal(
    afterShortReason.settingsVersion,
    timingBaseline.settingsVersion
  );
  assert.equal(
    afterShortReason.blockUntilSettled,
    timingBaseline.blockUntilSettled
  );

  const nextCooldown =
    timingBaseline.cooldownSeconds < 604800
      ? timingBaseline.cooldownSeconds + 1
      : timingBaseline.cooldownSeconds - 1;
  const timingCommitted = await setTradeSettlementPolicy(
    timingSettings(timingBaseline, timingSuccessReason, {
      cooldownSeconds: nextCooldown,
    }),
    adminId
  );
  assert.equal(
    timingCommitted.settingsVersion,
    timingBaseline.settingsVersion + 1
  );
  assert.equal(timingCommitted.cooldownSeconds, nextCooldown);
  assert.equal(
    timingCommitted.blockUntilSettled,
    timingBaseline.blockUntilSettled
  );
  const timingAudits = await db
    .select()
    .from(v5AuditEvents)
    .where(
      and(
        eq(v5AuditEvents.action, "trade_timing_policy_updated"),
        eq(v5AuditEvents.entityId, String(timingCommitted.settingsVersion)),
        eq(v5AuditEvents.reason, timingSuccessReason)
      )
    );
  assert.equal(
    timingAudits.length,
    1,
    "A timing save must write exactly one audit event."
  );
  assert.equal(timingAudits[0].actorUserId, adminId);
  const timingAuditMetadata = JSON.parse(String(timingAudits[0].metadataJson));
  assert.equal(timingAuditMetadata.oldVersion, timingBaseline.settingsVersion);
  assert.equal(timingAuditMetadata.newVersion, timingCommitted.settingsVersion);
  assert.equal(
    Number(timingAuditMetadata.new["trade.interTradeCooldownSeconds"]),
    nextCooldown
  );

  await assert.rejects(
    setTradeSettlementPolicy(
      timingSettings(timingBaseline, `Timing stale ${token}`, {
        cooldownSeconds: nextCooldown + 1,
      }),
      adminId
    ),
    /changed since this page was loaded/
  );
  const afterStaleWrite = await getTradeSettlementPolicy();
  assert.equal(
    afterStaleWrite.settingsVersion,
    timingCommitted.settingsVersion
  );
  assert.equal(afterStaleWrite.cooldownSeconds, nextCooldown);

  await pool.query(`CREATE TRIGGER \`${timingTriggerName}\` BEFORE INSERT ON v5_audit_events FOR EACH ROW
    BEGIN
      IF NEW.action='trade_timing_policy_updated' AND NEW.reason='${timingRollbackReason}' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='forced timing settings rollback';
      END IF;
    END`);
  timingTriggerCreated = true;
  await assert.rejects(
    setTradeSettlementPolicy(
      timingSettings(afterStaleWrite, timingRollbackReason, {
        cooldownSeconds:
          nextCooldown < 604800 ? nextCooldown + 1 : nextCooldown - 1,
      }),
      adminId
    ),
    error => matchesInjectedSqlSignal(error, "forced timing settings rollback")
  );
  const afterTimingRollback = await getTradeSettlementPolicy();
  assert.equal(
    afterTimingRollback.settingsVersion,
    timingCommitted.settingsVersion
  );
  assert.equal(afterTimingRollback.cooldownSeconds, nextCooldown);
  const rolledBackTimingAudits = await db
    .select()
    .from(v5AuditEvents)
    .where(
      and(
        eq(v5AuditEvents.action, "trade_timing_policy_updated"),
        eq(v5AuditEvents.reason, timingRollbackReason)
      )
    );
  assert.equal(
    rolledBackTimingAudits.length,
    0,
    "A failed timing audit insert must roll back the audit event."
  );
  await pool.query(`DROP TRIGGER \`${timingTriggerName}\``);
  timingTriggerCreated = false;
  console.log(
    "Package/Global Timing integration passed: invalid-input no-write, atomic settings commits, optimistic version conflicts, audited reason/version snapshots, and rollback after injected audit persistence failures."
  );
} finally {
  if (triggerCreated)
    await pool
      .query(`DROP TRIGGER IF EXISTS \`${triggerName}\``)
      .catch(() => {});
  if (timingTriggerCreated)
    await pool
      .query(`DROP TRIGGER IF EXISTS \`${timingTriggerName}\``)
      .catch(() => {});
  if (timingRowsBefore) {
    await db
      .delete(v5AuditEvents)
      .where(
        and(
          eq(v5AuditEvents.action, "trade_timing_policy_updated"),
          eq(v5AuditEvents.actorUserId, adminId),
          inArray(v5AuditEvents.reason, [
            timingSuccessReason,
            timingRollbackReason,
          ])
        )
      )
      .catch(() => {});
    await db
      .transaction(async tx => {
        await tx
          .delete(appSettings)
          .where(inArray(appSettings.settingKey, timingSettingKeys));
        if (timingRowsBefore?.length)
          await tx.insert(appSettings).values(timingRowsBefore);
      })
      .catch(() => {});
  }
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
