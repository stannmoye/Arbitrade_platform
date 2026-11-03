import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import {
  decodeAdminLedgerActivityCursor,
  encodeAdminLedgerActivityCursor,
  getAdminLedgerUtcDayBounds,
  isAdminLedgerEntryBeforeCursor,
} from "./db";
import type { TrpcContext } from "./_core/context";

const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const database = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const adminUi = readFileSync(new URL("../client/src/components/AdminOperationsPages.tsx", import.meta.url), "utf8");

function contextForRole(role: "user" | "admin"): TrpcContext {
  const now = new Date();
  return {
    user: {
      id: 7,
      openId: "ledger-scope-test-admin",
      email: "ledger-admin@example.com",
      name: "Ledger Scope Admin",
      loginMethod: "password",
      role,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("administrator wallet Database Entries scope", () => {
  it("requires one positive customer ID and a valid UTC calendar day at the admin route", () => {
    const start = router.indexOf("ledgerActivity: adminProcedure.input(");
    const end = router.indexOf("tradeFeePolicy: adminProcedure.query", start);
    const route = router.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(route).toContain("userId: z.number().int().positive(),");
    expect(route).toContain("UTC day must be a valid YYYY-MM-DD calendar date.");
    expect(route).toContain("cursor: z.string().min(1).max(256).optional()");
    expect(route).toContain("}).strict()).query(({ input }) => listAdminRecentLedgerActivity(input))");
    expect(route).not.toContain(".optional()).query");
  });

  it("rejects missing customer/day and invalid calendar days before any query runs", async () => {
    const caller = appRouter.createCaller(contextForRole("admin"));
    const invoke = caller.adminOperations.ledgerActivity as unknown as (input: unknown) => Promise<unknown>;
    await expect(invoke({ utcDay: "2024-02-29" })).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
    await expect(invoke({ userId: 4 })).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
    await expect(invoke({ userId: 4, utcDay: "2025-02-29" })).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<TRPCError>);
  });

  it("keeps valid wallet activity reads behind administrator authorization", async () => {
    const caller = appRouter.createCaller(contextForRole("user"));
    await expect(caller.adminOperations.ledgerActivity({ userId: 4, utcDay: "2024-02-29" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<TRPCError>);
  });

  it("uses the exact half-open UTC calendar-day interval", () => {
    const { start, end } = getAdminLedgerUtcDayBounds("2024-02-29");
    expect(start.toISOString()).toBe("2024-02-29T00:00:00.000Z");
    expect(end.toISOString()).toBe("2024-03-01T00:00:00.000Z");
    expect(() => getAdminLedgerUtcDayBounds("2025-02-29")).toThrow(/valid YYYY-MM-DD/);
    expect(() => getAdminLedgerUtcDayBounds("2024-2-09")).toThrow(/valid YYYY-MM-DD/);
  });

  it("paginates deterministically by descending timestamp then primary key without duplicates", () => {
    const rows = [
      { id: 22, createdAt: "2024-05-01T12:00:00.000Z" },
      { id: 21, createdAt: "2024-05-01T12:00:00.000Z" },
      { id: 19, createdAt: "2024-05-01T11:59:59.999Z" },
      { id: 18, createdAt: "2024-05-01T11:59:59.999Z" },
      { id: 9, createdAt: "2024-05-01T11:00:00.000Z" },
    ];
    const seen: number[] = [];
    let cursor: ReturnType<typeof decodeAdminLedgerActivityCursor>;
    while (true) {
      const page = (cursor ? rows.filter(row => isAdminLedgerEntryBeforeCursor(row, cursor)) : rows).slice(0, 2);
      if (!page.length) break;
      seen.push(...page.map(row => row.id));
      const last = page.at(-1)!;
      cursor = decodeAdminLedgerActivityCursor(encodeAdminLedgerActivityCursor({ createdAt: new Date(last.createdAt), id: last.id }))!;
    }
    expect(seen).toEqual([22, 21, 19, 18, 9]);
    expect(new Set(seen).size).toBe(seen.length);
    expect(isAdminLedgerEntryBeforeCursor({ id: 20, createdAt: rows[0].createdAt }, { createdAt: new Date(rows[0].createdAt), id: 21 })).toBe(true);
    expect(() => decodeAdminLedgerActivityCursor("not-a-cursor")).toThrow(/cursor is invalid/);
    expect(() => decodeAdminLedgerActivityCursor(Buffer.from("{}", "utf8").toString("base64url"))).toThrow(/cursor is invalid/);
  });

  it("uses a bounded customer/day-only query with the matching timestamp/primary-key cursor order", () => {
    const start = database.indexOf("export async function listAdminRecentLedgerActivity(");
    const end = database.indexOf("\n}", start);
    const implementation = database.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(implementation).toContain("eq(balanceLedger.userId, input.userId)");
    expect(implementation).toContain("gte(balanceLedger.createdAt, dayStart)");
    expect(implementation).toContain("lt(balanceLedger.createdAt, dayEnd)");
    expect(implementation).toContain("lt(balanceLedger.createdAt, cursor.createdAt)");
    expect(implementation).toContain("lt(balanceLedger.id, cursor.id)");
    expect(implementation).toContain(".orderBy(desc(balanceLedger.createdAt), desc(balanceLedger.id))");
    expect(implementation).toContain(".limit(ADMIN_LEDGER_ACTIVITY_PAGE_SIZE + 1)");
    expect(implementation).not.toMatch(/\.\s*(?:insert|update|delete)\s*\(/);
  });

  it("labels UTC boundaries and requires one selected customer/day in the read-only UI", () => {
    const start = adminUi.indexOf("Database Entries · read only");
    const end = adminUi.indexOf("{focus === \"reconciliation\" && <>", start);
    const section = adminUi.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(section).toContain("Customer (required)");
    expect(section).toContain("Calendar day (required, UTC)");
    expect(section).toContain("Timezone: UTC.");
    expect(section).toContain("next day’s 00:00:00 UTC");
    expect(section).toContain("Load next 50 entries");
    expect(section).not.toMatch(/\b(?:edit|delete)\b/i);
    const exportsStart = adminUi.indexOf("export function AdminReportsExports()");
    const exportsEnd = adminUi.indexOf("type WorkerHealthEntry", exportsStart);
    const exportsSection = adminUi.slice(exportsStart, exportsEnd);
    expect(exportsSection).not.toContain("ledgerActivity.useQuery");
    expect(exportsSection).toContain("Wallet activity is deliberately excluded from all-customer exports");
  });
});
