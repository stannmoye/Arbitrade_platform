export const SUPPORT_ATTACHMENT_STORAGE_KEY_INDEX_NAME = "uq_support_attachment_storage_key";

/**
 * Refuse the uniqueness migration until duplicate storage-key claims are
 * reconciled. Returning an existing index lets the migration runner safely
 * handle installations where the constraint was applied outside its tracker.
 */
export async function preflightSupportAttachmentStorageKeyUniqueIndex(connection) {
  const [indexes] = await connection.query(
    "SHOW INDEX FROM support_attachments WHERE Key_name=?",
    [SUPPORT_ATTACHMENT_STORAGE_KEY_INDEX_NAME],
  );
  if (indexes.length) {
    if (indexes.length !== 1 || Number(indexes[0].Non_unique) !== 0 || indexes[0].Column_name !== "storageKey" || indexes[0].Sub_part != null) {
      throw new Error(
        "Cannot enforce unique support attachment storage keys: the expected index name exists with an incompatible definition.",
      );
    }
    return { indexExists: true, duplicateFound: false };
  }

  const [duplicates] = await connection.query(
    "SELECT storageKey,COUNT(*) AS count FROM support_attachments GROUP BY storageKey HAVING COUNT(*)>1 LIMIT 1",
  );
  if (duplicates.length) {
    throw new Error(
      "Cannot enforce unique support attachment storage keys: duplicate storage keys require manual reconciliation before migration.",
    );
  }
  return { indexExists: false, duplicateFound: false };
}
