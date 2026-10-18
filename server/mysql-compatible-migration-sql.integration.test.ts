import mysql from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { executeCompatibleMigrationSql } from "../scripts/mysql-compatible-migration-sql.mjs";

const databaseUrl = process.env.MIGRATION_SQL_TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;
const tableName = "migration_adapter_test";

databaseDescribe("MySQL-compatible migration SQL against a disposable database", () => {
  it("replays guarded column/index additions and preserves semicolons inside SQL strings", async () => {
    const db = await mysql.createConnection(databaseUrl!);
    try {
      await db.query(`DROP TABLE IF EXISTS ${tableName}`);
      await db.query(`CREATE TABLE ${tableName} (
        id INT NOT NULL PRIMARY KEY,
        existing_column INT NULL,
        note VARCHAR(80) NULL
      ) ENGINE=InnoDB`);

      const migration = `
        -- Existing columns must be left untouched on an upgrade.
        ALTER TABLE \`${tableName}\`
          ADD COLUMN IF NOT EXISTS \`existing_column\` INT NULL,
          ADD COLUMN IF NOT EXISTS \`added_column\` VARCHAR(50) NOT NULL DEFAULT 'default;value';
        CREATE INDEX IF NOT EXISTS \`idx_migration_adapter_added\`
          ON \`${tableName}\` (\`added_column\`);
        INSERT INTO \`${tableName}\` (\`id\`,\`note\`)
          VALUES (1,'hello;world')
          ON DUPLICATE KEY UPDATE \`note\`=VALUES(\`note\`);
      `;
      const connection = db as unknown as Parameters<typeof executeCompatibleMigrationSql>[0];
      await executeCompatibleMigrationSql(connection, migration);
      await executeCompatibleMigrationSql(connection, migration);

      const [columns] = await db.execute<any[]>(
        "SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name='added_column'",
        [tableName],
      );
      expect(columns).toHaveLength(1);
      const [indexes] = await db.execute<any[]>(
        "SELECT index_name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND index_name='idx_migration_adapter_added'",
        [tableName],
      );
      expect(indexes.length).toBeGreaterThan(0);
      const [rows] = await db.execute<any[]>(`SELECT id,existing_column,added_column,note FROM ${tableName}`);
      expect(rows).toHaveLength(1);
      expect(rows[0].note).toBe("hello;world");
      expect(rows[0].added_column).toBe("default;value");
    } finally {
      await db.query(`DROP TABLE IF EXISTS ${tableName}`);
      await db.end();
    }
  }, 30_000);
});
