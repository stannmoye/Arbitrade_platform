import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  findWorkerSchemaContractFailures,
  WORKER_SCHEMA_CONTRACTS,
} from "./worker-schema-contracts.mjs";

function validMetadata() {
  const columns = [];
  const indexes = [];
  for (const [table, contract] of Object.entries(WORKER_SCHEMA_CONTRACTS)) {
    for (const column of contract.columns) {
      const dataType = contract.dataTypes?.[column] ?? (contract.exactColumnTypes?.[column] ? "enum" : "int");
      columns.push({
        tableName: table,
        columnName: column,
        dataType,
        columnType: contract.exactColumnTypes?.[column] ?? dataType,
        isNullable: contract.nullable?.[column] ? "YES" : "NO",
      });
    }
    for (const [indexName, index] of Object.entries(contract.indexes)) {
      index.columns.forEach((columnName, position) => indexes.push({
        tableName: table,
        indexName,
        columnName,
        nonUnique: index.unique ? 0 : 1,
        sequenceInIndex: position + 1,
      }));
    }
  }
  return { columns, indexes };
}

describe("worker schema contracts", () => {
  it("accepts the exact columns, nullability, campaign states, and ordered indexes required by workers", () => {
    const { columns, indexes } = validMetadata();
    expect(findWorkerSchemaContractFailures(columns, indexes)).toEqual([]);
  });

  it("rejects present tables whose shape would still break worker SQL", () => {
    const { columns, indexes } = validMetadata();
    const brokenColumns = columns
      .filter((row) => !(row.tableName === "mining_pending_boost_rewards" && row.columnName === "amountCki"))
      .map((row) => row.tableName === "notification_campaigns" && row.columnName === "status"
        ? { ...row, columnType: "enum('draft','scheduled','published')" }
        : row);
    const brokenIndexes = indexes.map((row) =>
      row.tableName === "notification_campaign_deliveries" && row.indexName === "notification_campaign_delivery_status_idx"
        ? { ...row, columnName: row.sequenceInIndex === 1 ? "status" : row.sequenceInIndex === 2 ? "campaignId" : row.columnName }
        : row,
    );

    const failures = findWorkerSchemaContractFailures(brokenColumns, brokenIndexes);
    expect(failures).toContain("mining_pending_boost_rewards.amountCki: required column is missing");
    expect(failures.some((failure) => failure.includes("notification_campaigns.status: expected enum("))).toBe(true);
    expect(failures.some((failure) => failure.includes("notification_campaign_delivery_status_idx: expected index column order"))).toBe(true);
  });

  it("rejects a reward amount column with the wrong decimal precision", () => {
    const { columns, indexes } = validMetadata();
    const malformed = columns.map((row) =>
      row.tableName === "mining_pending_boost_rewards" && row.columnName === "amountCki"
        ? { ...row, columnType: "decimal(18,2)" }
        : row,
    );
    expect(findWorkerSchemaContractFailures(malformed, indexes))
      .toContain("mining_pending_boost_rewards.amountCki: expected decimal(36,18), found decimal(18,2)");
  });

  it("rejects an absent worker table instead of trusting migration tracker records", () => {
    const { columns, indexes } = validMetadata();
    expect(findWorkerSchemaContractFailures(
      columns.filter((row) => row.tableName !== "mining_pending_boost_rewards"),
      indexes.filter((row) => row.tableName !== "mining_pending_boost_rewards"),
    )).toContain("mining_pending_boost_rewards: table is missing or has no visible columns");
  });

  it("keeps the standalone mining and portal campaign migrations covered by the standard journal bridge", async () => {
    const root = new URL("../", import.meta.url);
    const [journalText, mainSql, miningSql, portalSql, portalRunner] = await Promise.all([
      readFile(new URL("drizzle/meta/_journal.json", root), "utf8"),
      readFile(new URL("drizzle/0062_worker_runtime_tables.sql", root), "utf8"),
      readFile(new URL("drizzle/0048_pending_boost_rewards.sql", root), "utf8"),
      readFile(new URL("drizzle/0055_notification_campaign_delivery_tracking.sql", root), "utf8"),
      readFile(new URL("scripts/apply-portal-migrations.mjs", root), "utf8"),
    ]);
    const journal = JSON.parse(journalText);
    expect(journal.entries.some((entry) => entry.tag === "0062_worker_runtime_tables")).toBe(true);
    // The standalone 0048 SQL is now an explicit forward-only journal entry at
    // the tail. Do not insert it back at its historical number: databases may
    // already have recorded 0062, and main migration recovery requires a prefix.
    const last = journal.entries.at(-1);
    const previous = journal.entries.at(-2);
    expect(last.tag).toBe("0048_pending_boost_rewards");
    expect(last.idx).toBe(previous.idx + 1);
    expect(last.when).toBeGreaterThan(previous.when);
    expect(portalRunner).toContain('"0055_notification_campaign_delivery_tracking.sql"');
    expect(portalRunner).toContain('"0058_withdrawable_notification_campaigns.sql"');

    // 0048 and 0055 remain authoritative standalone/portal-chain sources.
    // The journaled 0062 bridge intentionally provides their worker tables to
    // deployments that run only Drizzle's standard migration path.
    for (const table of Object.keys(WORKER_SCHEMA_CONTRACTS)) {
      expect(mainSql).toContain(table);
    }
    for (const column of WORKER_SCHEMA_CONTRACTS.mining_pending_boost_rewards.columns) {
      expect(miningSql).toContain(column);
      expect(mainSql).toContain(column);
    }
    for (const table of ["notification_campaigns", "notification_campaign_deliveries"]) {
      expect(portalSql).toContain(table);
      expect(mainSql).toContain(table);
    }
    for (const column of WORKER_SCHEMA_CONTRACTS.notification_campaigns.columns) {
      expect(portalSql).toContain(column);
      expect(mainSql).toContain(column);
    }
    for (const column of WORKER_SCHEMA_CONTRACTS.notification_campaign_deliveries.columns) {
      expect(portalSql).toContain(column);
      expect(mainSql).toContain(column);
    }
  });

  it("gates migration success on actual worker-table schema contracts", async () => {
    const root = new URL("../", import.meta.url);
    const [mainRunner, portalRunner, miningRunner, miningRepair, runtimeRepair, verifier, installerVerifier] = await Promise.all([
      readFile(new URL("scripts/guarded-main-migrate.mjs", root), "utf8"),
      readFile(new URL("scripts/apply-portal-migrations.mjs", root), "utf8"),
      readFile(new URL("scripts/apply-mining-migrations.mjs", root), "utf8"),
      readFile(new URL("scripts/ensure-mining-current-schema.mjs", root), "utf8"),
      readFile(new URL("scripts/ensure-worker-runtime-schema.mjs", root), "utf8"),
      readFile(new URL("scripts/verify-worker-schema.mjs", root), "utf8"),
      readFile(new URL("installer/verify-install.mjs", root), "utf8"),
    ]);

    const mainVerification = mainRunner.indexOf("const verified = await assertWorkerSchemaContracts(connection);");
    const mainSuccess = mainRunner.indexOf("SET status='completed'");
    expect(mainVerification).toBeGreaterThan(-1);
    expect(mainVerification).toBeLessThan(mainSuccess);

    const portalVerification = portalRunner.indexOf("const verified = await assertWorkerSchemaContracts(connection);");
    expect(portalVerification).toBeGreaterThan(portalRunner.indexOf("Applied and recorded ${filename}"));
    expect(portalRunner).toContain("[portal-migrate] PASS: verified");

    const miningVerification = miningRunner.indexOf("const verified = await assertWorkerSchemaContracts(connection);");
    expect(miningVerification).toBeGreaterThan(miningRunner.indexOf("const rewardMethodsMigrationKey"));
    expect(miningVerification).toBeLessThan(miningRunner.indexOf("} finally {\n  await connection.end();"));
    expect(miningRunner).toContain("[mining-migrate] PASS: verified");

    const miningRepairVerification = miningRepair.indexOf('const verified = await assertWorkerSchemaContracts(db, ["mining_pending_boost_rewards"]);');
    expect(miningRepairVerification).toBeGreaterThan(-1);
    expect(miningRepairVerification).toBeLessThan(miningRepair.indexOf('message: "Current mining schema is ready"'));
    expect(runtimeRepair).toContain("const verified = await assertWorkerSchemaContracts(db);");
    expect(verifier).toContain("const verified = await assertWorkerSchemaContracts(db);");
    expect(installerVerifier).toContain("const verified = await assertWorkerSchemaContracts(db);");
    expect(installerVerifier).toContain('report("Worker schema contracts", false, detail)');
  });
});
