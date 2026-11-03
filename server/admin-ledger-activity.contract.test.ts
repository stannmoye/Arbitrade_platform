import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const database = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const adminUi = readFileSync(new URL("../client/src/components/AdminOperationsPages.tsx", import.meta.url), "utf8");

describe("administrator wallet database-entry filters", () => {
  it("keeps customer and UTC-day filters behind a strict admin-only route", () => {
    const start = router.indexOf("ledgerActivity: adminProcedure.input(");
    const end = router.indexOf("tradeFeePolicy: adminProcedure.query", start);
    const route = router.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(route).toContain("userId: z.number().int().positive().optional()");
    expect(route).toContain("UTC day must be a valid YYYY-MM-DD calendar date.");
    expect(route).toContain("}).strict().optional()).query(({ input }) => listAdminRecentLedgerActivity(input ?? {}))");
  });

  it("uses a bounded, parameterized user and half-open UTC-day query", () => {
    const start = database.indexOf("export async function listAdminRecentLedgerActivity(");
    const end = database.indexOf("\n}", start);
    const implementation = database.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(implementation).toContain("eq(balanceLedger.userId, input.userId)");
    expect(implementation).toContain("gte(balanceLedger.createdAt, dayStart)");
    expect(implementation).toContain("lt(balanceLedger.createdAt, new Date(dayStart.getTime() + 24 * 60 * 60 * 1000))");
    expect(implementation).toContain(".limit(150)");
    expect(implementation).not.toContain("update(");
  });

  it("exposes labelled read-only customer and UTC-day filters with a clear action", () => {
    expect(adminUi).toContain('aria-label="Filter wallet database entries"');
    expect(adminUi).toContain('aria-label="Customer user ID"');
    expect(adminUi).toContain('aria-label="UTC day"');
    expect(adminUi).toContain("Clear filters");
    expect(adminUi).toContain("Enter a positive whole customer ID to filter ledger entries.");
  });
});
