export function classifyPortalMigrationRecord(record, expectedChecksum) {
  if (!record) {
    return { action: "run", reason: "No record exists; migration has not been started by this tracked runner." };
  }

  const actualChecksum = String(record.checksum ?? "");
  if (!/^[a-f0-9]{64}$/i.test(expectedChecksum) || actualChecksum !== expectedChecksum) {
    return { action: "stop", reason: "The recorded checksum does not match the checked-out SQL file; manual review is required." };
  }

  const status = String(record.status ?? "");
  if (status === "applied" || status === "baseline_confirmed") {
    return {
      action: "skip",
      reason: status === "applied"
        ? "previous successful execution is recorded"
        : "operator-confirmed historical baseline (not independently verified by this tool)",
    };
  }
  if (status === "started" || status === "failed") {
    return { action: "stop", reason: "a previous attempt may have partially changed the database; automatic retry is blocked." };
  }

  return { action: "stop", reason: "the migration record has an unknown status; manual review is required." };
}
