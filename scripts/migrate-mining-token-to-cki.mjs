import crypto from "node:crypto";
import Decimal from "decimal.js";

const MIGRATION_KEY = "0037_coinki_token_configuration";
const SCALE = 8;
const ZERO = "0.00000000";
const unit = value => new Decimal(String(value ?? "0"));
const formatted = value => unit(value).toFixed(SCALE, Decimal.ROUND_DOWN);

async function getWallet(conn, userId, assetCode, create = false) {
  const [rows] = await conn.query(
    "SELECT id,userId,assetCode,availableAmount,lockedAmount,pendingAmount FROM v5_wallets WHERE userId=? AND assetCode=? ORDER BY id FOR UPDATE",
    [userId, assetCode],
  );
  if (rows.length > 1) throw new Error(`Duplicate ${assetCode} wallets found for user ${userId}; migration stopped without changing balances`);
  if (rows[0] || !create) return rows[0] || null;
  const [result] = await conn.execute(
    "INSERT INTO v5_wallets (userId,assetCode,availableAmount,lockedAmount,pendingAmount) VALUES (?,?,?,'0','0')",
    [userId, assetCode, ZERO],
  );
  const [created] = await conn.query("SELECT id,userId,assetCode,availableAmount,lockedAmount,pendingAmount FROM v5_wallets WHERE id=? FOR UPDATE", [result.insertId]);
  if (!created[0]) throw new Error(`Could not create ${assetCode} wallet for user ${userId}`);
  return created[0];
}

