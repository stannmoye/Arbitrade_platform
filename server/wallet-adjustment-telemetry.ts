export async function commitThenRecordWalletTelemetry<T>(
  commitAdjustment: () => Promise<T>,
  recordTelemetry: (committedResult: T) => Promise<unknown>,
  onTelemetryFailure: (error: unknown) => void = () => {},
): Promise<T> {
  const committedResult = await commitAdjustment();
  try {
    await recordTelemetry(committedResult);
  } catch (error) {
    onTelemetryFailure(error);
  }
  return committedResult;
}
