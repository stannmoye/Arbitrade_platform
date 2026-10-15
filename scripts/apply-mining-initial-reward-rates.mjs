import mysql from "mysql2/promise";

const migrationKey = "0044_mining_initial_cki_package_rewards";
const rates = new Map([
  ["CKI_GENESIS", "0.10"],
  ["CKI_VELOCITY", "0.30"],
  ["CKI_QUANTUM", "0.70"],
  ["CKI_TITAN", "1.60"],
  ["CKI_INFINITY", "4.00"],
]);

const rawDatabaseUrl = process.env.DATABASE_URL;
if (!rawDatabaseUrl) throw new Error("DATABASE_URL is required; load the private application environment first.");
const databaseUrl = new URL(rawDatabaseUrl);
const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ""));
if (databaseUrl.protocol !== "mysql:" || !["127.0.0.1", "localhost", "::1"].includes(databaseUrl.hostname.toLowerCase()) || databaseName !== "arbitrade_sandbox") {
  throw new Error("This initial-rate migration is restricted to the isolated local arbitrade_sandbox database. Apply an equivalent reviewed migration through the production release process.");
}
databaseUrl.searchParams.set("timezone", "Z");
const connection = await mysql.createConnection(databaseUrl.toString());

try {
  await connection.beginTransaction();
  const [markers] = await connection.query("SELECT migrationKey FROM mining_schema_migrations WHERE migrationKey=? FOR UPDATE", [migrationKey]);
  if (markers.length) {
    await connection.commit();
    console.log(JSON.stringify({ migration: migrationKey, status: "already_applied" }));
  } else {
    const [admins] = await connection.query("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1");
    const adminId = admins[0] ? Number(admins[0].id) : null;
    const effectiveAt = new Date();
    const changed = [];
    const unavailable = [];

    for (const [code, dailyReward] of rates) {
      const [rows] = await connection.query(
        `SELECT p.id packageId,p.code,p.name,p.displayOrder,p.status packageStatus,p.currentVersionId,
                v.version,v.displayName,v.versionStatus,v.priceAmount,v.priceAsset,v.baseThs,v.boostBonusThs,
                v.boostDurationSeconds,v.maxPerCustomer,v.stackingPolicy,v.expirySeconds,v.durationMonths,
                v.termsText,v.simulationAcknowledgementRequired
         FROM mining_packages p
         LEFT JOIN mining_package_versions v ON v.id=p.currentVersionId
         WHERE p.code=? FOR UPDATE`,
        [code],
      );
      const current = rows[0];
      if (!current || !current.currentVersionId || current.packageStatus !== "published" || current.versionStatus !== "published") {
        unavailable.push(code);
        continue;
      }

      const [maxRows] = await connection.query("SELECT COALESCE(MAX(version),0) maxVersion FROM mining_package_versions WHERE packageId=?", [current.packageId]);
      const nextVersion = Number(maxRows[0].maxVersion) + 1;
      const [inserted] = await connection.execute(
        `INSERT INTO mining_package_versions
          (packageId,version,displayName,versionStatus,priceAmount,priceAsset,baseThs,boostBonusThs,
           boostDurationSeconds,maxPerCustomer,stackingPolicy,expirySeconds,durationMonths,
           expectedDailyRewardCki,termsText,simulationAcknowledgementRequired,effectiveAt,createdBy)
         VALUES (?,?,?,'published',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [current.packageId,nextVersion,current.displayName || current.name,current.priceAmount,current.priceAsset,
          current.baseThs,current.boostBonusThs,current.boostDurationSeconds,current.maxPerCustomer,
          current.stackingPolicy,current.expirySeconds,current.durationMonths,dailyReward,current.termsText,
          current.simulationAcknowledgementRequired,effectiveAt,adminId],
      );
      const versionId = Number(inserted.insertId);
      await connection.execute(
        "UPDATE mining_packages SET currentVersionId=?,updatedAt=? WHERE id=?",
        [versionId,effectiveAt,current.packageId],
      );
      await connection.execute(
        `INSERT INTO v5_audit_events (actorUserId,action,entityType,entityId,reason,reference,metadataJson)
         VALUES (?,?,?,?,?,?,?)`,
        [adminId,"mining.package.initial_reward_rate.applied","mining_package_version",String(versionId),
          "Set the requested initial CKI daily reward for future purchases. Existing customer contract snapshots and balances are unchanged.",
          migrationKey,JSON.stringify({code,dailyRewardCkiPerDay:dailyReward,version:nextVersion,effectiveAt:effectiveAt.toISOString(),scope:"future_purchases_only"})],
      );
      changed.push({ code, dailyRewardCkiPerDay: dailyReward, version: nextVersion, versionId });
    }

    if (unavailable.length) {
      throw new Error(`Initial reward rates were not applied because these existing package codes are missing or not currently published: ${unavailable.join(", ")}. No changes were committed.`);
    }

    await connection.execute(
      "INSERT INTO mining_schema_migrations (migrationKey,detailsJson) VALUES (?,?)",
      [migrationKey,JSON.stringify({effectiveAt:effectiveAt.toISOString(),scope:"future_purchases_only",changed,unavailable})],
    );
    await connection.commit();
    console.log(JSON.stringify({ migration: migrationKey, status: "applied", effectiveAt: effectiveAt.toISOString(), scope: "future_purchases_only", changed, unavailable }));
  }
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  await connection.end();
}