async function insertLedgerEntry(conn, { wallet, asset, amount, entryType, transactionId, referenceCode, index }) {
  const delta = unit(amount);
  await conn.execute(
    `INSERT INTO v5_wallet_ledger
      (walletId,entryType,amount,assetCode,referenceType,referenceId,idempotencyKey,reversalOfId,precisionSnapshotJson)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      Number(wallet.id), entryType, delta.toFixed(SCALE, Decimal.ROUND_DOWN), asset,
      "mining_transaction", String(transactionId), `mining-ledger:${transactionId}:${index}`, null,
      JSON.stringify({ asset, scale: SCALE, roundingMode: "down", transactionReference: referenceCode, migration: MIGRATION_KEY }),
    ],
  );
}

async function postBalanceReclassification(conn, userId, oldCustomer, oldClearing, newCustomer, newClearing, amount) {
  const value = unit(amount);
  if (!value.gt(0)) return false;
  const referenceCode = `MIN-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
  const idempotencyKey = `mining-asset-migration:TOKEN-to-CKI:${userId}`;
  const metadata = {
    migration: MIGRATION_KEY,
    oldAsset: "TOKEN",
    newAsset: "CKI",
    tokenName: "CoinKi",
    tokenSymbol: "CKI",
    amountReclassified: value.toFixed(SCALE, Decimal.ROUND_DOWN),
    unitRatio: "1:1",
    historicalLedgerPreserved: true,
    simulationOnly: true,
  };
  const [tx] = await conn.execute(
    `INSERT INTO mining_ledger_transactions
      (userId,actorUserId,transactionType,status,idempotencyKey,referenceCode,reason,metadataJson)
     VALUES (?,NULL,'asset_reclassification','posted',?,?,?,?)`,
    [userId, idempotencyKey, referenceCode, "One-time 1:1 reclassification of the available sandbox Mining balance into CKI; existing journal history is preserved.", JSON.stringify(metadata)],
  );
  const transactionId = Number(tx.insertId);
  for (const wallet of [oldCustomer, oldClearing, newCustomer, newClearing]) {
    await conn.execute("INSERT IGNORE INTO mining_wallet_baselines (walletId,assetCode,openingAmount) VALUES (?,?,?)", [Number(wallet.id), String(wallet.assetCode), String(wallet.availableAmount)]);
  }
  const moves = [
    { wallet: oldCustomer, asset: "TOKEN", amount: value.negated(), entryType: "mining_cki_migration_out" },
    { wallet: oldClearing, asset: "TOKEN", amount: value, entryType: "mining_cki_migration_clear" },
    { wallet: newCustomer, asset: "CKI", amount: value, entryType: "mining_cki_migration_in" },
    { wallet: newClearing, asset: "CKI", amount: value.negated(), entryType: "mining_cki_migration_clear" },
  ];
  for (let index = 0; index < moves.length; index++) {
    const move = moves[index];
    await insertLedgerEntry(conn, { ...move, transactionId, referenceCode, index });
    const next = unit(move.wallet.availableAmount).plus(move.amount);
    if (Number(move.wallet.userId) > 0 && next.isNegative()) throw new Error(`Reclassification would make user ${move.wallet.userId} ${move.asset} balance negative`);
    await conn.execute("UPDATE v5_wallets SET availableAmount=?,updatedAt=UTC_TIMESTAMP(3) WHERE id=?", [formatted(next), Number(move.wallet.id)]);
    move.wallet.availableAmount = formatted(next);
  }
  return true;
}

export async function migrateMiningTokenToCki(conn) {
  await conn.beginTransaction();
  try {
    const [markers] = await conn.query("SELECT migrationKey FROM mining_schema_migrations WHERE migrationKey=? FOR UPDATE", [MIGRATION_KEY]);
    if (markers.length) {
      await conn.commit();
      console.log("CoinKi/CKI database migration already applied");
      return;
    }

    const [configs] = await conn.query("SELECT * FROM mining_economics_versions WHERE effectiveAt<=UTC_TIMESTAMP(3) ORDER BY version DESC LIMIT 1 FOR UPDATE");
    const previous = configs[0];
    if (!previous) throw new Error("Mining economics must be initialized before applying the CoinKi migration");
    if (String(previous.tokenSymbol).toUpperCase() === "CKI") {
      // Fresh installs already start with CKI configured by the schema migrations.
      // Treat that as a safe no-op only when no legacy TOKEN wallet has any value;
      // otherwise stop for manual reconciliation rather than risk losing balances.
      const [legacyWallets] = await conn.query(
        "SELECT id FROM v5_wallets WHERE assetCode='TOKEN' AND (CAST(availableAmount AS DECIMAL(36,8)) <> 0 OR CAST(lockedAmount AS DECIMAL(36,8)) <> 0 OR CAST(pendingAmount AS DECIMAL(36,8)) <> 0) LIMIT 1 FOR UPDATE",
      );
      if (legacyWallets.length) {
        throw new Error("The active Mining token is already CKI but non-zero legacy TOKEN wallet balances remain; manual reconciliation is required");
      }
      await conn.execute("INSERT INTO mining_schema_migrations (migrationKey,detailsJson) VALUES (?,?)", [
        MIGRATION_KEY,
        JSON.stringify({ tokenName: "CoinKi", tokenSymbol: "CKI", status: "already_configured", legacyTokenBalances: "zero_or_absent", reclassificationPerformed: false }),
      ]);
      await conn.commit();
      console.log("Skipped legacy TOKEN reclassification: CKI is already active and no non-zero TOKEN wallet balances exist.");
      return;
    }
    const tokenUnitsPerUsd = unit(previous.tokenUnitsPerUsd);
    if (!tokenUnitsPerUsd.gt(0)) throw new Error("The configured database CKI/USD valuation is invalid; migration stopped without changing data");
    const usdPerToken = new Decimal(1).div(tokenUnitsPerUsd).toSignificantDigits(18).toString();
    const [admins] = await conn.query("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1");
    const adminId = admins[0] ? Number(admins[0].id) : null;
    const effectiveAt = new Date();
    const nextVersion = Number(previous.version) + 1;
    const reason = `Apply CoinKi token identity while preserving the database-configured internal reference of $${usdPerToken} USD per CKI. The rate is not a market price or redemption promise.`;
    const [insertedConfig] = await conn.execute(
      `INSERT INTO mining_economics_versions
        (version,effectiveAt,globalEnabled,boostsEnabled,tokenName,tokenSymbol,tokenUnitsPerUsd,rewardTokensPerThsHour,
         swapFeeBps,purchaseFeeBps,minSwapTokens,maxSwapTokens,defaultAutoConversionThreshold,boostCycleSeconds,
         boostDurationSeconds,quoteTtlSeconds,fiatMaxAgeSeconds,cryptoMaxAgeSeconds,maxRateDeviationBps,
         dailyRewardCapTokens,dualApprovalThresholdUsd,updatedBy,reason)
       VALUES (?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        nextVersion, effectiveAt, Number(previous.globalEnabled), Number(previous.boostsEnabled), "CoinKi", "CKI", tokenUnitsPerUsd.toFixed(18, Decimal.ROUND_DOWN),
        String(previous.rewardTokensPerThsHour), Number(previous.swapFeeBps), Number(previous.purchaseFeeBps), String(previous.minSwapTokens),
        String(previous.maxSwapTokens), String(previous.defaultAutoConversionThreshold), Number(previous.boostCycleSeconds),
        Number(previous.boostDurationSeconds), Number(previous.quoteTtlSeconds), Number(previous.fiatMaxAgeSeconds),
        Number(previous.cryptoMaxAgeSeconds), Number(previous.maxRateDeviationBps), String(previous.dailyRewardCapTokens),
        String(previous.dualApprovalThresholdUsd), adminId, reason,
      ],
    );
    const versionId = Number(insertedConfig.insertId);
    await conn.execute(
      `INSERT INTO v5_audit_events (actorUserId,action,entityType,entityId,reason,reference,metadataJson)
       VALUES (?,?,?,?,?,?,?)`,
      [adminId, "mining.token_configuration.updated", "mining_economics_version", String(versionId), reason, MIGRATION_KEY,
        JSON.stringify({ previousVersion: Number(previous.version), version: nextVersion, tokenName: "CoinKi", tokenSymbol: "CKI", usdPerToken, tokenUnitsPerUsd: tokenUnitsPerUsd.toFixed(18, Decimal.ROUND_DOWN), effectiveAt: effectiveAt.toISOString() })],
    );

    const [legacyWallets] = await conn.query(
      "SELECT id,userId,assetCode,availableAmount,lockedAmount,pendingAmount FROM v5_wallets WHERE assetCode='TOKEN' AND userId>0 ORDER BY userId FOR UPDATE",
    );
    let moved = 0;
    let total = new Decimal(0);
    for (const oldCustomer of legacyWallets) {
      if (!unit(oldCustomer.lockedAmount).isZero() || !unit(oldCustomer.pendingAmount).isZero()) {
        throw new Error(`Legacy Mining wallet ${oldCustomer.id} has locked or pending value; migration stopped without changing balances`);
      }
      const amount = unit(oldCustomer.availableAmount);
      if (amount.isNegative()) throw new Error(`Legacy Mining wallet ${oldCustomer.id} has a negative available balance; migration stopped`);
      if (amount.isZero()) continue;
      const oldClearing = await getWallet(conn, 0, "TOKEN", true);
      const newCustomer = await getWallet(conn, Number(oldCustomer.userId), "CKI", true);
      const newClearing = await getWallet(conn, 0, "CKI", true);
      await postBalanceReclassification(conn, Number(oldCustomer.userId), oldCustomer, oldClearing, newCustomer, newClearing, amount);
      moved++;
      total = total.plus(amount);
    }

    const oldClearing = await getWallet(conn, 0, "TOKEN", false);
    if (oldClearing && !unit(oldClearing.availableAmount).isZero()) {
      throw new Error("The legacy TOKEN clearing wallet is not zero after migration; manual reconciliation is required");
    }
    await conn.execute("INSERT INTO mining_schema_migrations (migrationKey,detailsJson) VALUES (?,?)", [
      MIGRATION_KEY,
      JSON.stringify({ version: nextVersion, tokenName: "CoinKi", tokenSymbol: "CKI", tokenUnitsPerUsd: tokenUnitsPerUsd.toFixed(18, Decimal.ROUND_DOWN), usdPerToken, reclassifiedUserWallets: moved, reclassifiedAmount: total.toFixed(SCALE, Decimal.ROUND_DOWN), historicalLedgerPreserved: true }),
    ]);
    await conn.execute(
      `INSERT INTO v5_audit_events (actorUserId,action,entityType,entityId,reason,reference,metadataJson)
       VALUES (NULL,?,?,?,?,?,?)`,
      ["mining.token_asset.reclassified", "mining_asset_migration", "TOKEN-to-CKI", "One-time 1:1 move of available sandbox Mining balances; historical journal entries were retained unchanged.", MIGRATION_KEY,
        JSON.stringify({ reclassifiedUserWallets: moved, reclassifiedAmount: total.toFixed(SCALE, Decimal.ROUND_DOWN), historicalLedgerPreserved: true })],
    );
    await conn.commit();
    console.log(`Applied CoinKi/CKI migration: economics v${nextVersion}; ${moved} legacy wallet balance(s) reclassified; amount ${total.toFixed(SCALE, Decimal.ROUND_DOWN)} CKI`);
  } catch (error) {
    await conn.rollback();
    throw error;
  }
}
