export type OpportunityCsvOffer = {
  symbol: string;
  venueFrom: string;
  venueTo: string;
  currency: "USD" | "EUR" | "GBP" | "BTC" | "ETH";
  minimumMinor: number;
  expectedRewardBps: number;
  durationSeconds: number;
  sourceReference: string;
  reviewNotes: string;
};

const CURRENCIES = new Set<OpportunityCsvOffer["currency"]>(["USD", "EUR", "GBP", "BTC", "ETH"]);
const MAX_ROWS = 5000;

function parseCsvRecords(csv: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const input = csv.replace(/^\uFEFF/, "");

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"') {
      if (cell.length > 0) throw new Error("CSV contains a quote in an unquoted field.");
      quoted = true;
    } else if (character === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      cell = "";
      if (row.some((value) => value.length > 0)) records.push(row);
      row = [];
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) records.push(row);
  return records;
}

function requiredIndex(headers: string[], aliases: string[], label: string): number {
  const matching = headers.flatMap((header, index) => aliases.includes(header) ? [index] : []);
  if (matching.length !== 1) throw new Error(`CSV must contain exactly one ${label} column.`);
  return matching[0]!;
}

function positiveInteger(value: string, rowNumber: number, field: string, minimum: number, maximum: number): number {
  if (!/^\d+$/.test(value)) throw new Error(`CSV row ${rowNumber}: ${field} must be a whole number.`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new Error(`CSV row ${rowNumber}: ${field} must be from ${minimum} through ${maximum}.`);
  }
  return number;
}

export function parseOpportunityCsv(csv: string): OpportunityCsvOffer[] {
  const records = parseCsvRecords(csv);
  if (records.length < 2) throw new Error("CSV must include a header and at least one offer row.");

  const headers = records[0]!.map((header) => header.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const columns = {
    symbol: requiredIndex(headers, ["symbol", "asset"], "symbol/asset"),
    venueFrom: requiredIndex(headers, ["venuefrom", "openingvenue", "from"], "venueFrom/openingVenue/from"),
    venueTo: requiredIndex(headers, ["venueto", "closingvenue", "to"], "venueTo/closingVenue/to"),
    currency: requiredIndex(headers, ["currency"], "currency"),
    minimumMinor: requiredIndex(headers, ["minimumminor", "minimuminvestmentminor"], "minimumMinor"),
    expectedRewardBps: requiredIndex(headers, ["expectedrewardbps", "rewardbps"], "expectedRewardBps"),
    durationSeconds: requiredIndex(headers, ["durationseconds", "duration"], "durationSeconds"),
    sourceReference: requiredIndex(headers, ["sourcereference", "evidencereference"], "sourceReference/evidenceReference"),
    reviewNotes: requiredIndex(headers, ["reviewnotes", "reviewnote", "reviewreason"], "reviewNotes/reviewReason"),
  };
  const rows = records.slice(1);
  if (rows.length > MAX_ROWS) throw new Error(`A single CSV import cannot exceed ${MAX_ROWS.toLocaleString()} offer rows.`);

  return rows.map((row, index) => {
    const rowNumber = index + 2;
    if (row.length !== headers.length) throw new Error(`CSV row ${rowNumber}: field count does not match the header.`);
    const symbol = row[columns.symbol]!.trim();
    const venueFrom = row[columns.venueFrom]!.trim();
    const venueTo = row[columns.venueTo]!.trim();
    const currency = row[columns.currency]!.trim().toUpperCase();
    const sourceReference = row[columns.sourceReference]!.trim();
    const reviewNotes = row[columns.reviewNotes]!.trim();
    if (!symbol || symbol.length > 40) throw new Error(`CSV row ${rowNumber}: symbol must contain 1–40 characters.`);
    if (!venueFrom || venueFrom.length > 80) throw new Error(`CSV row ${rowNumber}: venueFrom must contain 1–80 characters.`);
    if (!venueTo || venueTo.length > 80) throw new Error(`CSV row ${rowNumber}: venueTo must contain 1–80 characters.`);
    if (!CURRENCIES.has(currency as OpportunityCsvOffer["currency"])) throw new Error(`CSV row ${rowNumber}: currency is not supported.`);
    if (!sourceReference || sourceReference.length > 160) throw new Error(`CSV row ${rowNumber}: source reference must contain 1–160 characters.`);
    if (!reviewNotes || reviewNotes.length > 2000) throw new Error(`CSV row ${rowNumber}: review notes must contain 1–2,000 characters.`);

    return {
      symbol,
      venueFrom,
      venueTo,
      currency: currency as OpportunityCsvOffer["currency"],
      minimumMinor: positiveInteger(row[columns.minimumMinor]!, rowNumber, "minimumMinor", 1, Number.MAX_SAFE_INTEGER),
      expectedRewardBps: positiveInteger(row[columns.expectedRewardBps]!, rowNumber, "expectedRewardBps", 1, 5000),
      durationSeconds: positiveInteger(row[columns.durationSeconds]!, rowNumber, "durationSeconds", 10, 86400),
      sourceReference,
      reviewNotes,
    };
  });
}
