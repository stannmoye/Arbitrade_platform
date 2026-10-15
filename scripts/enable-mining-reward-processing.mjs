import mysql from "mysql2/promise";

const migrationKey = "0046_mining_reward_processing_enabled";
const rawDatabaseUrl = process.env.DATABASE_URL;
if (!rawDatabaseUrl) throw new Error("DATABASE_URL is required; load the private application environment first.");
const databaseUrl = new URL(rawDatabaseUrl);
if (!["mysql:", "mariadb:"].includes(databaseUrl.protocol)) throw new Error("DATABASE_URL must use mysql:// or mariadb://");
if (databaseUrl.protocol === "mariadb:") databaseUrl.protocol = "mysql:";
if (!process.argv.includes("--confirm-host-migration")) {
  throw new Error("Verify DATABASE_URL points to the existing application database, then rerun with --confirm-host-migration.");
}
if (process.env.NODE_ENV === "production" && !process.argv.includes("--confirm-production")) {
  throw new Error("Production mode detected. Rerun with --confirm-production as well as --confirm-host-migration.");
}
databaseUrl.searchParams.set("timezone", "Z");
const connection = await mysql.createConnection(databaseUrl.toString());

try {
  await connection.beginTransaction();
  try {
    const [markers] = await connection.query(
      "SELECT migrationKey FROM mining_schema_migrations WHERE migrationKey=? FOR UPDATE",
      [migrationKey],
    );
    if (markers.length) {
      await connection.commit();
      console.log(JSON.stringify({ migration: migrationKey, status: "already_applied" }));
    } else {
      const [currentRows] = await connection.query(
        "SELECT * FROM mining_economics_versions WHERE effectiveAt<=UTC_TIMESTAMP(3) ORDER BY effectiveAt DESC,version DESC LIMIT 1 FOR UPDATE",
      );
      const previous = currentRows[0];
      if (!previous) throw new Error("Mining economics must be initialized before enabling reward processing.");
      const [admins] = await connection.query("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1");
      const adminId = admins[0] ? Number(admins[0].id) : null;
      const effectiveAt = new Date();
      const wasAlreadyEnabled = Boolean(previous.globalEnabled);
      let version = Number(previous.version);
      let versionId = Number(previous.id);
      const scope = "all_eligible_active_contracts_using_frozen_rates";
      const reason = "Enable automatic CKI reward processing as explicitly authorized. Accrual begins at this effective time for eligible active contracts using their saved terms; no retroactive credits are created.";

      if (!wasAlreadyEnabled) {
        const [maxRows] = await connection.query("SELECT COALESCE(MAX(version),0) maxVersion FROM mining_economics_versions");
        version = Number(maxRows[0]?.maxVersion || 0) + 1;
        const [inserted] = await connection.execute(
          `INSERT INTO mining_economics_versions
            (version,effectiveAt,globalEnabled,packagePurchasesEnabled,boostsEnabled,tokenName,tokenSymbol,
             defaultContractDurationMonths,calculationModel,difficultyBaselineThs,ckiPerThsPerDay,tokenUnitsPerUsd,
             rewardTokensPerThsHour,swapFeeBps,purchaseFeeBps,minSwapTokens,maxSwapTokens,defaultAutoConversionThreshold,
             boostCycleSeconds,boostDurationSeconds,quoteTtlSeconds,fiatMaxAgeSeconds,cryptoMaxAgeSeconds,
             maxRateDeviationBps,dailyRewardCapTokens,dualApprovalThresholdUsd,updatedBy,reason)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            version,effectiveAt,1,Number(previous.packagePurchasesEnabled),Number(previous.boostsEnabled),
            String(previous.tokenName),String(previous.tokenSymbol),Number(previous.defaultContractDurationMonths),
            String(previous.calculationModel),String(previous.difficultyBaselineThs),String(previous.ckiPerThsPerDay ?? "0"),
            String(previous.tokenUnitsPerUsd),String(previous.rewardTokensPerThsHour),Number(previous.swapFeeBps),
            Number(previous.purchaseFeeBps),String(previous.minSwapTokens),String(previous.maxSwapTokens),
            String(previous.defaultAutoConversionThreshold),Number(previous.boostCycleSeconds),Number(previous.boostDurationSeconds),
            Number(previous.quoteTtlSeconds),Number(previous.fiatMaxAgeSeconds),Number(previous.cryptoMaxAgeSeconds),
            Number(previous.maxRateDeviationBps),String(previous.dailyRewardCapTokens),String(previous.dualApprovalThresholdUsd),
            adminId,reason,
          ],
        );
        versionId = Number(inserted.insertId);
      }

      const metadata = {
        version,
        versionId,
        globalEnabled: true,
        alreadyEnabled: wasAlreadyEnabled,
        effectiveAt: effectiveAt.toISOString(),
        scope,
        retroactiveCredits: false,
        adminMayChangeSettingLater: true,
      };
      await connection.execute(
        "INSERT INTO mining_schema_migrations (migrationKey,detailsJson) VALUES (?,?)",
        [migrationKey, JSON.stringify(metadata)],
      );
      await connection.execute(
        `INSERT INTO v5_audit_events (actorUserId,action,entityType,entityId,reason,reference,metadataJson)
         VALUES (?,?,?,?,?,?,?)`,
        [
          adminId,
          wasAlreadyEnabled ? "mining.reward.processing.enable_migration.already_enabled" : "mining.reward.processing.enabled",
          "mining_economics_version",
          String(versionId),
          wasAlreadyEnabled ? "Reward processing was already enabled; migration recorded without creating a duplicate settings version." : reason,
          migrationKey,
          JSON.stringify(metadata),
        ],
      );
      await connection.commit();
      console.log(JSON.stringify({ migration: migrationKey, status: wasAlreadyEnabled ? "already_enabled" : "enabled", ...metadata }));
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  }
} finally {
  await connection.end();
}
