import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const databaseSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../drizzle/0095_fx_snapshot_source_timestamp_precision.sql", import.meta.url), "utf8");
const customerHomeSource = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");

describe("Trading audit regressions", () => {
  it("persists complete provider source timestamps for qualifying and cross-wallet FX evidence", () => {
    expect(schemaSource).toContain('sourceDate: varchar("sourceDate", { length: 64 })');
    expect(migrationSource).toContain("MODIFY COLUMN `sourceDate` varchar(64) NULL");
    expect(databaseSource).toContain("sourceDate:creditTimeRate.sourceDate");
    expect(databaseSource).toContain("sourceDate:targetRate.sourceDate");
    expect(databaseSource).toContain("sourceDate:debit.rate.sourceDate");
    expect(databaseSource).not.toContain("sourceDate:creditTimeRate.sourceDate.slice(0,16)");
    expect(databaseSource).not.toContain("sourceDate:targetRate.sourceDate.slice(0,16)");
    expect(databaseSource).not.toContain("sourceDate:debit.rate.sourceDate.slice(0,16)");
  });

  it("labels home-card returns as configured payouts and missed returns as not allocated", () => {
    expect(customerHomeSource).toContain("configured return");
    expect(customerHomeSource).toContain("Not allocated · no ledger credit");
    expect(customerHomeSource).not.toContain("estimated reward`)");
    expect(customerHomeSource).not.toContain("Potential reward</em>");
  });
});
