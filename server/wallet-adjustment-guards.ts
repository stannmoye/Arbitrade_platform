export type WalletAdjustmentMode = "credit" | "debit";

export function assertWalletAdjustmentAmount(amountMinor: number): void {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error("Amount must be a positive safe integer");
  }
}

export function assertWalletBalanceSnapshot(
  availableMinor: number,
  promotionalMinor: number,
  amountMinor: number,
  mode: WalletAdjustmentMode,
): void {
  assertWalletAdjustmentAmount(amountMinor);
  if (!Number.isSafeInteger(availableMinor) || !Number.isSafeInteger(promotionalMinor)) {
    throw new Error("Wallet balance exceeds the safe integer range");
  }
  if (availableMinor < 0 || promotionalMinor < 0) {
    throw new Error("Wallet balance cannot be negative; reconcile the stored balance before adjusting it");
  }
  if (mode === "debit" && availableMinor < amountMinor) {
    throw new Error("Debit exceeds available wallet balance");
  }
  if (mode === "credit" &&
      (availableMinor > Number.MAX_SAFE_INTEGER - amountMinor ||
       promotionalMinor > Number.MAX_SAFE_INTEGER - amountMinor)) {
    throw new Error("Wallet credit would exceed the safe integer range");
  }
}
