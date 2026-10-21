import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const server = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const uploadSecurity = readFileSync(new URL("./support-upload-security.ts", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const database = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

const supportStart = app.indexOf("function CustomerSupportCenter(");
const supportEnd = app.indexOf("\nfunction ", supportStart + 10);
const support = app.slice(supportStart, supportEnd);
const advancedStart = app.indexOf("function CustomerAdvanced(");
const advancedEnd = app.indexOf("\nfunction PaperclipIcon", advancedStart);
const advanced = app.slice(advancedStart, advancedEnd);
const presignStart = server.indexOf('app.post("/api/support/attachments/presign"');
const presignEnd = server.indexOf("registerOAuthRoutes(app);", presignStart);
const presign = server.slice(presignStart, presignEnd);

describe("Stage 4 support ticket submission security contract", () => {
  it("guards repeated submissions before starting ticket creation", () => {
    expect(support).toContain("if(ticketSubmitBusy||create.isPending||subject.trim().length<3||body.trim().length<1||attachmentError)return");
    expect(support).toContain("setTicketSubmitBusy(true);create.mutate(");
    expect(support).toContain("disabled={ticketSubmitBusy||create.isPending");
    expect(support).toContain("finally{setTicketSubmitBusy(false);}");
  });

  it("keeps the submission lock through attachment upload and registration", () => {
    expect(support).toContain('fetch("/api/support/attachments/presign"');
    expect(support).toContain('method:"PUT"');
    expect(support).toContain("await addAttachment.mutateAsync(");
    expect(support).toContain("onError:()=>{setTicketSubmitBusy(false);");
  });

  it("does not encourage duplicate ticket creation after a partial or uncertain failure", () => {
    expect(support).toContain("Do not submit the form again.");
    expect(support).toContain("Contact support and reference this ticket.");
    expect(support).not.toContain("try attaching the file again");
    expect(support).toContain("Refresh your inbox before retrying to avoid creating a duplicate.");
    expect(support).not.toContain("push(`Ticket could not be opened · ${e.message}`)");
  });

  it("keeps the secondary customer ticket form submission lock in component scope", () => {
    expect(advanced).toContain("const [ticketSubmitBusy,setTicketSubmitBusy]=useState(false)");
    expect(advanced).toContain("if(!subject.trim()||!body.trim()||ticketSubmitBusy)return; setTicketSubmitBusy(true)");
    expect(advanced).toContain("finally { setTicketSubmitBusy(false); }");
  });

  it("only returns safe HTTPS presigned URLs and avoids forwarding provider errors", () => {
    expect(presign).toContain("getSafePresignedUploadUrl(payload.url)");
    expect(presign).toContain("signal: AbortSignal.timeout(10_000)");
    expect(presign).toContain('randomBytes(24).toString("hex")');
    expect(presign).not.toContain("Math.random()");
    expect(uploadSecurity).toContain('url.protocol !== "https:"');
    expect(uploadSecurity).toContain("url.username || url.password");
    expect(presign).toContain('error: "Unable to prepare managed upload. Please retry."');
    expect(presign).not.toContain("payload.error ||");
  });
  it("rejects arbitrary attachment storage keys before registering them", () => {
    expect(routers).toContain('import { isValidSupportAttachmentStorageKey } from "./_core/attachmentPolicy"');
    const start = routers.indexOf("addAttachment: protectedProcedure");
    const end = routers.indexOf("uploadPolicy: protectedProcedure", start);
    const registration = routers.slice(start, end);
    expect(registration).toContain("isValidSupportAttachmentStorageKey(input.storageKey)");
    expect(registration).toContain('code: "BAD_REQUEST", message: "Invalid support attachment storage key"');
    expect(registration.indexOf("isValidSupportAttachmentStorageKey")).toBeLessThan(registration.indexOf("addTicketAttachment(ctx.user.id, input)"));
  });

  it("keeps ticket reply failures safe and avoids a second admin reply notification", () => {
    expect(support).toContain("Your reply could not be confirmed. Refresh this ticket before retrying to avoid sending a duplicate.");
    expect(support).toContain("This ticket could not be reopened. Refresh the inbox and try again.");
    expect(support).toContain('selectedTicket.status!=="closed"&&selectedTicket.status!=="resolved"&&<div className="support-reply-box">');
    expect(support).toContain('(selectedTicket.status==="closed"||selectedTicket.status==="resolved")&&<div className="support-closed-note">');
    expect(support).toContain("disabled={!reply.trim()||send.isPending||messages.isLoading||messages.isError}");
    expect(support).toContain('messages.isError?"Refresh conversation to reply":"Send reply"');
    const adminStart = routers.indexOf("replyTicket: adminProcedure");
    const adminEnd = routers.indexOf("reopenTicket: adminProcedure", adminStart);
    const adminReply = routers.slice(adminStart, adminEnd);
    expect(adminReply).toContain("await addTicketMessage(ctx.user.id,input.ticketId,input.body,input.status)");
    expect(adminReply).toContain('body: z.string().trim().min(1).max(20000)');
    expect(adminReply).toContain('throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" })');
    expect(adminReply).not.toContain("await createNotification(");
    expect(routers).toContain("getSupportTicketById(input.ticketId)");
    expect(adminReply).not.toContain("listAllTickets()");
    expect(routers).toContain('throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" })');
  });

  it("keeps ticket reopening authorized, conditional, and notification-safe", () => {
    const start = database.indexOf("export async function reopenSupportTicket");
    const end = database.indexOf("export async function listTicketMessages", start);
    const reopen = database.slice(start, end);
    expect(reopen).toContain('if(!isAdmin && ticket.customerId!==actorId) throw new Error("You do not have access to this ticket")');
    expect(reopen).toContain('if(ticket.status!=="closed" && ticket.status!=="resolved") return {success:true,changed:false,status:ticket.status}');
    expect(reopen).toContain('or(eq(supportTickets.status,"closed"),eq(supportTickets.status,"resolved"))');
    expect(reopen).toContain('const eventKey=`support-ticket:${ticketId}:reopened:${previousUpdatedAt}`');
    expect(reopen).toContain('createNotification(ticket.customerId,"Your support ticket was reopened"');
    expect(reopen).toContain('`${eventKey}:admin:${admin.id}`');
    expect(reopen).toContain('console.error("[Notifications] One or more reopen notices failed after status commit.")');
    expect(reopen).not.toContain("await db.transaction(async tx=>");
  });

  it("checks attachment ownership before listing a customer's ticket conversation", () => {
    const start = routers.indexOf("addAttachment: protectedProcedure");
    const end = routers.indexOf("uploadPolicy: protectedProcedure", start);
    const registration = routers.slice(start, end);
    expect(registration).toContain("addTicketAttachment(ctx.user.id, input)");
    expect(database).toContain("export async function addTicketAttachment(userId:number,input:");
    const attachmentStart = database.indexOf("export async function addTicketAttachment");
    const attachmentEnd = database.indexOf("// Controlled opportunity engine", attachmentStart);
    const attachment = database.slice(attachmentStart, attachmentEnd);
    expect(attachment).toContain("eq(supportTickets.customerId,userId)");
    expect(attachment).toContain('if(!ticket) throw new Error("Ticket not found")');
    expect(attachment).toContain("isValidSupportAttachmentStorageKey(input.storageKey)");
  });

  it("keeps reply persistence serialized and requires reopening resolved or closed tickets", () => {
    const start = database.indexOf("export async function addTicketMessage");
    const end = database.indexOf("export async function reopenSupportTicket", start);
    const lifecycle = database.slice(start, end);
    expect(lifecycle).toContain(".for(\"update\")");
    expect(lifecycle).toContain('if(!isAdmin && (ticket.status==="closed" || ticket.status==="resolved"))');
    expect(lifecycle).toContain("const committed=await db.transaction(async tx=>");
    expect(lifecycle).toContain("support-ticket:${ticketId}:message:${committed.messageId}");
  });

});
