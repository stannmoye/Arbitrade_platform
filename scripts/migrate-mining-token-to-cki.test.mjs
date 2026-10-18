import { afterEach, describe, expect, it, vi } from "vitest";
import { migrateMiningTokenToCki } from "./migrate-mining-token-to-cki.mjs";

function createConnection({ legacyBalances = [] } = {}) {
  const calls = [];
  return {
    calls,
    async beginTransaction() { calls.push(["beginTransaction"]); },
    async commit() { calls.push(["commit"]); },
    async rollback() { calls.push(["rollback"]); },
    async query(sql) {
      calls.push(["query", sql]);
      if (sql.includes("SELECT migrationKey FROM mining_schema_migrations")) return [[], []];
      if (sql.includes("SELECT * FROM mining_economics_versions")) {
        return [[{ version: 1, tokenSymbol: "CKI" }], []];
      }
      if (sql.includes("SELECT id FROM v5_wallets WHERE assetCode='TOKEN'")) {
        return [legacyBalances, []];
      }
      throw new Error("Unexpected query in test fixture: " + sql);
    },
    async execute(sql, params) {
      calls.push(["execute", sql, params]);
      if (sql.includes("INSERT INTO mining_schema_migrations")) return [{ affectedRows: 1 }, []];
      throw new Error("Unexpected execute in test fixture: " + sql);
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("migrateMiningTokenToCki fresh CKI handling", () => {
  it("records a no-op when CKI is already active and no non-zero legacy TOKEN balances remain", async () => {
    const connection = createConnection();
    vi.spyOn(console, "log").mockImplementation(() => {});

    await migrateMiningTokenToCki(connection);

    expect(connection.calls.some(([kind]) => kind === "commit")).toBe(true);
    expect(connection.calls.some(([kind]) => kind === "rollback")).toBe(false);
    const marker = connection.calls.find(([kind, sql]) => kind === "execute" && sql.includes("INSERT INTO mining_schema_migrations"));
    expect(marker).toBeTruthy();
    expect(JSON.parse(marker[2][1])).toMatchObject({
      tokenName: "CoinKi",
      tokenSymbol: "CKI",
      reclassifiedUserWallets: 0,
      reclassifiedAmount: "0.00000000",
      historicalLedgerPreserved: true,
    });
  });

  it("refuses to no-op when non-zero legacy TOKEN wallet balances remain", async () => {
    const connection = createConnection({ legacyBalances: [{ id: 7 }] });

    await expect(migrateMiningTokenToCki(connection)).rejects.toThrow(
      "non-zero legacy TOKEN wallet balances remain",
    );

    expect(connection.calls.some(([kind]) => kind === "rollback")).toBe(true);
    expect(connection.calls.some(([kind, sql]) => kind === "execute" && sql.includes("INSERT INTO mining_schema_migrations"))).toBe(false);
    expect(connection.calls.some(([kind]) => kind === "commit")).toBe(false);
  });
});
