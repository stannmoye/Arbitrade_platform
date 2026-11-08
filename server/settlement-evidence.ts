import crypto from "node:crypto";

export const SETTLEMENT_EVIDENCE_MAX_BYTES = 25_000_000;
export const SETTLEMENT_EVIDENCE_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/csv",
  "text/plain",
] as const;
export const SETTLEMENT_EVIDENCE_TYPES = ["document", "statement", "screenshot", "transaction_receipt", "other"] as const;
export type SettlementEvidenceType = typeof SETTLEMENT_EVIDENCE_TYPES[number];
export type SettlementEvidenceMimeType = typeof SETTLEMENT_EVIDENCE_MIME_TYPES[number];

export function isValidSettlementEvidenceReference(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,159}$/.test(value.trim());
}

export function sanitizeSettlementEvidenceFilename(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_").slice(-120) || "evidence";
}

export function settlementEvidenceStorageKey(tradeId: number, filename: string, nonce = crypto.randomBytes(24).toString("hex")): string {
  if (!Number.isSafeInteger(tradeId) || tradeId < 1 || !/^[a-f0-9]{48}$/.test(nonce)) throw new Error("Invalid settlement evidence storage identity");
  return `settlement-evidence/${tradeId}/${nonce}-${sanitizeSettlementEvidenceFilename(filename)}`;
}

export function isValidSettlementEvidenceStorageKey(value: string, tradeId?: number): boolean {
  const tradePart = tradeId === undefined ? "[1-9][0-9]*" : String(tradeId);
  return new RegExp(`^settlement-evidence/${tradePart}/[a-f0-9]{48}-[A-Za-z0-9._-]{1,120}$`).test(value);
}

function isUtf8Text(buffer: Buffer): boolean {
  if (buffer.includes(0)) return false;
  return Buffer.from(buffer.toString("utf8"), "utf8").equals(buffer);
}

export function detectSettlementEvidenceMime(buffer: Buffer): SettlementEvidenceMimeType | null {
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-" ) return "application/pdf";
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return "image/jpeg";
  return isUtf8Text(buffer) ? "text/plain" : null;
}

export function validateSettlementEvidenceUpload(input: {
  fileName: string;
  declaredMimeType: string;
  sizeBytes: number;
  content: Buffer;
}): { mimeType: SettlementEvidenceMimeType; sha256: string } {
  const fileName = input.fileName.trim();
  if (!fileName || fileName.length > 255 || /[\x00-\x1f\x7f]/.test(fileName)) throw new Error("Invalid settlement evidence filename");
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > SETTLEMENT_EVIDENCE_MAX_BYTES) throw new Error("Settlement evidence exceeds the maximum allowed size");
  if (!Buffer.isBuffer(input.content) || input.content.length !== input.sizeBytes || input.content.length < 1) throw new Error("Settlement evidence content is missing or has an invalid size");
  const declared = input.declaredMimeType.trim().toLowerCase().split(";", 1)[0];
  if (!(SETTLEMENT_EVIDENCE_MIME_TYPES as readonly string[]).includes(declared)) throw new Error("Settlement evidence file type is not allowed");
  const detected = detectSettlementEvidenceMime(input.content);
  if (!detected || (declared === "text/csv" ? detected !== "text/plain" : detected !== declared)) throw new Error("Settlement evidence content does not match its declared file type");
  return { mimeType: declared === "text/csv" ? "text/csv" : detected, sha256: crypto.createHash("sha256").update(input.content).digest("hex") };
}
