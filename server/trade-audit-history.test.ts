import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { decodeTradeAuditCursor, deriveTradeAuditScope, encodeTradeAuditCursor } from "./db";

function contextForRole(role: "user" | "admin"): TrpcContext {
  const now = new Date();
  return {
    user: { id: 7, openId: "trade-audit-test", email: "trade-audit@example.com", name: "Test", loginMethod: "password", role, createdAt: now, updatedAt: now, lastSignedIn: now },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Trade Settings audit history query", () => {
  it("rejects customer and unauthenticated sessions through adminProcedure", async () => {
    const input = { pageSize: 50 };
    await expect(appRouter.createCaller(contextForRole("user")).adminOperations.tradeAuditHistory(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller({ ...contextForRole("user"), user: null }).adminOperations.tradeAuditHistory(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects invalid filters, unsupported actor IDs, and page bounds before reaching the database", async () => {
    const caller = appRouter.createCaller(contextForRole("admin"));
    await expect(caller.adminOperations.tradeAuditHistory({ actorUserId: 0, pageSize: 50 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.adminOperations.tradeAuditHistory({ actorUserId: 2_147_483_648, pageSize: 50 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.adminOperations.tradeAuditHistory({ pageSize: 101 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.adminOperations.tradeAuditHistory({ key: " ".repeat(2), pageSize: 50 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.adminOperations.tradeAuditHistory({ key: "k".repeat(161), pageSize: 50 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.adminOperations.tradeAuditHistory({ entityType: "e".repeat(81), pageSize: 50 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.adminOperations.tradeAuditHistory({ entityId: "i".repeat(129), pageSize: 50 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.adminOperations.tradeAuditHistory({ package: "p".repeat(101), pageSize: 50 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.adminOperations.tradeAuditHistory({ scope: "unsupported" as never, pageSize: 50 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.adminOperations.tradeAuditHistory({ fromDate: "2025-02-30", pageSize: 50 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.adminOperations.tradeAuditHistory({ fromDate: "2025-06-02", toDate: "2025-06-01", pageSize: 50 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.adminOperations.tradeAuditHistory({ cursor: "not a cursor", pageSize: 50 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("derives scope categories from persisted action and entity type", () => {
    expect(deriveTradeAuditScope("trade_fee_policy_updated", "trade_fee_policy")).toBe("global");
    expect(deriveTradeAuditScope("trading_package_terms_updated", "trading_package")).toBe("package");
    expect(deriveTradeAuditScope("trading_delivery_policy_updated", "opportunity_package_policy")).toBe("package");
    expect(deriveTradeAuditScope("company_catalogue.bulk_status_updated", "company_catalogue")).toBe("record");
    expect(deriveTradeAuditScope("trading_opportunity_published", "opportunity_offer")).toBe("record");
    expect(deriveTradeAuditScope("unrelated_event", "unknown_entity")).toBeNull();
  });

  it("includes the migration-created global control event in audit history with global scope", () => {
    const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    const allowlist = source.match(/const TRADE_SETTINGS_AUDIT_ACTIONS = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
    expect(allowlist).toContain('"trade_global_controls_migrated"');
    expect(deriveTradeAuditScope("trade_global_controls_migrated", "trade_global_control_policy")).toBe("global");
  });

  it("encodes an exact composite cursor so equal timestamps remain ordered by descending id", () => {
    const createdAt = new Date("2026-06-01T12:30:00.000Z");
    const first = encodeTradeAuditCursor(createdAt, 30);
    const second = encodeTradeAuditCursor(createdAt, 29);
    expect(decodeTradeAuditCursor(first)).toEqual({ createdAt: createdAt.toISOString(), id: 30 });
    expect(decodeTradeAuditCursor(second)).toEqual({ createdAt: createdAt.toISOString(), id: 29 });
    expect(decodeTradeAuditCursor(first)!.id).toBeGreaterThan(decodeTradeAuditCursor(second)!.id);
    expect(() => decodeTradeAuditCursor("eyJpZCI6MX0")).toThrow("Trade audit cursor is invalid");
  });

  it("uses a narrow action allowlist, bounded scans, an exact continuation probe and a descending composite keyset", () => {
    const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    const start = source.indexOf("export async function listAdminTradeAuditHistory(");
    const end = source.indexOf("export async function getTradeFeePolicy()", start);
    const implementation = source.slice(start, end);
    expect(implementation).toContain("inArray(v5AuditEvents.action, [...TRADE_SETTINGS_AUDIT_ACTIONS])");
    expect(implementation).toContain("scanLimit = 1000");
    expect(implementation).toContain("remainingCandidate");
    expect(implementation).toContain("scanCapped");
    expect(implementation).toContain("orderBy(desc(v5AuditEvents.createdAt), desc(v5AuditEvents.id))");
    expect(implementation).toContain("auditKeysetPredicate(scanCursor)");
    expect(source).toContain("metadata?.termsVersion");
    expect(source).toContain("lt(v5AuditEvents.id, cursor.id)");
    expect(implementation).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
  });
});
