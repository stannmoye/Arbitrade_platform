import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

describe("financial notification delivery observability", () => {
  it("does not count a notification as delivered when persistence cannot be confirmed", () => {
    expect(dbSource).toContain('if(!notificationId) throw new Error("Notification persistence could not be confirmed");');
  });

  it("keeps null-category legacy notifications visible in the event cursor when a category is disabled", () => {
    expect(dbSource).toContain("or(isNull(customerNotifications.category),notInArray(customerNotifications.category,disabled))");
  });

  it("orders notification cursor ties by descending ID for deterministic polling windows", () => {
    expect(dbSource).toContain("orderBy(desc(customerNotifications.createdAt),desc(customerNotifications.id)).limit(500)");
  });

  it("reports failed allocation, settlement, and trade-allocation notices after commit", () => {
    expect(source).toContain('Automatic allocation notices failed after ledger commit.');
    expect(source).toContain('Automatic settlement notices failed after ledger commit.');
    expect(source).toContain('Trade allocation notices failed after ledger commit.');
    expect(source).toContain('allocationNoticeResults.some(outcome=>outcome.status==="rejected")');
    expect(source).toContain('settlementNoticeResults.some(outcome=>outcome.status==="rejected")');
  });
});
