import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const server = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
const uploadSecurity = readFileSync(new URL("./support-upload-security.ts", import.meta.url), "utf8");

const supportStart = app.indexOf("function CustomerSupportCenter(");
const supportEnd = app.indexOf("\nfunction ", supportStart + 10);
const support = app.slice(supportStart, supportEnd);
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

  it("only returns safe HTTPS presigned URLs and avoids forwarding provider errors", () => {
    expect(presign).toContain("getSafePresignedUploadUrl(payload.url)");
    expect(uploadSecurity).toContain('url.protocol !== "https:"');
    expect(uploadSecurity).toContain("url.username || url.password");
    expect(presign).toContain('error: "Unable to prepare managed upload. Please retry."');
    expect(presign).not.toContain("payload.error ||");
  });
});
