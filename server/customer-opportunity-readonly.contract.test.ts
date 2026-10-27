import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const workerSource = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");

function extract(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return { start, end, body: source.slice(start, end) };
}

describe("customer Trading opportunity reads and worker-owned processing", () => {
  it("serves a persisted customer feed without lifecycle, delivery, policy-seeding, or allocation writes", () => {
    const read = extract(
      dbSource,
      "export async function listCustomerOpportunities(",
      "\nexport async function runAutoTradeCycle(",
    );

    expect(read.start).toBeGreaterThanOrEqual(0);
    expect(read.end).toBeGreaterThan(read.start);
    expect(read.body).toContain("listOpportunityPackagePolicies({seedDefaults:false})");
    expect(read.body).toContain("opportunityPopupEvents.deliveryStatus");
    expect(read.body).toContain("listMissedOpportunities(userId)");
    expect(read.body).not.toMatch(/\.(?:insert|update|delete)\s*\(/);
    for (const mutatingHelper of [
      "markDueTradesAwaitingConfirmation(",
      "ensureCustomerControls(",
      "ensurePopupDeliveries(",
      "autoTradeOpenOpportunities(",
      "runCustomerOpportunityCycle(",
    ]) {
      expect(read.body).not.toContain(mutatingHelper);
    }
  });

  it("keeps opportunity generation and automatic execution in the scheduled worker cycle", () => {
    const cycle = extract(
      dbSource,
      "export async function runCustomerOpportunityCycle(",
      "\nexport async function listCustomerOpportunities(",
    );
    const worker = extract(
      dbSource,
      "export async function runAutoTradeCycle(",
      "\nexport async function createTrade(",
    );

    expect(cycle.start).toBeGreaterThanOrEqual(0);
    expect(cycle.body).toContain("ensureCustomerControls(userId)");
    expect(cycle.body).toContain("ensurePopupDeliveries(");
    expect(cycle.body).toContain("autoTradeOpenOpportunities(userId,autoTradeCandidates,effectiveControls)");
    expect(worker.start).toBeGreaterThanOrEqual(0);
    expect(worker.body).toContain("runCustomerOpportunityCycle(customer.id)");
    expect(worker.body).toContain("createNotification(customer.id");
    expect(workerSource).toContain("runAutoTradeCycle()");
    expect(workerSource).toContain("setInterval");
  });

  it("does not trigger an opportunity cycle from package activation", () => {
    const activation = extract(
      dbSource,
      "export async function activateCustomerTradingPackage(",
      "\nexport async function listOpportunityPackagePolicies(",
    );
    const activationRoute = extract(
      routerSource,
      "    activateTradingPackage: protectedProcedure.input(",
      "    communicationOptions:",
    );

    expect(activation.start).toBeGreaterThanOrEqual(0);
    expect(activation.body).not.toContain("listCustomerOpportunities(");
    expect(activation.body).not.toContain("runCustomerOpportunityCycle(");
    expect(activation.body).not.toContain("immediateCycle");
    expect(activationRoute.start).toBeGreaterThanOrEqual(0);
    expect(activationRoute.body).not.toContain("automaticTradeCount");
    expect(activationRoute.body).not.toContain("recordTransactionConsoleEvent");
    expect(activationRoute.body).not.toContain("createNotification");
  });

  it("keeps the customer opportunities resolver as a read-only query delegation", () => {
    const query = extract(
      routerSource,
      "    opportunities: protectedProcedure.query(",
      "\n",
    );

    expect(query.start).toBeGreaterThanOrEqual(0);
    expect(query.body).toContain("listCustomerOpportunities(ctx.user.id)");
    expect(query.body).not.toContain("recordTransactionConsoleEvent");
    expect(query.body).not.toContain("createNotification");
  });
});
