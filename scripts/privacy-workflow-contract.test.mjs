import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

describe("Privacy Centre end-to-end source contracts", () => {
  it("keeps administrator publication and request-review actions behind admin procedures", async () => {
    const router = await read("../server/routers.ts");
    expect(router).toContain("privacyPolicyState: adminProcedure.query");
    expect(router).toContain("savePrivacyPolicyDraft: adminProcedure.input");
    expect(router).toContain("publishPrivacyPolicy: adminProcedure.input");
    expect(router).toContain("reviewAcknowledged: z.literal(true)");
    expect(router).toContain("privacyRequests: adminProcedure.input");
    expect(router).toContain("privacyRequestDetail: adminProcedure.input");
    expect(router).toContain("updatePrivacyRequest: adminProcedure.input");
  });

  it("publishes a single current version and retains prior versions for customer history", async () => {
    const service = await read("../server/privacy.ts");
    expect(service).toContain('where(eq(privacyPolicyVersions.status, "published"))');
    expect(service).toContain('inArray(privacyPolicyVersions.status, ["published", "archived"])');
    expect(service).toContain('set({ status: "archived" }).where(eq(privacyPolicyVersions.status, "published"))');
    expect(service).toContain('status: "published", effectiveAt: now, publishedAt: now, publishedBy: adminId');
    expect(service).toContain('htmlContent: row.htmlContent || ""');
  });

  it("limits customer privacy requests to the signed-in customer's own records", async () => {
    const router = await read("../server/routers.ts");
    const service = await read("../server/privacy.ts");
    expect(router).toContain("Privacy Centre customer views require a customer account.");
    expect(router).toContain("privacyService.listMyPrivacyRequests(ctx.user.id)");
    expect(router).toContain("privacyService.cancelMyPrivacyRequest(ctx.user.id, input.requestId)");
    expect(service).toContain("eq(privacyRequests.userId, userId)");
    expect(service).toContain('if (row.status !== "submitted")');
    expect(service).toContain("canTransitionPrivacyRequest(row.status, input.status)");
  });

  it("renders the published notice and connects customer history, downloads and request actions", async () => {
    const customer = await read("../client/src/components/CustomerPrivacyCenter.tsx");
    expect(customer).toContain("trpc.privacy.currentPolicy.useQuery");
    expect(customer).toContain("trpc.privacy.policyHistory.useQuery");
    expect(customer).toContain("trpc.privacy.myRequests.useQuery");
    expect(customer).toContain("buildPrivacyHtmlDocument(viewedPolicy.htmlContent)");
    expect(customer).toContain("createPrivacyNoticePdf(viewedPolicy)");
    expect(customer).toContain("createRequest.mutateAsync");
    expect(customer).toContain("cancelRequest.mutateAsync");
    expect(customer).toContain("utils.privacy.myRequests.invalidate()");
  });

  it("keeps the admin form recoverable without allowing writes until saved state is available", async () => {
    const admin = await read("../client/src/components/AdminPrivacyManagement.tsx");
    expect(admin).toContain("const editorTouchedFields = useRef(new Set<string>());");
    expect(admin).toContain("if (editorTouched) {");
    expect(admin).not.toContain('<fieldset className="privacy-editor-fieldset" disabled=');
    expect(admin).toContain("disabled={!policyState.data || !canPublish");
    expect(admin).toContain("disabled={!policyState.data || !canPublish || !publicationReviewed");
    expect(admin).toContain('markEditorFieldTouched("htmlContent")');
    expect(admin).toContain("updateRequest.mutateAsync");
  });
});
