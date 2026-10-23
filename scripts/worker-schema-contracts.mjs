// Schema contracts for raw-SQL tables queried directly by background workers.
// Presence alone is insufficient: CREATE TABLE IF NOT EXISTS leaves malformed
// pre-existing tables unchanged, so migration success must include shape checks.
export const WORKER_SCHEMA_CONTRACTS = Object.freeze({
  mining_pending_boost_rewards: {
    columns: [
      "id", "userId", "rewardEventId", "rewardDay", "amountCki",
      "status", "settledAt", "settlementReference", "createdAt",
    ],
    dataTypes: { rewardDay: "date", amountCki: "decimal", status: "varchar" },
    nullable: { rewardEventId: true, settledAt: true, settlementReference: true },
    indexes: {
      PRIMARY: { unique: true, columns: ["id"] },
      uq_pending_boost_reward_event: { unique: true, columns: ["rewardEventId"] },
      uq_pending_boost_settlement_reference: { unique: true, columns: ["settlementReference"] },
      idx_pending_boost_day_status: { unique: false, columns: ["rewardDay", "status", "userId"] },
    },
  },
  notification_campaigns: {
    columns: [
      "id", "createdBy", "eventKey", "title", "body", "category", "priority",
      "href", "targetUserId", "status", "scheduledAt", "expiresAt", "publishedAt",
      "totalRecipientCount", "createdAt", "updatedAt",
    ],
    dataTypes: { status: "enum" },
    exactColumnTypes: {
      status: "enum('draft','scheduled','published','expired','failed','withdrawn')",
    },
    nullable: {
      href: true, targetUserId: true, scheduledAt: true, expiresAt: true, publishedAt: true,
    },
    indexes: {
      PRIMARY: { unique: true, columns: ["id"] },
      notification_campaign_creator_event_uq: { unique: true, columns: ["createdBy", "eventKey"] },
      notification_campaign_status_scheduled_idx: { unique: false, columns: ["status", "scheduledAt"] },
      notification_campaign_expiry_idx: { unique: false, columns: ["expiresAt"] },
    },
  },
  notification_campaign_deliveries: {
    columns: [
      "id", "campaignId", "userId", "notificationId", "status", "errorCode",
      "attemptedAt", "deliveredAt", "readAt", "createdAt", "updatedAt",
    ],
    dataTypes: { status: "enum" },
    exactColumnTypes: {
      status: "enum('pending','delivered','read','failed','expired','withdrawn')",
    },
    nullable: {
      notificationId: true, errorCode: true, attemptedAt: true, deliveredAt: true, readAt: true,
    },
    indexes: {
      PRIMARY: { unique: true, columns: ["id"] },
      notification_campaign_delivery_recipient_uq: { unique: true, columns: ["campaignId", "userId"] },
      notification_campaign_delivery_status_idx: { unique: false, columns: ["campaignId", "status"] },
      notification_campaign_delivery_user_status_idx: { unique: false, columns: ["userId", "status"] },
    },
  },
});

const normalize = (value) => String(value ?? "").toLowerCase().replace(/\s+/g, "");
const field = (row, camel, upper) => row?.[camel] ?? row?.[upper];

/**
 * Compare information_schema metadata with the schema shapes the mining and
 * notification workers query. This function only reports discrepancies; callers
 * must not auto-drop indexes, coerce column types, or rewrite existing data.
 */
