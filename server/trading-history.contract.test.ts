import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { projectAdminTradingHistoryResult } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function contextForRole(role: "user" | "admin"): TrpcContext {
  const now = new Date();
  return {
    user: { id: 7, openId: "trading-history-test", email: "history@example.com", name: "Test", loginMethod: "password", role, createdAt: now, updatedAt: now, lastSignedIn: now },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("admin Trading History read-only contract", () => {
  it("rejects customer and unauthenticated sessions through adminProcedure", async () => {
    const input = { scanLimit: 100 };
    await expect(appRouter.createCaller(contextForRole("user")).adminOperations.tradingHistory(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller({ ...contextForRole("user"), user: null }).adminOperations.tradingHistory(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects unsupported filters and unsafe bounds before database access", async () => {
    const caller = appRouter.createCaller(contextForRole("admin"));
    await expect(caller.adminOperations.tradingHistory({ userId: 0, scanLimit: 100 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.adminOperations.tradingHistory({ userId: 2_147_483_648, scanLimit: 100 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.adminOperations.tradingHistory({ beforeTradeId: 0, scanLimit: 100 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.adminOperations.tradingHistory({ beforeTradeId: 2_147_483_648, scanLimit: 100 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.adminOperations.tradingHistory({ status: "unknown" as never, scanLimit: 100 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.adminOperations.tradingHistory({ settlementStatus: "unknown" as never, scanLimit: 100 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.adminOperations.tradingHistory({ scanLimit: 24 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.adminOperations.tradingHistory({ scanLimit: 251 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.adminOperations.tradingHistory({ scanLimit: 25.5 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.adminOperations.tradingHistory({ fromDate: "2026-02-30", scanLimit: 100 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.adminOperations.tradingHistory({ fromDate: "2026-06-02", toDate: "2026-06-01", scanLimit: 100 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.adminOperations.tradingHistory({ unbounded: true, scanLimit: 100 } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("withholds default and partial-settlement amounts unless saved evidence is complete", () => {
    const incomplete = projectAdminTradingHistoryResult({
      settlementConfirmedAt: null,
      settlementConfirmedBy: null,
      settlementReference: null,
      settlementOutcome: "legacy_unrecorded",
      realizedGrossProfitMinor: 0,
      platformFeeMinor: 0,
      netProfitMinor: 0,
    });
    expect(incomplete.actualResultAvailable).toBe(false);
    expect(incomplete.settlementConfirmedAt).toBeNull();
    expect(incomplete.settlementReference).toBeNull();
    expect(incomplete.settlementOutcome).toBeNull();
    expect(incomplete.realizedGrossProfitMinor).toBeNull();
    expect(incomplete.platformFeeMinor).toBeNull();
    expect(incomplete.netProfitMinor).toBeNull();
    expect(incomplete).not.toHaveProperty("settlementConfirmedBy");

    const complete = projectAdminTradingHistoryResult({
      settlementConfirmedAt: new Date("2026-07-01T10:00:00.000Z"),
      settlementConfirmedBy: 23,
      settlementReference: "SETTLEMENT-23",
      settlementOutcome: "profit",
      realizedGrossProfitMinor: 1500,
      platformFeeMinor: 225,
      netProfitMinor: 1275,
    });
    expect(complete.actualResultAvailable).toBe(true);
    expect(complete.settlementReference).toBe("SETTLEMENT-23");
    expect(complete.realizedGrossProfitMinor).toBe(1500);
    expect(complete.platformFeeMinor).toBe(225);
    expect(complete.netProfitMinor).toBe(1275);
  });

  it("exposes legacy migration-default fee rows as needing review in the pending-settlement projection", () => {
    const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    const queryStart = dbSource.indexOf("export async function listPendingSettlements()");
    const queryEnd = dbSource.indexOf("export async function listTradeSettlementIntegrityIssues(", queryStart);
    const query = dbSource.slice(queryStart, queryEnd);
    expect(query).toContain("feeSnapshotStatus");
    expect(query).toContain("classifyTradeFeeSnapshot");
  });

  it("uses one registered admin query and a bounded descending primary-key scan with an explicit safe projection", () => {
    const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    const queryStart = dbSource.indexOf("export async function listAdminTradingHistory(");
    const queryEnd = dbSource.indexOf("export async function markDueTradesAwaitingConfirmation(", queryStart);
    const query = dbSource.slice(queryStart, queryEnd);
    expect(queryStart).toBeGreaterThanOrEqual(0);
    expect(queryEnd).toBeGreaterThan(queryStart);
    expect(routerSource).toContain("tradingHistory: adminProcedure.input(");
    expect(routerSource).toContain(".query(({ input }) => listAdminTradingHistory(input))");
    expect(query).toContain("lt(tradePositions.id, filters.beforeTradeId)");
    expect(query).toContain("orderBy(desc(tradePositions.id))");
    expect(query).toContain("limit(scanLimit + 1)");
    expect(query).toContain("candidates.slice(0, scanLimit)");
    expect(query).toContain("nextBeforeTradeId");
    expect(query).toContain("tradePositions.settlementReference");
    expect(query).toContain("tradePositions.settlementConfirmedAt");
    expect(query).toContain("tradePositions.settlementConfirmedBy");
    expect(query).toContain("rows.map(projectAdminTradingHistoryResult)");
    expect(query).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.transaction\(/);
    expect(query).not.toContain(".leftJoin(");
  });
});
