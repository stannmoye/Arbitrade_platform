export async function commitThenRecordWalletTelemetry<T>(
  commitAdjustment: () => Promise<T>,
  recordTelemetry: (committedResult: T) => Promise<unknown>,
  onTelemetryFailure: (error: unknown) => void = () => {},
): Promise<T> {
  const committedResult = await commitAdjustment();
  try {
    await recordTelemetry(committedResult);
  } catch (error) {
    // Logging/alerting must not mask a wallet transaction that already committed.
    try {
      onTelemetryFailure(error);
    } catch {
      // Preserve the committed result even if the failure reporter is unavailable.
    }
  }
  return committedResult;
}
