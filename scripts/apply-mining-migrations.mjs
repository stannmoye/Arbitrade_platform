import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const migrationKey = "0039_mining_database_driven_packages";
const rawDatabaseUrl = process.env.DATABASE_URL;
if (!rawDatabaseUrl) throw new Error("DATABASE_URL is required; load the private application environment first.");
const databaseUrl = new URL(rawDatabaseUrl);
const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ""));
if (!process.argv.includes("--confirm-host-migration")) throw new Error("Forward Mining migrations require --confirm-host-migration after verifying DATABASE_URL points to the existing application database.");
if (process.env.NODE_ENV === "production" && !process.argv.includes("--confirm-production")) throw new Error("Production Mining migrations also require --confirm-production.");
if (!["mysql:", "mariadb:"].includes(databaseUrl.protocol) || !databaseName) throw new Error("DATABASE_URL must identify the existing MySQL/MariaDB application database.");
if (databaseUrl.protocol === "mariadb:") databaseUrl.protocol = "mysql:";
databaseUrl.searchParams.set("multipleStatements", "true");
databaseUrl.searchParams.set("timezone", "Z");
const connection = await mysql.createConnection(databaseUrl.toString());

const packageSeeds = [
  { code: "CKI_GENESIS", name: "CKI Genesis", price: "100.00", ths: "1", order: 1 },
  { code: "CKI_VELOCITY", name: "CKI Velocity", price: "300.00", ths: "3", order: 2 },
  { code: "CKI_QUANTUM", name: "CKI Quantum", price: "600.00", ths: "7", order: 3 },
  { code: "CKI_TITAN", name: "CKI Titan", price: "1200.00", ths: "16", order: 4 },
  { code: "CKI_INFINITY", name: "CKI Infinity", price: "2500.00", ths: "40", order: 5 },
];
const terms = "This package provides a simulated package-based Mining entitlement only. Any estimated CoinKi (CKI) reward is based on the administrator-configured expected CKI amount per 24 hours for this package and is prorated by eligible contract time; it is not physical mining, verified pool output, or a guaranteed return. Simulated CKI is not withdrawable and there is no cash payout. No live mining hardware, external pool, investment return, custody, or market valuation is promised.";

