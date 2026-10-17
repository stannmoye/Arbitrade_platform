import { describe, expect, it, vi } from "vitest";
import { executeCompatibleMigrationSql } from "./mysql-compatible-migration-sql.mjs";

function createConnection({ columns = [], indexes = [] } = {}) {
  const queries = [];
  const executions = [];
  return {
    queries,
    executions,
    async execute(sql, params) {
      executions.push({ sql, params });
      if (sql.includes("information_schema.columns")) {
        return [columns.includes(params[1]) ? [{ present: 1 }] : [], []];
      }
      if (sql.includes("information_schema.statistics")) {
        return [indexes.includes(params[1]) ? [{ present: 1 }] : [], []];
      }
      throw new Error("Unexpected metadata query: " + sql);
    },
    async query(sql) {
      queries.push(sql);
      return [[], []];
    },
  };
}

describe("executeCompatibleMigrationSql", () => {
  it("skips an existing column while preserving mixed ALTER clauses and commas in literals", async () => {
    const connection = createConnection({ columns: ["existing_column"] });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      await executeCompatibleMigrationSql(
        connection,
        "ALTER TABLE `example_table` ADD COLUMN IF NOT EXISTS `existing_column` INT, ADD COLUMN IF NOT EXISTS `new_column` VARCHAR(30) DEFAULT 'a,b', ADD COLUMN `regular_column` INT;",
      );
    } finally {
      log.mockRestore();
    }

    expect(connection.executions).toHaveLength(2);
    expect(connection.queries).toEqual([
      "ALTER TABLE `example_table` ADD COLUMN `new_column` VARCHAR(30) DEFAULT 'a,b', ADD COLUMN `regular_column` INT",
    ]);
  });

  it("normalizes indentation in multiline ALTER statements for MySQL 8", async () => {
    const connection = createConnection();
    await executeCompatibleMigrationSql(
      connection,
      "ALTER TABLE mining_economics_versions\\n  ADD COLUMN IF NOT EXISTS defaultContractDurationMonths INT NOT NULL DEFAULT 24 AFTER tokenSymbol;",
    );
    expect(connection.queries).toEqual([
      "ALTER TABLE mining_economics_versions ADD COLUMN defaultContractDurationMonths INT NOT NULL DEFAULT 24 AFTER tokenSymbol",
    ]);
  });

  it("creates a missing unique index and skips an existing index", async () => {
    const connection = createConnection({ indexes: ["idx_existing"] });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      await executeCompatibleMigrationSql(
        connection,
        "CREATE INDEX IF NOT EXISTS `idx_existing` ON `example_table` (`one`);\nCREATE UNIQUE INDEX IF NOT EXISTS `idx_new` ON `example_table` (`one`, `two`);",
      );
    } finally {
      log.mockRestore();
    }

    expect(connection.executions).toHaveLength(2);
    expect(connection.queries).toEqual([
      "CREATE UNIQUE INDEX `idx_new` ON `example_table` (`one`, `two`)",
    ]);
  });

  it("splits statements without splitting semicolons inside strings and strips leading comments", async () => {
    const connection = createConnection();

    await executeCompatibleMigrationSql(
      connection,
      "-- first statement comment\nSELECT 'left;right' AS value; /* second comment; still a comment */ SELECT 2;",
    );

    expect(connection.queries).toEqual([
      "SELECT 'left;right' AS value",
      "SELECT 2",
    ]);
  });

  it("passes ordinary SQL through unchanged apart from surrounding whitespace", async () => {
    const connection = createConnection();

    await executeCompatibleMigrationSql(connection, "\n  UPDATE `example_table` SET `value`=1; \n");

    expect(connection.queries).toEqual(["UPDATE `example_table` SET `value`=1"]);
  });
});
