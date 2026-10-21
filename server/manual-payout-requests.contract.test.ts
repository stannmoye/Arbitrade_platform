import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { transform } from "esbuild";

const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0059_manual_payout_requests.sql", import.meta.url), "utf8");
const migrationRunner = readFileSync(new URL("../scripts/apply-portal-migrations.mjs", import.meta.url), "utf8");
const customerUi = readFileSync(new URL("../client/src/components/PayoutRequests.tsx", import.meta.url), "utf8");
const payoutBrowserAcceptance = readFileSync(new URL("../scripts/payout-browser-acceptance.cjs", import.meta.url), "utf8");
const adminUi = readFileSync(new URL("../client/src/components/AdminOperationsPages.tsx", import.meta.url), "utf8");

const requestStart = db.indexOf("export async function createCustomerPayoutRequest");
const cancelStart = db.indexOf("export async function cancelCustomerPayoutRequest");
const resolveStart = db.indexOf("export async function resolveCustomerPayoutRequest");
const requestService = db.slice(requestStart, cancelStart);
const cancelService = db.slice(cancelStart, resolveStart);
const resolveService = db.slice(resolveStart);

describe("manual payout request lifecycle contract", () => {
  it("limits payout currency to canonical main-wallet assets and tracks requests in a migration", () => {
    expect(db).toContain('new Set(["USD", "EUR", "GBP", "BTC", "ETH", "USDT"])');
    expect(router).toContain('z.enum(["USD", "EUR", "GBP", "BTC", "ETH", "USDT"])');
    expect(customerUi).toContain('["USD", "EUR", "GBP", "BTC", "ETH", "USDT"] as const');
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `payout_requests`");
    expect(migration).toContain("payout_requests_external_reference_unique");
    expect(schema).toContain('export const payoutRequests = mysqlTable("payout_requests"');
    expect(migrationRunner).toContain('"0059_manual_payout_requests.sql"');
    expect(migrationRunner).toContain('"payout_requests"');
  });

  it("requires the global and per-customer withdrawal gates and verified KYC when required", () => {
    expect(requestStart).toBeGreaterThanOrEqual(0);
    expect(cancelStart).toBeGreaterThan(requestStart);
    expect(requestService).toContain("payoutIdempotencyKey(userId, input.idempotencyKey)");
    expect(requestService).toContain("assertPayoutPolicyAllowsRequest(tx, userId)");
    expect(db).toContain('policy.withdrawals !== true');
    expect(db).toContain('controls.withdrawalsEnabled !== true');
    expect(db).toContain('profile?.overallStatus !== "VERIFIED"');
    expect(db).toContain("controls.emailVerified !== true");
    expect(db).toContain("policy.twofa === true || controls.twoFactorRequired === true");
    expect(db).toContain("payout verification is not available yet");
  });

  it("uses row locks and reserves only non-promotional funds atomically", () => {
    expect(requestService).toContain('from(users).where(eq(users.id, userId)).limit(1).for("update")');
    expect(requestService).toContain("prior.destinationDetails === destinationDetails");
    expect(requestService).toContain("Number.isSafeInteger(input.amountMinor)");
    expect(requestService).toContain("promotional > available");
    expect(requestService).toContain("input.amountMinor > available - promotional");
    expect(requestService).toContain('const expectedDestinationType = cryptoCurrency ? "crypto_transfer" : "bank_transfer"');
    expect(requestService).toContain("no conversion is performed.");
    expect(requestService).toContain("Payout wallet reservation");
    expect(requestService).toContain('entryType: "payout_reserve"');
    expect(requestService).toContain('status: "pending"');
  });

  it("releases reserved funds on customer cancellation or admin rejection", () => {
    expect(cancelService).toContain('eq(payoutRequests.userId, userId)');
    expect(cancelService).toContain('request.status !== "pending"');
    expect(cancelService).toContain("Payout cancellation wallet release");
    expect(cancelService).toContain('status: "cancelled"');
    expect(resolveService).toContain("Payout rejection wallet release");
    expect(resolveService).toContain('entryType: "payout_release"');
  });

  it("requires a unique external reference for payout completion and never triggers an automatic transfer", () => {
    expect(resolveService).toContain("externalReference.length < 3");
    expect(resolveService).toContain("duplicateReference");
    expect(resolveService).toContain("Payout paid wallet settlement");
    expect(resolveService).toContain('entryType: "payout_paid"');
    expect(resolveService).toContain('status: input.action');
    expect(schema).toContain('externalReferenceUnique: uniqueIndex("payout_requests_external_reference_unique")');
    expect(resolveService).not.toContain("transferProvider");
    expect(resolveService).not.toContain("sendExternalTransfer");
    const deleteStart = db.indexOf("export async function deleteAdminCustomer");
    const deleteService = db.slice(deleteStart);
    expect(deleteService).toContain("Resolve or cancel pending payout requests before deleting this customer.");
    expect(deleteService).toContain('tx.delete(payoutRequests).where(eq(payoutRequests.userId,userId))');
  });

  it("exposes only customer-owned requests and admin-only resolution in the router", () => {
    expect(router).toContain("payoutEligibility: protectedProcedure.query(({ ctx }) => getCustomerPayoutEligibility(ctx.user.id))");
    expect(router).toContain("payoutRequests: protectedProcedure.query(({ ctx }) => listCustomerPayoutRequests(ctx.user.id))");
    expect(router).toContain("cancelCustomerPayoutRequest(ctx.user.id, input.requestId)");
    expect(router).toContain("payoutRequests: adminProcedure.query(() => listAdminPayoutRequests())");
    expect(router).toContain("resolveCustomerPayoutRequest(ctx.user.id, input)");
    expect(customerUi).toContain("trpc.customer.payoutEligibility.useQuery");
    expect(customerUi).toContain("eligibility.data?.allowed === true && !eligibility.isError");
    expect(customerUi).toContain('className="payout-eligibility-alert" role="alert"');
    expect(customerUi).toContain("!payoutAllowed || !amountValid");
    expect(customerUi).toContain('setAmountText(""); setDestinationDetails(""); setDestinationType(["BTC", "ETH", "USDT"].includes(nextCurrency) ? "crypto_transfer" : "bank_transfer")');
    expect(customerUi).toContain("Never enter passwords, PINs, private keys, or seed phrases.");
    expect(adminUi).toContain("Reject and release");
    expect(adminUi).toContain("Mark paid");
  });

  it("keeps the payout browser acceptance script parseable and focused on real user-visible flow states", async () => {
    const parsed = await transform(payoutBrowserAcceptance, { loader: "js", target: "node22" });
    expect(parsed.code).toContain('procedure === "customer.requestPayout"');
    expect(payoutBrowserAcceptance).toContain('procedure === "customer.requestPayout"');
    expect(payoutBrowserAcceptance).toContain('procedure === "customer.cancelPayoutRequest"');
    expect(payoutBrowserAcceptance).toContain("Available for payout: USD 80.00");
    expect(payoutBrowserAcceptance).toContain('getByText("Pending manual review", { exact: true })');
    expect(payoutBrowserAcceptance).toContain("staleDestinationCleared");
    expect(payoutBrowserAcceptance).toContain("Cancelled · funds released");
    expect(payoutBrowserAcceptance).toContain("No external bank or blockchain transfer is initiated.");
    expect(payoutBrowserAcceptance).toContain("async function runAdminPayoutReview(browser)");
    expect(payoutBrowserAcceptance).toContain("External transfer reference for payout-admin-paid-1");
    expect(payoutBrowserAcceptance).toContain("Resolution note for payout-admin-reject-1");
    expect(payoutBrowserAcceptance).toContain("async function runAdminPayoutReview(browser)");
    expect(payoutBrowserAcceptance).toContain("External transfer reference for payout-admin-paid-1");
    expect(payoutBrowserAcceptance).toContain("Resolution note for payout-admin-reject-1");
  });
});