try {
  const migrationSql = await readFile(resolve("drizzle", "0039_mining_database_driven_packages.sql"), "utf8");
  await connection.query(migrationSql);
  await connection.beginTransaction();
  try {
    const [markers] = await connection.query("SELECT migrationKey FROM mining_schema_migrations WHERE migrationKey=? FOR UPDATE", [migrationKey]);
    if (markers.length) {
      await connection.commit();
      console.log("Mining database-driven package migration already applied.");
      process.exitCode = 0;
    } else {
      const [currentRows] = await connection.query("SELECT * FROM mining_economics_versions WHERE effectiveAt<=UTC_TIMESTAMP(3) ORDER BY effectiveAt DESC,version DESC LIMIT 1 FOR UPDATE");
      const previous = currentRows[0];
      if (!previous) throw new Error("Mining economics must already be initialized before seeding the package catalog.");
      const [maxRows] = await connection.query("SELECT COALESCE(MAX(version),0) maxVersion FROM mining_economics_versions");
      const nextVersion = Number(maxRows[0].maxVersion) + 1;
      const [admins] = await connection.query("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1");
      const adminId = admins[0] ? Number(admins[0].id) : null;
      const effectiveAt = new Date();
      const reason = "Persist the requested 1 CKI = USD 1.27 internal reference and 24-month default. This is an administrator-configured valuation, not a market price; package reward estimates remain unset and Mining stays paused.";
      const tokenUnitsPerUsd = "0.787401574803149606";
      const [configInsert] = await connection.execute(
        `INSERT INTO mining_economics_versions
          (version,effectiveAt,globalEnabled,boostsEnabled,tokenName,tokenSymbol,defaultContractDurationMonths,tokenUnitsPerUsd,rewardTokensPerThsHour,
           swapFeeBps,purchaseFeeBps,minSwapTokens,maxSwapTokens,defaultAutoConversionThreshold,boostCycleSeconds,boostDurationSeconds,
           quoteTtlSeconds,fiatMaxAgeSeconds,cryptoMaxAgeSeconds,maxRateDeviationBps,dailyRewardCapTokens,dualApprovalThresholdUsd,updatedBy,reason)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [nextVersion,effectiveAt,0,Number(previous.boostsEnabled),String(previous.tokenName),String(previous.tokenSymbol),24,
          tokenUnitsPerUsd,String(previous.rewardTokensPerThsHour),Number(previous.swapFeeBps),Number(previous.purchaseFeeBps),String(previous.minSwapTokens),
          String(previous.maxSwapTokens),String(previous.defaultAutoConversionThreshold),Number(previous.boostCycleSeconds),Number(previous.boostDurationSeconds),
          Number(previous.quoteTtlSeconds),Number(previous.fiatMaxAgeSeconds),Number(previous.cryptoMaxAgeSeconds),Number(previous.maxRateDeviationBps),
          String(previous.dailyRewardCapTokens),String(previous.dualApprovalThresholdUsd),adminId,reason],
      );
      const economicsVersionId = Number(configInsert.insertId);
      await connection.execute(
        `INSERT INTO v5_audit_events (actorUserId,action,entityType,entityId,reason,reference,metadataJson)
         VALUES (?,?,?,?,?,?,?)`,
        [adminId,"mining.economics.version.created","mining_economics_version",String(economicsVersionId),reason,migrationKey,
          JSON.stringify({version:nextVersion,usdPerToken:"1.27",tokenUnitsPerUsd,defaultContractDurationMonths:24,globalEnabled:false,rewardTokensPerThsHour:String(previous.rewardTokensPerThsHour)})],
      );

      const seeded = [];
      for (const item of packageSeeds) {
        const [existing] = await connection.query("SELECT id FROM mining_packages WHERE code=? LIMIT 1 FOR UPDATE", [item.code]);
        if (existing[0]) {
          seeded.push({code:item.code,created:false,reason:"existing package preserved"});
          continue;
        }
        const [packageInsert] = await connection.execute(
          "INSERT INTO mining_packages (code,name,displayOrder,status,createdBy) VALUES (?,?,?,'draft',?)",
          [item.code,item.name,item.order,adminId],
        );
        const packageId = Number(packageInsert.insertId);
        const [versionInsert] = await connection.execute(
          `INSERT INTO mining_package_versions
            (packageId,version,displayName,versionStatus,priceAmount,priceAsset,baseThs,boostBonusThs,boostDurationSeconds,maxPerCustomer,stackingPolicy,
             expirySeconds,durationMonths,termsText,simulationAcknowledgementRequired,effectiveAt,createdBy)
           VALUES (?,1,?,'published',?,'USD',?,'0',NULL,0,'replace',NULL,24,?,1,?,?)`,
          [packageId,item.name,item.price,item.ths,terms,effectiveAt,adminId],
        );
        const versionId = Number(versionInsert.insertId);
        await connection.execute("UPDATE mining_packages SET status='published',currentVersionId=?,updatedAt=? WHERE id=?", [versionId,effectiveAt,packageId]);
        seeded.push({code:item.code,created:true,packageId,versionId});
      }
      await connection.execute("INSERT INTO mining_schema_migrations (migrationKey,detailsJson) VALUES (?,?)", [migrationKey,JSON.stringify({economicsVersion:nextVersion,usdPerToken:"1.27",defaultContractDurationMonths:24,packages:seeded,rewardRateUnchanged:String(previous.rewardTokensPerThsHour),globalEnabled:false})]);
      await connection.execute(
        `INSERT INTO v5_audit_events (actorUserId,action,entityType,entityId,reason,reference,metadataJson)
         VALUES (NULL,?,?,?,?,?,?)`,
        ["mining.catalog.seeded","mining_package_catalog","initial-five-packages","Seed requested package prices, hash rates and 24-month terms as editable database records; availability is published, while purchases and rewards remain gated by paused Mining economics.",migrationKey,JSON.stringify({packages:seeded})],
      );
      await connection.commit();
      console.log(JSON.stringify({migration:migrationKey,economicsVersion:nextVersion,usdPerToken:"1.27",defaultContractDurationMonths:24,globalEnabled:Boolean(previous.globalEnabled),rewardTokensPerThsHour:String(previous.rewardTokensPerThsHour),packages:seeded}));
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  }
  const rewardMigrationKey = "0040_mining_package_daily_rewards";
  const rewardSchema = await readFile(resolve("drizzle", "0040_mining_package_daily_rewards.sql"), "utf8");
  await connection.query(rewardSchema);
  await connection.beginTransaction();
  try {
    const [markers] = await connection.query("SELECT migrationKey FROM mining_schema_migrations WHERE migrationKey=? FOR UPDATE", [rewardMigrationKey]);
    if (markers.length) {
      await connection.commit();
      console.log("Mining package daily-reward migration already applied.");
    } else {
      const [currentRows] = await connection.query("SELECT * FROM mining_economics_versions WHERE effectiveAt<=UTC_TIMESTAMP(3) ORDER BY effectiveAt DESC,version DESC LIMIT 1 FOR UPDATE");
      const previous = currentRows[0];
      if (!previous) throw new Error("Mining economics must already be initialized before applying the package daily-reward model.");
      const [maxRows] = await connection.query("SELECT COALESCE(MAX(version),0) maxVersion FROM mining_economics_versions");
      const nextVersion = Number(maxRows[0].maxVersion) + 1;
      const [admins] = await connection.query("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1");
      const adminId = admins[0] ? Number(admins[0].id) : null;
      const effectiveAt = new Date();
      const reason = "Select the configured per-package 24-hour CKI estimate model. No external mining pool is used; estimates are prorated by eligible contract time. Daily rewards remain unset and processing stays paused until explicitly configured.";
      const [configInsert] = await connection.execute(
        `INSERT INTO mining_economics_versions
          (version,effectiveAt,globalEnabled,boostsEnabled,tokenName,tokenSymbol,defaultContractDurationMonths,calculationModel,difficultyBaselineThs,tokenUnitsPerUsd,rewardTokensPerThsHour,
           swapFeeBps,purchaseFeeBps,minSwapTokens,maxSwapTokens,defaultAutoConversionThreshold,boostCycleSeconds,boostDurationSeconds,
           quoteTtlSeconds,fiatMaxAgeSeconds,cryptoMaxAgeSeconds,maxRateDeviationBps,dailyRewardCapTokens,dualApprovalThresholdUsd,updatedBy,reason)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [nextVersion,effectiveAt,0,Number(previous.boostsEnabled),String(previous.tokenName),String(previous.tokenSymbol),Number(previous.defaultContractDurationMonths),"package_daily",String(previous.difficultyBaselineThs),String(previous.tokenUnitsPerUsd),"0",
          Number(previous.swapFeeBps),Number(previous.purchaseFeeBps),String(previous.minSwapTokens),String(previous.maxSwapTokens),String(previous.defaultAutoConversionThreshold),Number(previous.boostCycleSeconds),Number(previous.boostDurationSeconds),
          Number(previous.quoteTtlSeconds),Number(previous.fiatMaxAgeSeconds),Number(previous.cryptoMaxAgeSeconds),Number(previous.maxRateDeviationBps),String(previous.dailyRewardCapTokens),String(previous.dualApprovalThresholdUsd),adminId,reason],
      );
      await connection.execute(
        `INSERT INTO v5_audit_events (actorUserId,action,entityType,entityId,reason,reference,metadataJson)
         VALUES (?,?,?,?,?,?,?)`,
        [adminId,"mining.economics.version.created","mining_economics_version",String(configInsert.insertId),reason,rewardMigrationKey,
          JSON.stringify({version:nextVersion,calculationModel:"package_daily",globalEnabled:false,dailyPackageRewardsConfigured:false})],
      );

      const [packages] = await connection.query(
        `SELECT p.id packageId,p.code,p.name,p.currentVersionId,v.* FROM mining_packages p
         JOIN mining_package_versions v ON v.id=p.currentVersionId ORDER BY p.displayOrder,p.id FOR UPDATE`,
      );
      const packageTerms = "This package provides a simulated package-based Mining entitlement only. Its configured expected CoinKi (CKI) reward is an estimate prorated by eligible contract time; it is not physical mining, verified pool output, or a guaranteed return. Simulated CKI is not withdrawable and there is no cash payout. No live mining hardware, external pool, investment return, custody, or market valuation is promised.";
      const updatedPackages = [];
      for (const pkg of packages) {
        if (String(pkg.termsText||"").includes("expected CoinKi (CKI) reward is an estimate prorated by eligible contract time")) {
          updatedPackages.push({code:pkg.code,version:Number(pkg.version),termsVersionCreated:false});
          continue;
        }
        const [versionRows] = await connection.query("SELECT COALESCE(MAX(version),0) maxVersion FROM mining_package_versions WHERE packageId=?", [pkg.packageId]);
        const version = Number(versionRows[0]?.maxVersion||0) + 1;
        const [inserted] = await connection.execute(
          `INSERT INTO mining_package_versions
            (packageId,version,displayName,versionStatus,priceAmount,priceAsset,baseThs,boostBonusThs,boostDurationSeconds,maxPerCustomer,stackingPolicy,
             expirySeconds,durationMonths,expectedDailyRewardCki,termsText,simulationAcknowledgementRequired,effectiveAt,createdBy)
           VALUES (?,?,?,'published',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [Number(pkg.packageId),version,String(pkg.displayName||pkg.name),String(pkg.priceAmount),String(pkg.priceAsset),String(pkg.baseThs),String(pkg.boostBonusThs),pkg.boostDurationSeconds,
            Number(pkg.maxPerCustomer),String(pkg.stackingPolicy),pkg.expirySeconds,pkg.durationMonths,pkg.expectedDailyRewardCki,packageTerms,Number(pkg.simulationAcknowledgementRequired),effectiveAt,adminId],
        );
        const versionId = Number(inserted.insertId);
        await connection.execute("UPDATE mining_packages SET name=?,status='published',currentVersionId=?,updatedAt=? WHERE id=?", [String(pkg.displayName||pkg.name),versionId,effectiveAt,pkg.packageId]);
        updatedPackages.push({code:pkg.code,version,versionId,termsVersionCreated:true});
      }
      await connection.execute("INSERT INTO mining_schema_migrations (migrationKey,detailsJson) VALUES (?,?)", [rewardMigrationKey,JSON.stringify({economicsVersion:nextVersion,calculationModel:"package_daily",globalEnabled:false,expectedDailyRewardCkiConfigured:false,packages:updatedPackages})]);
      await connection.execute(
        `INSERT INTO v5_audit_events (actorUserId,action,entityType,entityId,reason,reference,metadataJson)
         VALUES (NULL,?,?,?,?,?,?)`,
        ["mining.reward.model.selected","mining_reward_model",rewardMigrationKey,reason,rewardMigrationKey,JSON.stringify({model:"package_daily",packages:updatedPackages})],
      );
      await connection.commit();
      console.log(JSON.stringify({migration:rewardMigrationKey,economicsVersion:nextVersion,calculationModel:"package_daily",globalEnabled:false,expectedDailyRewardCkiConfigured:false,packages:updatedPackages}));
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  }
  const purchaseBoostMigrationKey = "0041_mining_purchase_claims_and_boost_cooldown";
  const purchaseBoostSchema = await readFile(resolve("drizzle", "0041_mining_purchase_claims_and_boost_cooldown.sql"), "utf8");
  await connection.query(purchaseBoostSchema);
  const [walletIndexes] = await connection.query("SHOW INDEX FROM customer_balances WHERE Key_name='uq_customer_balance_user_currency'");
  if (!walletIndexes.length) {
    const [duplicates] = await connection.query("SELECT userId,currency FROM customer_balances GROUP BY userId,currency HAVING COUNT(*)>1 LIMIT 1");
    if (duplicates.length) throw new Error("Cannot create one-row-per-currency wallet protection: duplicate customer wallet rows require manual reconciliation first.");
    await connection.query("ALTER TABLE customer_balances ADD UNIQUE INDEX uq_customer_balance_user_currency (userId,currency)");
  }
  await connection.beginTransaction();
  try {
    const [markers] = await connection.query("SELECT migrationKey FROM mining_schema_migrations WHERE migrationKey=? FOR UPDATE", [purchaseBoostMigrationKey]);
    if (markers.length) {
      await connection.commit();
      console.log("Mining purchase-claim and boost-cooldown migration already applied.");
    } else {
      const [currentRows] = await connection.query("SELECT * FROM mining_economics_versions WHERE effectiveAt<=UTC_TIMESTAMP(3) ORDER BY effectiveAt DESC,version DESC LIMIT 1 FOR UPDATE");
      const previous = currentRows[0];
      if (!previous) throw new Error("Mining economics must be initialized before applying purchase and boost settings.");
      const [maxRows] = await connection.query("SELECT COALESCE(MAX(version),0) maxVersion FROM mining_economics_versions");
      const nextVersion = Number(maxRows[0].maxVersion) + 1;
      const [admins] = await connection.query("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1");
      const adminId = admins[0] ? Number(admins[0].id) : null;
      const effectiveAt = new Date();
      const reason = "Set the requested two-minute Mining boost duration and four-hour per-customer cooldown; enforce one lifetime purchase per package. Reward processing remains disabled pending actual third-party settlement configuration.";
      const [configInsert] = await connection.execute(
        `INSERT INTO mining_economics_versions
          (version,effectiveAt,globalEnabled,boostsEnabled,tokenName,tokenSymbol,defaultContractDurationMonths,calculationModel,difficultyBaselineThs,tokenUnitsPerUsd,rewardTokensPerThsHour,
           swapFeeBps,purchaseFeeBps,minSwapTokens,maxSwapTokens,defaultAutoConversionThreshold,boostCycleSeconds,boostDurationSeconds,
           quoteTtlSeconds,fiatMaxAgeSeconds,cryptoMaxAgeSeconds,maxRateDeviationBps,dailyRewardCapTokens,dualApprovalThresholdUsd,updatedBy,reason)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [nextVersion,effectiveAt,0,Number(previous.boostsEnabled),String(previous.tokenName),String(previous.tokenSymbol),Number(previous.defaultContractDurationMonths),String(previous.calculationModel),String(previous.difficultyBaselineThs),String(previous.tokenUnitsPerUsd),"0",
          Number(previous.swapFeeBps),Number(previous.purchaseFeeBps),String(previous.minSwapTokens),String(previous.maxSwapTokens),String(previous.defaultAutoConversionThreshold),14400,120,
          Number(previous.quoteTtlSeconds),Number(previous.fiatMaxAgeSeconds),Number(previous.cryptoMaxAgeSeconds),Number(previous.maxRateDeviationBps),String(previous.dailyRewardCapTokens),String(previous.dualApprovalThresholdUsd),adminId,reason],
      );
      await connection.execute(
        `INSERT INTO v5_audit_events (actorUserId,action,entityType,entityId,reason,reference,metadataJson)
         VALUES (?,?,?,?,?,?,?)`,
        [adminId,"mining.economics.version.created","mining_economics_version",String(configInsert.insertId),reason,purchaseBoostMigrationKey,
          JSON.stringify({version:nextVersion,boostDurationSeconds:120,boostCycleSeconds:14400,cooldownStartsAt:"previous_activation_start",globalEnabled:false})],
      );

      const [packages] = await connection.query(
        `SELECT p.id packageId,p.code,p.name,p.displayOrder,p.currentVersionId,v.* FROM mining_packages p
         JOIN mining_package_versions v ON v.id=p.currentVersionId
         WHERE p.status='published' AND v.versionStatus='published' ORDER BY p.displayOrder,p.id FOR UPDATE`,
      );
      const updatedPackages = [];
      for (const pkg of packages) {
        if (Number(pkg.maxPerCustomer) === 1 && Number(pkg.boostDurationSeconds) === 120) {
          updatedPackages.push({code:pkg.code,version:Number(pkg.version),versionCreated:false});
          continue;
        }
        const [versionRows] = await connection.query("SELECT COALESCE(MAX(version),0) maxVersion FROM mining_package_versions WHERE packageId=?", [pkg.packageId]);
        const version = Number(versionRows[0]?.maxVersion||0) + 1;
        const [inserted] = await connection.execute(
          `INSERT INTO mining_package_versions
            (packageId,version,displayName,versionStatus,priceAmount,priceAsset,baseThs,boostBonusThs,boostDurationSeconds,maxPerCustomer,stackingPolicy,
             expirySeconds,durationMonths,expectedDailyRewardCki,termsText,simulationAcknowledgementRequired,effectiveAt,createdBy)
           VALUES (?,?,?,'published',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [Number(pkg.packageId),version,String(pkg.displayName||pkg.name),String(pkg.priceAmount),String(pkg.priceAsset),String(pkg.baseThs),String(pkg.boostBonusThs),120,
            1,String(pkg.stackingPolicy),pkg.expirySeconds,pkg.durationMonths,pkg.expectedDailyRewardCki,String(pkg.termsText),Number(pkg.simulationAcknowledgementRequired),effectiveAt,adminId],
        );
        const versionId = Number(inserted.insertId);
        await connection.execute("UPDATE mining_packages SET currentVersionId=?,updatedAt=? WHERE id=?", [versionId,effectiveAt,pkg.packageId]);
        updatedPackages.push({code:pkg.code,version,versionId,versionCreated:true,maxPerCustomer:1,boostDurationSeconds:120});
      }
      await connection.execute("INSERT INTO mining_schema_migrations (migrationKey,detailsJson) VALUES (?,?)", [purchaseBoostMigrationKey,JSON.stringify({economicsVersion:nextVersion,boostDurationSeconds:120,boostCycleSeconds:14400,globalEnabled:false,packages:updatedPackages})]);
      await connection.execute(
        `INSERT INTO v5_audit_events (actorUserId,action,entityType,entityId,reason,reference,metadataJson)
         VALUES (NULL,?,?,?,?,?,?)`,
        ["mining.purchase.policy.created","mining_package_purchase_policy",purchaseBoostMigrationKey,reason,purchaseBoostMigrationKey,JSON.stringify({oneLifetimePurchasePerCustomerPackage:true,packages:updatedPackages})],
      );
      await connection.commit();
      console.log(JSON.stringify({migration:purchaseBoostMigrationKey,economicsVersion:nextVersion,boostDurationSeconds:120,boostCycleSeconds:14400,globalEnabled:false,packages:updatedPackages}));
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  }
  const purchaseGateMigrationKey = "0042_mining_independent_package_purchases";
  const purchaseGateSchema = await readFile(resolve("drizzle", "0042_mining_independent_package_purchases.sql"), "utf8");
  await connection.query(purchaseGateSchema);
  await connection.beginTransaction();
  try {
    const [markers] = await connection.query("SELECT migrationKey FROM mining_schema_migrations WHERE migrationKey=? FOR UPDATE", [purchaseGateMigrationKey]);
    if (markers.length) {
      await connection.commit();
      console.log("Independent package-purchase gate migration already applied.");
    } else {
      const [currentRows] = await connection.query("SELECT * FROM mining_economics_versions WHERE effectiveAt<=UTC_TIMESTAMP(3) ORDER BY effectiveAt DESC,version DESC LIMIT 1 FOR UPDATE");
      const previous = currentRows[0];
      if (!previous) throw new Error("Mining economics must be initialized before enabling package purchases.");
      const [maxRows] = await connection.query("SELECT COALESCE(MAX(version),0) maxVersion FROM mining_economics_versions");
      const nextVersion = Number(maxRows[0].maxVersion) + 1;
      const [admins] = await connection.query("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1");
      const adminId = admins[0] ? Number(admins[0].id) : null;
      const effectiveAt = new Date();
      const reason = "Enable package checkout independently from reward posting. Package purchases debit the selected main wallet; CKI credits remain disabled pending verified farm settlements.";
      const [configInsert] = await connection.execute(
        `INSERT INTO mining_economics_versions
          (version,effectiveAt,globalEnabled,packagePurchasesEnabled,boostsEnabled,tokenName,tokenSymbol,defaultContractDurationMonths,calculationModel,difficultyBaselineThs,tokenUnitsPerUsd,rewardTokensPerThsHour,
           swapFeeBps,purchaseFeeBps,minSwapTokens,maxSwapTokens,defaultAutoConversionThreshold,boostCycleSeconds,boostDurationSeconds,
           quoteTtlSeconds,fiatMaxAgeSeconds,cryptoMaxAgeSeconds,maxRateDeviationBps,dailyRewardCapTokens,dualApprovalThresholdUsd,updatedBy,reason)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [nextVersion,effectiveAt,0,1,Number(previous.boostsEnabled),String(previous.tokenName),String(previous.tokenSymbol),Number(previous.defaultContractDurationMonths),String(previous.calculationModel),String(previous.difficultyBaselineThs),String(previous.tokenUnitsPerUsd),String(previous.rewardTokensPerThsHour),
          Number(previous.swapFeeBps),Number(previous.purchaseFeeBps),String(previous.minSwapTokens),String(previous.maxSwapTokens),String(previous.defaultAutoConversionThreshold),Number(previous.boostCycleSeconds),Number(previous.boostDurationSeconds),
          Number(previous.quoteTtlSeconds),Number(previous.fiatMaxAgeSeconds),Number(previous.cryptoMaxAgeSeconds),Number(previous.maxRateDeviationBps),String(previous.dailyRewardCapTokens),String(previous.dualApprovalThresholdUsd),adminId,reason],
      );
      await connection.execute(
        `INSERT INTO v5_audit_events (actorUserId,action,entityType,entityId,reason,reference,metadataJson)
         VALUES (?,?,?,?,?,?,?)`,
        [adminId,"mining.economics.version.created","mining_economics_version",String(configInsert.insertId),reason,purchaseGateMigrationKey,
          JSON.stringify({version:nextVersion,packagePurchasesEnabled:true,globalEnabled:false,mainWalletDebit:true,verifiedFarmSettlementConnected:false})],
      );
      await connection.execute("INSERT INTO mining_schema_migrations (migrationKey,detailsJson) VALUES (?,?)", [purchaseGateMigrationKey,JSON.stringify({economicsVersion:nextVersion,packagePurchasesEnabled:true,globalEnabled:false})]);
      await connection.commit();
      console.log(JSON.stringify({migration:purchaseGateMigrationKey,economicsVersion:nextVersion,packagePurchasesEnabled:true,globalEnabled:false}));
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  }
  const engineActivityMigrationKey = "0043_mining_engine_activity";
  const engineActivitySchema = await readFile(resolve("drizzle", "0043_mining_engine_activity.sql"), "utf8");
  await connection.query(engineActivitySchema);
  await connection.beginTransaction();
  try {
    const [markers] = await connection.query("SELECT migrationKey FROM mining_schema_migrations WHERE migrationKey=? FOR UPDATE", [engineActivityMigrationKey]);
    if (markers.length) {
      await connection.commit();
      console.log("Mining engine activity migration already applied.");
    } else {
      const [admins] = await connection.query("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1");
      const adminId = admins[0] ? Number(admins[0].id) : null;
      const reason = "Persist per-package eligible hash-time intervals independently from reward credits; pending third-party settlement.";
      await connection.execute("INSERT INTO mining_schema_migrations (migrationKey,detailsJson) VALUES (?,?)", [engineActivityMigrationKey, JSON.stringify({perPackageIntervalActivity:true,financialCreditsPosted:false,settlementStatus:"awaiting_settlement"})]);
      await connection.execute(
        `INSERT INTO v5_audit_events (actorUserId,action,entityType,entityId,reason,reference,metadataJson)
         VALUES (?,?,?,?,?,?,?)`,
        [adminId,"mining.engine.activity.schema.applied","mining_engine_activity",engineActivityMigrationKey,reason,engineActivityMigrationKey,JSON.stringify({perPackageIntervalActivity:true,financialCreditsPosted:false})],
      );
      await connection.commit();
      console.log(JSON.stringify({migration:engineActivityMigrationKey,perPackageIntervalActivity:true,financialCreditsPosted:false}));
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  }
  const rewardMethodsMigrationKey = "0045_mining_reward_calculation_methods";
  const rewardMethodsSchema = await readFile(resolve("drizzle", "0045_mining_reward_calculation_methods.sql"), "utf8");
  await connection.query(rewardMethodsSchema);
  await connection.beginTransaction();
  try {
    const [markers] = await connection.query("SELECT migrationKey FROM mining_schema_migrations WHERE migrationKey=? FOR UPDATE", [rewardMethodsMigrationKey]);
    if (markers.length) {
      await connection.commit();
      console.log("Mining reward calculation method migration already applied.");
    } else {
      const [admins] = await connection.query("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1");
      const adminId = admins[0] ? Number(admins[0].id) : null;
      const reason = "Add fixed-package and TH/s-based daily CKI methods with future-contract snapshots; preserve existing customer terms and balances.";
      const metadata = {methods:["package_daily","hashrate_daily"],contractRateSnapshots:true,existingContractsRewritten:false,balancesOrLedgersChanged:false};
      await connection.execute("INSERT INTO mining_schema_migrations (migrationKey,detailsJson) VALUES (?,?)", [rewardMethodsMigrationKey, JSON.stringify(metadata)]);
      await connection.execute(
        `INSERT INTO v5_audit_events (actorUserId,action,entityType,entityId,reason,reference,metadataJson)
         VALUES (?,?,?,?,?,?,?)`,
        [adminId,"mining.reward.methods.schema.applied","mining_reward_calculation_methods",rewardMethodsMigrationKey,reason,rewardMethodsMigrationKey,JSON.stringify(metadata)],
      );
      await connection.commit();
      console.log(JSON.stringify({migration:rewardMethodsMigrationKey,...metadata}));
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  }
} finally {
  await connection.end();
}
