import { config } from "dotenv";
import mysql from "mysql2/promise";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env"), override: false });

function parseArgs(argv) {
  let limit = 100;
  let output = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") return { help: true, limit, output };
    if (arg === "--limit" || arg.startsWith("--limit=")) {
      const raw = arg === "--limit" ? argv[++index] : arg.slice("--limit=".length);
      if (!raw || !/^\d+$/.test(raw)) throw new Error("--limit must be a positive integer.");
      limit = Number(raw);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
        throw new Error("--limit must be between 1 and 1000.");
      }
      continue;
    }
    if (arg === "--output" || arg.startsWith("--output=")) {
      output = arg === "--output" ? argv[++index] : arg.slice("--output=".length);
      if (!output) throw new Error("--output requires a file path.");
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { help: false, limit, output };
}

function safeInteger(value, label) {
  if (value === null || value === undefined ||
      (typeof value !== "number" && typeof value !== "string") ||
      (typeof value === "string" && value.trim() === "")) {
    throw new Error(`Missing or non-numeric integer in ${label}; refusing to coerce absent financial evidence to zero.`);
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Unsafe or invalid integer in ${label}; refusing to produce potentially lossy financial evidence.`);
  }
  return parsed;
}

function placeholders(count) {
  return Array.from({ length: count }, () => "?").join(", ");
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }
  if (args.help) {
    console.log("Usage: pnpm db:collect-trade-recovery-evidence [--limit 100] [--output ./trade-recovery-evidence.json]");
    console.log("Connects to DATABASE_URL and gathers read-only trade, wallet, ledger, reservation, and lifecycle evidence.");
    console.log("The output is a JSON array accepted by db:plan-trade-recovery. No customer data is changed.");
    return;
  }

  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error("Trade recovery evidence collection requires DATABASE_URL in the private .env file.");
    process.exitCode = 2;
    return;
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    console.error("DATABASE_URL is not a valid URL. No database connection was attempted.");
    process.exitCode = 2;
    return;
  }
  if (!["mysql:", "mariadb:"].includes(url.protocol) || !url.pathname.replace(/^\/+/, "")) {
    console.error("DATABASE_URL must identify a MySQL/MariaDB database. No changes were made.");
    process.exitCode = 2;
    return;
  }
  if (url.protocol === "mariadb:") url.protocol = "mysql:";
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  let ssl;
  const sslParam = url.searchParams.get("ssl");
  if (sslParam) {
    try {
      const parsed = JSON.parse(sslParam);
      ssl = parsed === true ? {} : parsed && typeof parsed === "object" ? parsed : undefined;
    } catch {
      if (sslParam === "true") ssl = {};
    }
  }

  const db = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: databaseName,
    ssl,
    connectTimeout: 10000,
    multipleStatements: false,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  let transactionOpen = false;
  try {
    await db.query("START TRANSACTION READ ONLY");
    transactionOpen = true;

    const [tableRows] = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()",
    );
    const tables = new Set(tableRows.map((row) => String(row.TABLE_NAME ?? row.table_name)));
    const [columnRows] = await db.query(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE()",
    );
    const columns = new Set(columnRows.map((row) =>
      String(row.TABLE_NAME ?? row.table_name) + "." + String(row.COLUMN_NAME ?? row.column_name),
    ));
    const has = (...names) => names.every((name) => columns.has(name));
    const requiredTables = [
      "trade_positions",
      "customer_balances",
      "balance_ledger",
      "trade_reward_reservations",
      "trade_lifecycle_events",
    ];
    const missingTables = requiredTables.filter((name) => !tables.has(name));
    const requiredColumns = [
      "trade_positions.id", "trade_positions.userId", "trade_positions.currency",
      "trade_positions.status", "trade_positions.settlementStatus", "trade_positions.principalMinor",
      "trade_positions.rewardCreditedMinor", "trade_positions.settlementReference", "trade_positions.walletUpdatedAt",
      "trade_positions.realizedGrossProfitMinor", "trade_positions.platformFeeMinor", "trade_positions.netProfitMinor",
      "trade_positions.settlementOutcome", "trade_positions.feePolicyVersion", "trade_positions.platformFeeRateBps",
      "trade_positions.platformFeeRoundingMode",
      "customer_balances.id", "customer_balances.userId", "customer_balances.currency", "customer_balances.availableMinor",
      "customer_balances.lockedMinor", "customer_balances.promotionalMinor", "customer_balances.earnedMinor", "customer_balances.updatedAt",
      "balance_ledger.id", "balance_ledger.userId", "balance_ledger.currency", "balance_ledger.amountMinor",
      "balance_ledger.entryType", "balance_ledger.reference", "balance_ledger.createdAt",
      "trade_reward_reservations.id", "trade_reward_reservations.tradeId", "trade_reward_reservations.status",
      "trade_reward_reservations.reservedMinor", "trade_reward_reservations.currency", "trade_reward_reservations.updatedAt",
      "trade_lifecycle_events.tradeId", "trade_lifecycle_events.id", "trade_lifecycle_events.eventType",
      "trade_lifecycle_events.stage", "trade_lifecycle_events.createdAt",
    ];
    const missingColumns = requiredColumns.filter((name) => !columns.has(name));
    if (missingTables.length || missingColumns.length) {
      throw new Error(
        "Schema is incomplete; refusing to produce incomplete recovery evidence. " +
        (missingTables.length ? "Missing tables: " + missingTables.join(", ") + ". " : "") +
        (missingColumns.length ? "Missing columns: " + missingColumns.join(", ") + "." : ""),
      );
    }

    const [countRows] = await db.query("SELECT COUNT(*) AS totalCount FROM trade_positions");
    const totalTradeCount = safeInteger(countRows[0]?.totalCount, "trade_positions total count");
    const [tradeRows] = await db.execute(
      "SELECT id, userId, currency, status, settlementStatus, principalMinor, rewardCreditedMinor, realizedGrossProfitMinor, platformFeeMinor, netProfitMinor, settlementOutcome, feePolicyVersion, platformFeeRateBps, platformFeeRoundingMode, settlementReference, walletUpdatedAt FROM trade_positions ORDER BY id DESC LIMIT ?",
      [args.limit],
    );
    const scanCoverage = {
      requestedLimit: args.limit,
      selectedTradeCount: tradeRows.length,
      totalTradeCount,
      complete: tradeRows.length === totalTradeCount,
    };
    const trades = tradeRows.map((row) => ({
      id: safeInteger(row.id, "trade_positions.id"),
      userId: safeInteger(row.userId, "trade_positions.userId"),
      currency: String(row.currency),
      status: String(row.status),
      settlementStatus: String(row.settlementStatus),
      principalMinor: safeInteger(row.principalMinor, "trade_positions.principalMinor"),
      rewardCreditedMinor: safeInteger(row.rewardCreditedMinor, "trade_positions.rewardCreditedMinor"),
      realizedGrossProfitMinor: safeInteger(row.realizedGrossProfitMinor, "trade_positions.realizedGrossProfitMinor"),
      platformFeeMinor: safeInteger(row.platformFeeMinor, "trade_positions.platformFeeMinor"),
      netProfitMinor: safeInteger(row.netProfitMinor, "trade_positions.netProfitMinor"),
      settlementOutcome: String(row.settlementOutcome),
      feePolicyVersion: safeInteger(row.feePolicyVersion, "trade_positions.feePolicyVersion"),
      platformFeeRateBps: safeInteger(row.platformFeeRateBps, "trade_positions.platformFeeRateBps"),
      platformFeeRoundingMode: String(row.platformFeeRoundingMode),
      settlementReference: row.settlementReference == null ? null : String(row.settlementReference),
      walletUpdatedAt: row.walletUpdatedAt ?? null,
    }));

    if (trades.length === 0) {
      const empty = [];
      if (args.output) {
        const outputPath = resolve(root, args.output);
        await writeFile(outputPath, JSON.stringify(empty, null, 2) + "\n", { flag: "wx" });
        console.log(`Collected 0 trades. Evidence written to ${outputPath}`);
      } else {
        console.log(JSON.stringify(empty, null, 2));
      }
      await db.query("ROLLBACK");
      transactionOpen = false;
      return;
    }

    const tradeIds = [...new Set(trades.map((trade) => trade.id))];
    const idSql = placeholders(tradeIds.length);
    const ledgerBaseFor = (trade) => {
      if (!trade.settlementReference) return null;
      if (trade.settlementOutcome === "legacy_unrecorded" || trade.settlementReference.length <= 60) return trade.settlementReference;
      return `trade-${trade.id}-${createHash("sha256").update(trade.settlementReference).digest("hex").slice(0,24)}`;
    };
    const refs = [...new Set(trades.flatMap((trade) => {
      const base = ledgerBaseFor(trade);
      if (!base) return [];
      return trade.settlementOutcome === "legacy_unrecorded"
        ? [`${base}:principal`, `${trade.settlementReference}:reward`]
        : [`${base}:principal`, `${base}:gross-profit`, `${base}:platform-fee`, `${base}:loss`];
    }))];
    const ledgerRows = refs.length
      ? (await db.execute(
          `SELECT id, userId, currency, amountMinor, entryType, reference, createdAt FROM balance_ledger WHERE reference IN (${placeholders(refs.length)}) ORDER BY id`,
          refs,
        ))[0]
      : [];
    const lifecycleRows = (await db.execute(
      `SELECT id, tradeId, eventType, stage, createdAt FROM trade_lifecycle_events WHERE tradeId IN (${idSql}) ORDER BY tradeId, id`,
      tradeIds,
    ))[0];
    const reservationRows = (await db.execute(
      `SELECT id, tradeId, status, reservedMinor, currency, updatedAt FROM trade_reward_reservations WHERE tradeId IN (${idSql}) ORDER BY tradeId, id`,
      tradeIds,
    ))[0];

    const walletPairs = [...new Map(trades.map((trade) => [
      `${trade.userId}:${trade.currency}`,
      [trade.userId, trade.currency],
    ])).values()];
    const walletWhere = walletPairs.map(() => "(userId = ? AND currency = ?)").join(" OR ");
    const walletParams = walletPairs.flatMap(([userId, currency]) => [userId, currency]);
    const walletRows = (await db.execute(
      `SELECT id, userId, currency, availableMinor, lockedMinor, promotionalMinor, earnedMinor, updatedAt FROM customer_balances WHERE ${walletWhere}`,
      walletParams,
    ))[0];

    const popupAvailable = tables.has("opportunity_popup_events") &&
      has("opportunity_popup_events.id", "opportunity_popup_events.tradeId", "opportunity_popup_events.eventStatus");
    const popupRows = popupAvailable
      ? (await db.execute(
          `SELECT id, tradeId, eventStatus FROM opportunity_popup_events WHERE tradeId IN (${idSql}) ORDER BY id`,
          tradeIds,
        ))[0]
      : [];

    const records = trades.map((trade) => {
      const ledgerBaseReference = ledgerBaseFor(trade);
      const principalReference = ledgerBaseReference ? `${ledgerBaseReference}:principal` : null;
      const rewardReference = trade.settlementReference
        ? (trade.settlementOutcome === "legacy_unrecorded" ? `${trade.settlementReference}:reward` : `${ledgerBaseReference}:gross-profit`)
        : null;
      const feeReference = ledgerBaseReference && trade.settlementOutcome !== "legacy_unrecorded" ? `${ledgerBaseReference}:platform-fee` : null;
      const lossReference = ledgerBaseReference && trade.settlementOutcome !== "legacy_unrecorded" ? `${ledgerBaseReference}:loss` : null;
      const matchingLedger = ledgerRows.filter((row) =>
        safeInteger(row.userId, "balance_ledger.userId") === trade.userId &&
        String(row.currency) === trade.currency,
      );
      const principalRows = matchingLedger.filter((row) =>
        row.entryType === "trade_principal_release" && row.reference === principalReference,
      );
      const rewardRows = matchingLedger.filter((row) =>
        row.entryType === "trade_reward" && row.reference === rewardReference,
      );
      const feeRows = matchingLedger.filter((row) =>
        row.entryType === "trade_platform_fee" && row.reference === feeReference,
      );
      const lossRows = matchingLedger.filter((row) =>
        row.entryType === "trade_loss" && row.reference === lossReference,
      );
      const reservationForTrade = reservationRows.filter((row) =>
        safeInteger(row.tradeId, "trade_reward_reservations.tradeId") === trade.id,
      );
      const reservationStatus = reservationForTrade.length === 1
        ? String(reservationForTrade[0].status)
        : reservationForTrade.length > 1 ? "duplicate" : null;
      const walletForTrade = walletRows.filter((row) =>
        safeInteger(row.userId, "customer_balances.userId") === trade.userId &&
        String(row.currency) === trade.currency,
      );
      const wallet = walletForTrade.length === 1 ? {
        id: safeInteger(walletForTrade[0].id, "customer_balances.id"),
        userId: safeInteger(walletForTrade[0].userId, "customer_balances.userId"),
        currency: String(walletForTrade[0].currency),
        availableMinor: safeInteger(walletForTrade[0].availableMinor, "customer_balances.availableMinor"),
        lockedMinor: safeInteger(walletForTrade[0].lockedMinor, "customer_balances.lockedMinor"),
        promotionalMinor: safeInteger(walletForTrade[0].promotionalMinor, "customer_balances.promotionalMinor"),
        earnedMinor: safeInteger(walletForTrade[0].earnedMinor, "customer_balances.earnedMinor"),
        updatedAt: walletForTrade[0].updatedAt ?? null,
      } : null;
      const lifecycleForTrade = lifecycleRows.filter((row) =>
        safeInteger(row.tradeId, "trade_lifecycle_events.tradeId") === trade.id,
      );
      const popupForTrade = popupRows.filter((row) =>
        safeInteger(row.tradeId, "opportunity_popup_events.tradeId") === trade.id,
      );
      const ledgerSummary = (rows) => ({
        count: rows.length,
        amountMinor: rows.length === 1
          ? safeInteger(rows[0].amountMinor, "balance_ledger.amountMinor")
          : rows.length > 1
            ? rows.reduce((sum, row) => sum + safeInteger(row.amountMinor, "balance_ledger.amountMinor"), 0)
            : null,
        entries: rows.map((row) => ({
          id: safeInteger(row.id, "balance_ledger.id"),
          amountMinor: safeInteger(row.amountMinor, "balance_ledger.amountMinor"),
          entryType: String(row.entryType),
          reference: String(row.reference),
          createdAt: row.createdAt ?? null,
        })),
      });
      const principal = ledgerSummary(principalRows);
      const reward = ledgerSummary(rewardRows);
      const fee = ledgerSummary(feeRows);
      const loss = ledgerSummary(lossRows);
      const context = {
        tradeId: trade.id,
        userId: trade.userId,
        currency: trade.currency,
        principalMinor: trade.principalMinor,
        rewardCreditedMinor: trade.rewardCreditedMinor,
        settlementReference: trade.settlementReference,
        walletMatchCount: walletForTrade.length,
        wallet,
        settlementOutcome: trade.settlementOutcome,
        realizedGrossProfitMinor: trade.realizedGrossProfitMinor,
        platformFeeMinor: trade.platformFeeMinor,
        netProfitMinor: trade.netProfitMinor,
        feePolicyVersion: trade.feePolicyVersion,
        platformFeeRateBps: trade.platformFeeRateBps,
        platformFeeRoundingMode: trade.platformFeeRoundingMode,
        principalLedger: principal,
        grossProfitLedger: reward,
        platformFeeLedger: fee,
        realizedLossLedger: loss,
        reservationCount: reservationForTrade.length,
        rewardReservationStatus: reservationStatus,
        reservation: reservationForTrade.map((row) => ({
          id: safeInteger(row.id, "trade_reward_reservations.id"),
          tradeId: safeInteger(row.tradeId, "trade_reward_reservations.tradeId"),
          status: String(row.status),
          reservedMinor: safeInteger(row.reservedMinor, "trade_reward_reservations.reservedMinor"),
          currency: String(row.currency),
          updatedAt: row.updatedAt ?? null,
        })),
        lifecycleEvents: lifecycleForTrade.map((row) => ({
          id: safeInteger(row.id, "trade_lifecycle_events.id"),
          eventType: String(row.eventType),
          stage: String(row.stage),
          createdAt: row.createdAt ?? null,
        })),
        popupEvents: popupForTrade.map((row) => ({
          id: safeInteger(row.id, "opportunity_popup_events.id"),
          eventStatus: String(row.eventStatus),
        })),
        scanCoverage,
        identityMismatchedLedgerRows: ledgerRows.filter((row) =>
          (row.reference === principalReference || row.reference === rewardReference || row.reference === feeReference || row.reference === lossReference) &&
          (safeInteger(row.userId, "balance_ledger.userId") !== trade.userId || String(row.currency) !== trade.currency),
        ).map((row) => ({
          id: safeInteger(row.id, "balance_ledger.id"),
          userId: safeInteger(row.userId, "balance_ledger.userId"),
          currency: String(row.currency),
          entryType: String(row.entryType),
          reference: String(row.reference),
        })),
      };
      return {
        tradeId: trade.id,
        evidence: {
          tradeStatus: trade.status,
          settlementStatus: trade.settlementStatus,
          principalMinor: trade.principalMinor,
          rewardCreditedMinor: trade.rewardCreditedMinor,
          realizedGrossProfitMinor: trade.realizedGrossProfitMinor,
          platformFeeMinor: trade.platformFeeMinor,
          netProfitMinor: trade.netProfitMinor,
          settlementOutcome: trade.settlementOutcome,
          feePolicyVersion: trade.feePolicyVersion,
          platformFeeRateBps: trade.platformFeeRateBps,
          platformFeeRoundingMode: trade.platformFeeRoundingMode,
          settlementReference: trade.settlementReference,
          principalLedgerCount: principal.count,
          principalLedgerAmountMinor: principal.amountMinor,
          grossProfitLedgerCount: reward.count,
          grossProfitLedgerAmountMinor: reward.amountMinor,
          platformFeeLedgerCount: fee.count,
          platformFeeLedgerAmountMinor: fee.amountMinor,
          realizedLossLedgerCount: loss.count,
          realizedLossLedgerAmountMinor: loss.amountMinor,
          rewardReservationStatus: reservationStatus,
          lifecycleEventCount: lifecycleForTrade.length,
          walletUpdatedAtPresent: trade.walletUpdatedAt != null,
        },
        context,
      };
    });

    await db.query("ROLLBACK");
    transactionOpen = false;
    if (args.output) {
      const outputPath = resolve(root, args.output);
      await writeFile(outputPath, JSON.stringify(records, null, 2) + "\n", { flag: "wx" });
      console.log(`Collected read-only evidence for ${records.length} trades. Output: ${outputPath}`);
      console.log("Output is compatible with db:plan-trade-recovery. The output file was created without overwriting an existing file.");
    } else {
      console.log(JSON.stringify(records, null, 2));
    }
    console.error("READ-ONLY ONLY: no customer balances, trades, ledger rows, reservations, or lifecycle events were modified.");
  } catch (error) {
    if (transactionOpen) {
      try { await db.query("ROLLBACK"); } catch { /* preserve the original error */ }
    }
    console.error("Trade recovery evidence collection failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

await main();
