import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  detectSettlementEvidenceMime,
  isValidSettlementEvidenceStorageKey,
  validateSettlementEvidenceUpload,
} from "./settlement-evidence";

const database = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0108_settlement_evidence_records.sql", import.meta.url), "utf8");

describe("settlement evidence security", () => {
  it("detects supported file signatures and hashes validated content", () => {
    expect(detectSettlementEvidenceMime(Buffer.from("%PDF-1.7\n"))).toBe("application/pdf");
    expect(detectSettlementEvidenceMime(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe("image/png");
    const content = Buffer.from("verified statement\n");
    const result = validateSettlementEvidenceUpload({
      fileName: "statement.txt",
      declaredMimeType: "text/plain",
      sizeBytes: content.length,
      content,
    });
    expect(result.mimeType).toBe("text/plain");
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects MIME/content mismatches and cross-trade storage keys", () => {
    expect(() => validateSettlementEvidenceUpload({ fileName: "receipt.pdf", declaredMimeType: "application/pdf", sizeBytes: 4, content: Buffer.from("nope") })).toThrow(/does not match/);
    const key = "settlement-evidence/42/" + "a".repeat(48) + "-receipt.pdf";
    expect(isValidSettlementEvidenceStorageKey(key, 42)).toBe(true);
    expect(isValidSettlementEvidenceStorageKey(key, 43)).toBe(false);
  });

  it("requires approved evidence and records immutable evidence history before confirmation", () => {
    expect(database).toContain("evidence.verificationStatus!==\"approved\"");
    expect(database).toContain('action:"settlement_confirmed"');
    expect(database).toContain("settlementEvidenceAuditEvents");
    expect(router).toContain("reviewSettlementEvidence");
    expect(router).toContain("evidenceId: z.number().int().positive()");
  });

  it("uses additive tables with uniqueness and no destructive migration statements", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `settlement_evidence_records`");
    expect(migration).toContain("UNIQUE KEY `settlement_evidence_trade_reference_uq`");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `settlement_evidence_audit_events`");
    expect(migration).not.toMatch(/^\s*(DROP|DELETE|UPDATE)\b/im);
  });
});
