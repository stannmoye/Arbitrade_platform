import { describe, expect, it } from "vitest";
import {
  preflightSupportAttachmentStorageKeyUniqueIndex,
  SUPPORT_ATTACHMENT_STORAGE_KEY_INDEX_NAME,
} from "./support-attachment-storage-key-index.mjs";

describe("preflightSupportAttachmentStorageKeyUniqueIndex", () => {
  it("does not reapply a constraint already present in the database", async () => {
    const statements = [];
    const connection = {
      async query(sql, values) {
        statements.push({ sql, values });
        if (sql.startsWith("SHOW INDEX")) return [[{ Key_name: SUPPORT_ATTACHMENT_STORAGE_KEY_INDEX_NAME }], []];
        throw new Error("Unexpected query: " + sql);
      },
    };
    await expect(preflightSupportAttachmentStorageKeyUniqueIndex(connection)).resolves.toEqual({
      indexExists: true,
      duplicateFound: false,
    });
    expect(statements).toHaveLength(1);
  });

  it("blocks migration when historical duplicate storage keys exist", async () => {
    const statements = [];
    const connection = {
      async query(sql, values) {
        statements.push({ sql, values });
        if (sql.startsWith("SHOW INDEX")) return [[], []];
        if (sql.startsWith("SELECT storageKey")) return [[{ storageKey: "duplicate-key", count: 2 }], []];
        throw new Error("Unexpected query: " + sql);
      },
    };
    await expect(preflightSupportAttachmentStorageKeyUniqueIndex(connection)).rejects.toThrow(
      /duplicate storage keys require manual reconciliation/,
    );
    expect(statements.some(({ sql }) => sql.startsWith("ALTER TABLE"))).toBe(false);
  });

  it("allows the migration when existing storage keys are unique", async () => {
    const statements = [];
    const connection = {
      async query(sql, values) {
        statements.push({ sql, values });
        if (sql.startsWith("SHOW INDEX")) return [[], []];
        if (sql.startsWith("SELECT storageKey")) return [[], []];
        throw new Error("Unexpected query: " + sql);
      },
    };
    await expect(preflightSupportAttachmentStorageKeyUniqueIndex(connection)).resolves.toEqual({
      indexExists: false,
      duplicateFound: false,
    });
    expect(statements).toHaveLength(2);
  });
});
