/**
 * Compact transport for the fixed 1,811-entry company catalogue selection.
 * A bitset keeps bulk admin mutations small enough for restrictive hosting proxies
 * while the server still applies the entire selection in one audited transaction.
 */
export const COMPANY_CATALOGUE_SELECTION_SIZE = 1811;
const BITSET_BYTES = Math.ceil(COMPANY_CATALOGUE_SELECTION_SIZE / 8);
const BASE64_LENGTH = Math.ceil(BITSET_BYTES / 3) * 4;

export function encodeCompanyCatalogueSelection(ids: readonly string[]): string {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > COMPANY_CATALOGUE_SELECTION_SIZE) {
    throw new Error("Select between 1 and 1,811 companies.");
  }
  const bytes = new Uint8Array(BITSET_BYTES);
  const seen = new Set<number>();
  for (const id of ids) {
    const match = /^logo-brand-(\d{4})$/.exec(id);
    const number = match ? Number(match[1]) : NaN;
    if (!Number.isInteger(number) || number < 1 || number > COMPANY_CATALOGUE_SELECTION_SIZE) {
      throw new Error("The selection contains an invalid company ID.");
    }
    if (seen.has(number)) continue;
    seen.add(number);
    const index = number - 1;
    bytes[index >> 3] = bytes[index >> 3]! | (1 << (index & 7));
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeCompanyCatalogueSelection(bitmap: string): string[] {
  if (typeof bitmap !== "string" || bitmap.length !== BASE64_LENGTH || !/^[A-Za-z0-9+/]+=$/.test(bitmap)) {
    throw new Error("The company selection payload is invalid.");
  }
  let bytes: Uint8Array;
  try {
    const binary = atob(bitmap);
    bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch {
    throw new Error("The company selection payload is invalid.");
  }
  if (bytes.length !== BITSET_BYTES) throw new Error("The company selection payload has an invalid size.");
  const usedBitsInLastByte = COMPANY_CATALOGUE_SELECTION_SIZE & 7;
  if (usedBitsInLastByte && (bytes[BITSET_BYTES - 1]! >> usedBitsInLastByte) !== 0) {
    throw new Error("The company selection payload contains out-of-range IDs.");
  }
  const ids: string[] = [];
  for (let index = 0; index < COMPANY_CATALOGUE_SELECTION_SIZE; index++) {
    if ((bytes[index >> 3]! & (1 << (index & 7))) !== 0) {
      ids.push("logo-brand-" + String(index + 1).padStart(4, "0"));
    }
  }
  if (!ids.length) throw new Error("Select at least one company.");
  return ids;
}
