import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

describe("support reply notification failure visibility", () => {
  it("reports partial admin notification failures after the reply commits", () => {
    expect(source).toContain('const results=await Promise.allSettled(admins.map(admin=>createNotification(admin.id,"Customer replied to a support ticket"');
    expect(source).toContain('if(results.some(result=>result.status==="rejected")) console.error("[Notifications] One or more customer-reply notices failed after message commit.");');
  });

  it("sends ticket-created notices only after the ticket and opening message commit", () => {
    const start = source.indexOf("export async function createTicket(");
    const end = source.indexOf("export async function listCustomerTickets", start);
    const create = source.slice(start, end);
    const transactionEnd = create.indexOf("});\n  try {");
    const adminNotice = create.indexOf('createNotification(admin.id,"New customer support ticket"');
    const customerNotice = create.indexOf('createNotification(userId,subject,');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(transactionEnd).toBeGreaterThan(create.indexOf("await db.transaction(async tx=>"));
    expect(create.slice(0, transactionEnd)).toContain("tx.insert(supportTickets)");
    expect(create.slice(0, transactionEnd)).toContain("tx.insert(supportMessages)");
    expect(adminNotice).toBeGreaterThan(transactionEnd);
    expect(customerNotice).toBeGreaterThan(transactionEnd);
    expect(create).toContain("eventKey:`support-ticket-created:${ticketId}`");
    expect(create).toContain("eventKey:`support-ticket-created-customer:${ticketId}`");
    expect(create).toContain('category:"support"');
    expect(create).toContain("Promise.allSettled([");
  });

  it("keeps ticket reopening notifications behind the successful conditional status transition", () => {
    const start = source.indexOf("export async function reopenSupportTicket(");
    const end = source.indexOf("export async function listTicketMessages", start);
    const reopen = source.slice(start, end);
    const conditionalUpdate = reopen.indexOf(".where(and(eq(supportTickets.id,ticketId),or(eq(supportTickets.status,\"closed\"),eq(supportTickets.status,\"resolved\"))))");
    const notice = reopen.indexOf("await createNotification(ticket.customerId,\"Your support ticket was reopened\"");
    expect(conditionalUpdate).toBeGreaterThanOrEqual(0);
    expect(reopen.indexOf("if(affected!==1)")).toBeGreaterThan(conditionalUpdate);
    expect(notice).toBeGreaterThan(reopen.indexOf("if(affected!==1)"));
    expect(reopen).toContain("if(affected!==1) {");
    expect(reopen).toContain("category:\"support\"");
    expect(reopen).toContain("Ticket reopen notice failed after status commit:");
  });

});
