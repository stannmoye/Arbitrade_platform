import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");

describe("customer opportunity feed side-effect separation", () => {
  const start = routerSource.indexOf("opportunities: protectedProcedure.input(z.object({ consumeDelivery: z.boolean().optional() }).optional())");
  const end = routerSource.indexOf("trades: protectedProcedure.query", start);
  const handler = routerSource.slice(start, end);

  it("keeps the customer feed handler free of financial mutations and notification writes", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(handler).toContain("listCustomerOpportunities(ctx.user.id, { consumeDelivery: input?.consumeDelivery })");
    expect(handler).not.toContain("recordTransactionConsoleEvent");
    expect(handler).not.toContain("createNotification");
    expect(handler).not.toContain("executeAutomaticTrades");
  });

  it("makes only the global alert feed consume deliveries", () => {
    expect(appSource).toContain('trpc.customer.opportunities.useQuery({consumeDelivery:true},{refetchInterval:3000})');
    expect(appSource).toContain('trpc.customer.opportunities.useQuery({consumeDelivery:false},{refetchInterval:5000})');
  });
});
