export function classifySchemaAudit(checks) {
  if (!Array.isArray(checks) || checks.length === 0) return { status: "cannot_assess", passed: 0, failed: 0, explanation: "No schema checks were provided." };
  const passed = checks.filter((check) => check?.ok === true).length;
  const failed = checks.length - passed;
  if (failed === 0) return { status: "schema_signals_match", passed, failed, explanation: "All configured schema/data signals are present. This is not proof that this specific migration executed or that every side effect is correct." };
  if (passed === 0) return { status: "expected_signals_missing", passed, failed, explanation: "None of the configured signals were found. The migration may be absent, partially applied, or represented differently; inspect manually before any retry." };
  return { status: "mixed_or_incomplete", passed, failed, explanation: "Some configured signals are present and others are missing or mismatched. Treat this as potentially partial and do not automatically rerun the migration." };
}
