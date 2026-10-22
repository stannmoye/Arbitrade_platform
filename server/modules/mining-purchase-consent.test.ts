import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mining = readFileSync(new URL("../mining.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("../routers.ts", import.meta.url), "utf8");
const customerMining = readFileSync(new URL("../../client/src/components/CustomerMining.tsx", import.meta.url), "utf8");

describe("Mining package purchase consent contract", () => {
  it("requires explicit consent in the service instead of silently accepting terms", () => {
    const start = mining.indexOf("export async function purchaseCustomerMiningPackage");
    const end = mining.indexOf("\nasync function activePackageRows", start);
    const purchase = mining.slice(start, end);
    expect(purchase).toContain("acceptedTerms: boolean");
    expect(purchase).toContain("if (input.acceptedTerms !== true)");
    expect(purchase).toContain("acceptedTerms: input.acceptedTerms");
    expect(purchase).not.toContain("acceptedTerms: true");
  });

  it("rejects missing or false consent at the API boundary", () => {
    const start = routers.indexOf("purchasePackage: protectedProcedure");
    expect(routers.slice(start, start + 350)).toContain("acceptedTerms: z.literal(true)");
  });

  it("requires the customer to check the acknowledgement before the purchase request", () => {
    expect(customerMining).toContain("I have reviewed the package terms and authorize the immediate debit from my main wallet.");
    expect(customerMining).toContain("disabled={!canPurchase||!acceptedTerms||purchaseMutation.isPending}");
    expect(customerMining).toContain("acceptedTerms:true");
  });
});
