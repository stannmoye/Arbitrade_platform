import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const databaseSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const adminUiSource = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const mutationStart = databaseSource.indexOf("export async function updateOpportunityPackagePolicies");
const mutationEnd = databaseSource.indexOf("\nasync function listMissedOpportunities", mutationStart);
const mutationSource = databaseSource.slice(mutationStart, mutationEnd);

describe("Trading package-policy versioning", () => {
  it("requires an admin reason and forwards it to the policy mutation", () => {
    expect(routerSource).toContain("reason: z.string().trim().min(10).max(500)");
    expect(routerSource).toContain("updateOpportunityPackagePolicies(ctx.user.id, input.policies, input.reason)");
    expect(adminUiSource).toContain("window.prompt(\"Reason for this package-policy change (10–500 characters):\")");
    expect(adminUiSource).toContain("reason:normalizedReason");
  });

  it("locks policy rows and atomically versions and audits changed values", () => {
    expect(mutationSource).toContain("db.transaction");
    expect(mutationSource).toContain('.limit(1).for("update")');
    expect(mutationSource).toContain("if(!changedFields.length) continue;");
    expect(mutationSource).toContain("policyVersion:nextVersion");
    expect(mutationSource).toContain("assertExactlyOneAffectedRow");
    expect(mutationSource).toContain("v5AuditEvents");
    expect(mutationSource).toContain("reason:changeReason");
    expect(mutationSource).toContain("changedFields,old:oldValues,new:newValues");
    expect(mutationSource).not.toContain("onDuplicateKeyUpdate({set:values})");
  });
  it("requires a valid reason in the Trade Settings package-policy editor", () => {
    const start = adminUiSource.indexOf("function AdminPackages(");
    expect(start).toBeGreaterThanOrEqual(0);
    const end = adminUiSource.indexOf("\nfunction ", start + 1);
    expect(end).toBeGreaterThan(start);
    const editor = adminUiSource.slice(start, end);
    expect(editor).toContain('window.prompt("Reason for this package-policy change (10–500 characters):")');
    expect(editor).toContain("normalizedReason.length<10||normalizedReason.length>500");
    expect(editor).toContain("save.mutate({reason:normalizedReason,policies:draft.map");
  });

});
