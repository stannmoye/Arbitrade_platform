import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const uiSource = readFileSync(new URL("../client/src/components/CustomerMining.tsx", import.meta.url), "utf8");
const quoteStart = uiSource.indexOf("const swapQuoteMutation =");
const quoteEnd = uiSource.indexOf("\n\n  const data", quoteStart);
const confirmStart = uiSource.indexOf("const confirmSwapQuote = () =>");
const confirmEnd = uiSource.indexOf("const cancelSwapQuote = () =>", confirmStart);
const quoteMutation = uiSource.slice(quoteStart, quoteEnd);
const confirmHandler = uiSource.slice(confirmStart, confirmEnd);

describe("customer Mining swap confirmation contract", () => {
  it("only creates and displays a quote; it does not execute the financial operation", () => {
    expect(quoteStart).toBeGreaterThanOrEqual(0);
    expect(quoteEnd).toBeGreaterThan(quoteStart);
    expect(quoteMutation).toContain("setSwapQuote(quote)");
    expect(quoteMutation).not.toContain("swapMutation.mutate");
    expect(uiSource).toContain("Boolean(swapQuote)");
    expect(uiSource).toContain("disabled={swapMutation.isPending || swapQuoteMutation.isPending}");
  });

  it("requires an explicit confirmation action and rechecks quote expiry at click time", () => {
    expect(confirmStart).toBeGreaterThanOrEqual(0);
    expect(confirmEnd).toBeGreaterThan(confirmStart);
    expect(confirmHandler).toContain("if (!swapQuote || swapMutation.isPending) return");
    expect(confirmHandler).toContain("new Date(swapQuote.expiresAt).getTime() <= Date.now()");
    expect(confirmHandler).toContain("This swap quote has expired. Request a fresh quote before confirming.");
    expect(confirmHandler).toContain("swapMutation.mutate({ quoteId: Number(swapQuote.quoteId), idempotencyKey: confirmationKey })");
    expect(uiSource).toContain("Confirm conversion");
  });

  it("reuses the quote's idempotency key when a confirmation needs retrying", () => {
    expect(uiSource).toContain("const [swapConfirmationKey, setSwapConfirmationKey] = useState<string | null>(null)");
    expect(confirmHandler).toContain("const confirmationKey = swapConfirmationKey || requestId()");
    expect(confirmHandler).toContain("if (!swapConfirmationKey) setSwapConfirmationKey(confirmationKey)");
    expect(confirmHandler).not.toContain("idempotencyKey: requestId()");
  });

  it("shows the source amount, destination amount, fee and disclaimer before confirmation", () => {
    expect(uiSource).toContain("Review conversion");
    expect(uiSource).toContain("{fmt(swapQuote.sourceAmount, 8)} CKI");
    expect(uiSource).toContain("{fmt(swapQuote.destinationAmount, mainWalletScale(swapQuote.targetAsset))} {swapQuote.targetAsset}");
    expect(uiSource).toContain("{fmt(swapQuote.fee, mainWalletScale(swapQuote.feeAsset))} {swapQuote.feeAsset}");
    expect(uiSource).toContain("{swapQuote.disclaimer}");
    expect(uiSource).toContain("Quote expires<strong>{new Date(swapQuote.expiresAt).toLocaleString()}</strong>");
  });
});
