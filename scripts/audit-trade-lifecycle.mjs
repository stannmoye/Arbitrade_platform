import { config } from "dotenv";
import mysql from "mysql2/promise";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env"), override: false });
const raw = process.env.DATABASE_URL;
if (!raw) { console.error("Trade lifecycle audit requires DATABASE_URL in the private .env file."); process.exit(2); }
const url = new URL(raw);
if (!["mysql:", "mariadb:"].includes(url.protocol) || !url.pathname.replace(/^\/+/, "")) { console.error("DATABASE_URL must identify a MySQL/MariaDB database. No changes were made."); process.exit(2); }
if (url.protocol === "mariadb:") url.protocol = "mysql:";
url.searchParams.set("timezone", "Z");
const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
const db = await mysql.createConnection({ host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: databaseName, ssl: url.searchParams.get("ssl") === "true" ? {} : undefined, connectTimeout: 10000, multipleStatements: false });
const tables = new Set();
const columns = new Set();
const reports = [];
async function loadSchema() {
  const [tableRows] = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()");
  for (const row of tableRows) tables.add(String(row.table_name));
  const [columnRows] = await db.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE()");
  for (const row of columnRows) columns.add(String(row.table_name) + "." + String(row.column_name));
}
function has(...required) { return required.every(name => columns.has(name)); }
async function report(name, sql, params = []) {
  const [rows] = await db.execute(sql, params);
  reports.push({ name, count: rows.length, sample: rows.slice(0, 20).map(row => row.id ?? row.tradeId ?? row.eventId ?? row.reservationId ?? row.userId ?? null) });
}
try {
  console.log("ARBITRADE TRADE LIFECYCLE AUDIT — READ ONLY");
  console.log("Database: " + databaseName);
  console.log("Only SELECT queries are executed. No balances, trades, reservations, or lifecycle events are modified.");
  await loadSchema();
  for (const table of ["trade_positions", "trade_lifecycle_events", "balance_ledger", "trade_reward_reservations", "opportunity_popup_events"]) {
    console.log("Schema " + table + ": " + (tables.has(table) ? "present" : "MISSING"));
  }
  if (!tables.has("trade_positions")) { console.error("Cannot continue: trade_positions is missing."); process.exitCode = 2; }
  else {
    if (tables.has("trade_lifecycle_events") && has("trade_positions.id", "trade_lifecycle_events.tradeId")) {
      await report("trades_without_lifecycle_events", "SELECT t.id FROM trade_positions t LEFT JOIN trade_lifecycle_events e ON e.tradeId=t.id WHERE e.id IS NULL ORDER BY t.id DESC LIMIT 100");
    } else console.log("SKIP trades_without_lifecycle_events: required table/columns missing");
    if (has("trade_positions.id", "trade_positions.status", "trade_positions.settlementStatus")) {
      await report("settlement_state_mismatch", "SELECT t.id FROM trade_positions t WHERE (t.status = 'settled' AND t.settlementStatus <> 'completed') OR (t.status <> 'settled' AND t.settlementStatus = 'completed') ORDER BY t.id DESC LIMIT 100");
    }
    if (has("trade_positions.id", "trade_positions.status", "trade_positions.walletUpdatedAt")) {
      await report("settled_without_wallet_updated_at", "SELECT t.id FROM trade_positions t WHERE t.status = 'settled' AND t.walletUpdatedAt IS NULL ORDER BY t.id DESC LIMIT 100");
    }
    if (tables.has("balance_ledger") && has("trade_positions.id", "trade_positions.status", "trade_positions.settlementReference", "trade_positions.principalMinor", "balance_ledger.id", "balance_ledger.reference", "balance_ledger.entryType", "balance_ledger.amountMinor")) {
      await report("settled_missing_or_mismatched_principal_release", "SELECT t.id FROM trade_positions t LEFT JOIN balance_ledger l ON l.reference=CONCAT(CASE WHEN CHAR_LENGTH(t.settlementReference)<=60 THEN t.settlementReference ELSE CONCAT('trade-',t.id,'-',LEFT(SHA2(t.settlementReference,256),24)) END, ':principal') AND l.entryType='trade_principal_release' WHERE t.status='settled' AND (t.settlementReference IS NULL OR l.id IS NULL OR l.amountMinor <> t.principalMinor) ORDER BY t.id DESC LIMIT 100");
    }
    if (tables.has("balance_ledger") && has("trade_positions.id", "trade_positions.status", "trade_positions.settlementReference", "trade_positions.realizedGrossProfitMinor", "trade_positions.settlementOutcome", "balance_ledger.id", "balance_ledger.reference", "balance_ledger.entryType", "balance_ledger.amountMinor")) {
      await report("settled_missing_or_mismatched_gross_profit_credit", "SELECT t.id FROM trade_positions t LEFT JOIN balance_ledger l ON l.reference=CONCAT(CASE WHEN CHAR_LENGTH(t.settlementReference)<=60 THEN t.settlementReference ELSE CONCAT('trade-',t.id,'-',LEFT(SHA2(t.settlementReference,256),24)) END, ':gross-profit') AND l.entryType='trade_reward' WHERE t.status='settled' AND t.settlementOutcome<>'legacy_unrecorded' AND ((t.realizedGrossProfitMinor > 0 AND (l.id IS NULL OR l.amountMinor <> t.realizedGrossProfitMinor)) OR (t.realizedGrossProfitMinor <= 0 AND l.id IS NOT NULL)) ORDER BY t.id DESC LIMIT 100");
    }
    if (tables.has("balance_ledger") && has("trade_positions.id", "trade_positions.status", "trade_positions.settlementReference", "trade_positions.platformFeeMinor", "trade_positions.settlementOutcome", "balance_ledger.id", "balance_ledger.reference", "balance_ledger.entryType", "balance_ledger.amountMinor")) {
      await report("settled_missing_or_mismatched_platform_fee", "SELECT t.id FROM trade_positions t LEFT JOIN balance_ledger l ON l.reference=CONCAT(CASE WHEN CHAR_LENGTH(t.settlementReference)<=60 THEN t.settlementReference ELSE CONCAT('trade-',t.id,'-',LEFT(SHA2(t.settlementReference,256),24)) END, ':platform-fee') AND l.entryType='trade_platform_fee' WHERE t.status='settled' AND t.settlementOutcome<>'legacy_unrecorded' AND ((t.platformFeeMinor > 0 AND (l.id IS NULL OR l.amountMinor <> -t.platformFeeMinor)) OR (t.platformFeeMinor = 0 AND l.id IS NOT NULL)) ORDER BY t.id DESC LIMIT 100");
    }
    if (tables.has("balance_ledger") && has("trade_positions.id", "trade_positions.status", "trade_positions.settlementReference", "trade_positions.realizedGrossProfitMinor", "trade_positions.settlementOutcome", "balance_ledger.id", "balance_ledger.reference", "balance_ledger.entryType", "balance_ledger.amountMinor")) {
      await report("settled_missing_or_mismatched_realized_loss", "SELECT t.id FROM trade_positions t LEFT JOIN balance_ledger l ON l.reference=CONCAT(CASE WHEN CHAR_LENGTH(t.settlementReference)<=60 THEN t.settlementReference ELSE CONCAT('trade-',t.id,'-',LEFT(SHA2(t.settlementReference,256),24)) END, ':loss') AND l.entryType='trade_loss' WHERE t.status='settled' AND t.settlementOutcome<>'legacy_unrecorded' AND ((t.realizedGrossProfitMinor < 0 AND (l.id IS NULL OR l.amountMinor <> t.realizedGrossProfitMinor)) OR (t.realizedGrossProfitMinor >= 0 AND l.id IS NOT NULL)) ORDER BY t.id DESC LIMIT 100");
    }
    if (tables.has("trade_reward_reservations") && has("trade_reward_reservations.tradeId", "trade_reward_reservations.status", "trade_positions.id", "trade_positions.status")) {
      await report("reserved_reward_for_settled_trade", "SELECT r.tradeId FROM trade_reward_reservations r JOIN trade_positions t ON t.id=r.tradeId WHERE t.status='settled' AND r.status='reserved' ORDER BY r.tradeId DESC LIMIT 100");
      await report("credited_reward_for_unsettled_trade", "SELECT r.tradeId FROM trade_reward_reservations r JOIN trade_positions t ON t.id=r.tradeId WHERE r.status='credited' AND t.status<>'settled' ORDER BY r.tradeId DESC LIMIT 100");
    }
    if (tables.has("opportunity_popup_events") && has("opportunity_popup_events.id", "opportunity_popup_events.eventStatus", "opportunity_popup_events.tradeId", "trade_positions.id")) {
      await report("traded_popup_missing_trade_reference", "SELECT p.id AS eventId FROM opportunity_popup_events p WHERE p.eventStatus='TRADED' AND p.tradeId IS NULL ORDER BY p.id DESC LIMIT 100");
      await report("popup_references_missing_trade", "SELECT p.id AS eventId FROM opportunity_popup_events p LEFT JOIN trade_positions t ON t.id=p.tradeId WHERE p.tradeId IS NOT NULL AND t.id IS NULL ORDER BY p.id DESC LIMIT 100");
    }
  }
  console.log("\nFINDINGS (each sample is capped at 20 IDs; count is capped at 100 rows by the audit query):");
  for (const item of reports) console.log(JSON.stringify(item));
  console.log("\nThis is a diagnostic report only. Do not automatically repair findings; verify ledger and wallet state before any manual correction.");
} catch (error) { console.error("Trade lifecycle audit failed:", error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
finally { await db.end(); }