export function findWorkerSchemaContractFailures(columnRows, indexRows, selectedTables = Object.keys(WORKER_SCHEMA_CONTRACTS)) {
  const failures = [];
  const columnsByTable = new Map();
  for (const row of columnRows ?? []) {
    const table = String(field(row, "tableName", "TABLE_NAME") ?? "");
    const column = String(field(row, "columnName", "COLUMN_NAME") ?? "");
    if (!table || !column) continue;
    if (!columnsByTable.has(table)) columnsByTable.set(table, new Map());
    columnsByTable.get(table).set(column, row);
  }

  const indexesByTable = new Map();
  for (const row of indexRows ?? []) {
    const table = String(field(row, "tableName", "TABLE_NAME") ?? "");
    const index = String(field(row, "indexName", "INDEX_NAME") ?? "");
    if (!table || !index) continue;
    if (!indexesByTable.has(table)) indexesByTable.set(table, new Map());
    const byName = indexesByTable.get(table);
    if (!byName.has(index)) byName.set(index, []);
    byName.get(index).push(row);
  }

  for (const table of selectedTables) {
    const contract = WORKER_SCHEMA_CONTRACTS[table];
    if (!contract) {
      failures.push(`unknown worker schema contract: ${table}`);
      continue;
    }
    const tableColumns = columnsByTable.get(table);
    if (!tableColumns) {
      failures.push(`${table}: table is missing or has no visible columns`);
      continue;
    }

    for (const column of contract.columns) {
      const found = tableColumns.get(column);
      if (!found) {
        failures.push(`${table}.${column}: required column is missing`);
        continue;
      }
      const expectedDataType = contract.dataTypes?.[column];
      if (expectedDataType) {
        const actual = normalize(field(found, "dataType", "DATA_TYPE"));
        if (actual !== expectedDataType) {
          failures.push(`${table}.${column}: expected data type ${expectedDataType}, found ${actual || "unknown"}`);
        }
      }
      const expectedExactType = contract.exactColumnTypes?.[column];
      if (expectedExactType) {
        const actual = normalize(field(found, "columnType", "COLUMN_TYPE"));
        if (actual !== normalize(expectedExactType)) {
          failures.push(`${table}.${column}: expected ${expectedExactType}, found ${actual || "unknown"}`);
        }
      }
      const expectedNullable = contract.nullable?.[column];
      if (expectedNullable !== undefined) {
        const actualNullable = normalize(field(found, "isNullable", "IS_NULLABLE"));
        const wanted = expectedNullable ? "yes" : "no";
        if (actualNullable !== wanted) {
          failures.push(`${table}.${column}: expected nullable=${wanted.toUpperCase()}, found ${actualNullable.toUpperCase() || "unknown"}`);
        }
      }
    }

    const tableIndexes = indexesByTable.get(table) ?? new Map();
    for (const [indexName, expected] of Object.entries(contract.indexes)) {
      const actualRows = [...(tableIndexes.get(indexName) ?? [])]
        .sort((a, b) => Number(field(a, "sequenceInIndex", "SEQ_IN_INDEX")) - Number(field(b, "sequenceInIndex", "SEQ_IN_INDEX")));
      if (actualRows.length !== expected.columns.length) {
        failures.push(`${table}.${indexName}: expected index columns (${expected.columns.join(",")}), found ${actualRows.map((row) => String(field(row, "columnName", "COLUMN_NAME") ?? "?")).join(",") || "missing"}`);
        continue;
      }
      const actualColumns = actualRows.map((row) => String(field(row, "columnName", "COLUMN_NAME") ?? ""));
      if (actualColumns.some((column, index) => column !== expected.columns[index])) {
        failures.push(`${table}.${indexName}: expected index column order (${expected.columns.join(",")}), found (${actualColumns.join(",")})`);
      }
      const expectedNonUnique = expected.unique ? 0 : 1;
      if (actualRows.some((row) => Number(field(row, "nonUnique", "NON_UNIQUE")) !== expectedNonUnique)) {
        failures.push(`${table}.${indexName}: expected ${expected.unique ? "unique" : "non-unique"} index`);
      }
    }
  }
  return failures;
}

export async function assertWorkerSchemaContracts(db, selectedTables = Object.keys(WORKER_SCHEMA_CONTRACTS)) {
  if (!Array.isArray(selectedTables) || selectedTables.length === 0) {
    throw new TypeError("At least one worker schema contract must be selected.");
  }
  const tables = [...new Set(selectedTables)];
  const unknownTables = tables.filter((table) => !Object.hasOwn(WORKER_SCHEMA_CONTRACTS, table));
  if (unknownTables.length) {
    throw new Error("Unknown worker schema contract(s): " + unknownTables.join(", "));
  }
  const placeholders = tables.map(() => "?").join(",");
  const [columnRows] = await db.query(
    "SELECT table_name AS tableName, column_name AS columnName, data_type AS dataType, column_type AS columnType, is_nullable AS isNullable " +
    "FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name IN (" + placeholders + ")",
    tables,
  );
  const [indexRows] = await db.query(
    "SELECT table_name AS tableName, index_name AS indexName, non_unique AS nonUnique, seq_in_index AS sequenceInIndex, column_name AS columnName " +
    "FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name IN (" + placeholders + ")",
    tables,
  );
  const failures = findWorkerSchemaContractFailures(columnRows, indexRows, tables);
  if (failures.length) {
    throw new Error("Required mining/notification worker schema contract failed: " + failures.slice(0, 12).join("; "));
  }
  return { checkedTables: tables.length, failures: [] };
}
