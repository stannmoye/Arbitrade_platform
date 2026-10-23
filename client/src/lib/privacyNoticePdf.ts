import type { PrivacyPolicyDocument } from "../../../shared/privacy";

type PdfLine = { text: string; size: number; bold?: boolean; gapBefore?: number; gapAfter?: number };

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not available"
    : date.toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" });
}

function wrapText(value: string, maxLength: number): string[] {
  const paragraphs = value.replace(/\r\n?/g, "\n").split("\n");
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      if (word.length > maxLength) {
        if (line) lines.push(line);
        line = "";
        for (let offset = 0; offset < word.length; offset += maxLength) {
          const part = word.slice(offset, offset + maxLength);
          if (offset + maxLength < word.length) lines.push(part);
          else line = part;
        }
      } else if (!line) {
        line = word;
      } else if ((line + " " + word).length <= maxLength) {
        line += " " + word;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

// Standard PDF fonts use WinAnsiEncoding. Encode visible Western characters as bytes
// and replace unsupported glyphs instead of producing a malformed PDF.
function winAnsiHex(value: string): string {
  const special: Record<string, number> = {
    "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86,
    "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c,
    "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95,
    "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b,
    "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
  };
  let result = "";
  for (const character of value) {
    const code = special[character] ?? character.codePointAt(0) ?? 63;
    const byte = code >= 0x20 && code <= 0xff && !(code >= 0x7f && code <= 0x9f && !Object.values(special).includes(code))
      ? code
      : 63;
    result += byte.toString(16).padStart(2, "0");
  }
  return result.toUpperCase();
}

export function createPrivacyNoticePdf(policy: PrivacyPolicyDocument): ArrayBuffer {
  const lines: PdfLine[] = [
    { text: policy.title || "Privacy Notice", size: 21, bold: true, gapAfter: 12 },
    { text: "Version " + policy.versionLabel, size: 10, bold: true, gapAfter: 3 },
    { text: "Effective: " + formatDate(policy.effectiveAt), size: 9, gapAfter: 2 },
    { text: "Published: " + formatDate(policy.publishedAt), size: 9, gapAfter: 2 },
    { text: "Responsible organization: " + (policy.controllerName || "Not configured"), size: 9, gapAfter: 2 },
    ...(policy.controllerAddress ? [{ text: "Registered address: " + policy.controllerAddress, size: 9, gapAfter: 2 }] : []),
    { text: "Privacy contact: " + (policy.privacyContact || "Use the authenticated Support Centre"), size: 9, gapAfter: 2 },
    ...(policy.applicableJurisdiction ? [{ text: "Applicable jurisdiction: " + policy.applicableJurisdiction, size: 9, gapAfter: 2 }] : []),
    { text: "", size: 5, gapAfter: 6 },
    { text: "SUMMARY", size: 11, bold: true, gapAfter: 5 },
    { text: policy.summary || "", size: 9.5, gapAfter: 12 },
    ...policy.sections.flatMap((section) => [
      { text: section.title, size: 12, bold: true, gapBefore: 6, gapAfter: 5 },
      { text: section.body, size: 9.5, gapAfter: 10 },
    ]),
  ];

  const pages: string[][] = [[]];
  let y = 786;
  const left = 56;
  const bottom = 66;
  const addRaw = (command: string) => pages[pages.length - 1].push(command);
  const newPage = () => {
    pages.push([]);
    y = 786;
  };

  // A restrained branded header and readable A4 typography keep the download print-friendly.
  addRaw("0.10 0.20 0.32 rg");
  addRaw("BT /F2 9 Tf 56 810 Td <41524249545241444520504C4154464F524D> Tj ET");
  addRaw("0.55 0.61 0.68 RG 0.7 w 56 798 m 539 798 l S");
  for (const item of lines) {
    if (item.gapBefore) y -= item.gapBefore;
    const maxLength = item.size >= 18 ? 48 : item.size >= 12 ? 70 : 91;
    const wrapped = wrapText(item.text, maxLength);
    for (const line of wrapped) {
      const lineHeight = item.size >= 18 ? 27 : item.size >= 12 ? 18 : 13;
      if (y - lineHeight < bottom) {
        newPage();
        addRaw("0.10 0.20 0.32 rg");
        addRaw("BT /F2 9 Tf 56 810 Td <41524249545241444520504C4154464F524D> Tj ET");
        addRaw("0.55 0.61 0.68 RG 0.7 w 56 798 m 539 798 l S");
      }
      if (line) {
        addRaw("0.10 0.20 0.32 rg");
        addRaw("BT /" + (item.bold ? "F2" : "F1") + " " + item.size + " Tf 56 " + y.toFixed(2) + " Td <" + winAnsiHex(line) + "> Tj ET");
      }
      y -= lineHeight;
    }
    y -= item.gapAfter || 0;
  }

  const pageCount = pages.length;
  const objects: string[] = [];
  const addObject = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  addObject("<< /Type /Catalog /Pages 2 0 R >>"); // 1
  addObject("<< /Type /Pages /Kids [" + pages.map((_, i) => (5 + i * 2) + " 0 R").join(" ") + "] /Count " + pageCount + " >>"); // 2
  addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"); // 3
  addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"); // 4

  pages.forEach((commands, index) => {
    const pageNumber = index + 1;
    commands.push("0.45 0.50 0.57 rg");
    commands.push("BT /F1 8 Tf 56 40 Td <506C6174666F726D2050726976616379204E6F74696365> Tj ET");
    commands.push("BT /F1 8 Tf 500 40 Td <" + winAnsiHex("Page " + pageNumber + " of " + pageCount) + "> Tj ET");
    const content = commands.join("\n");
    const pageObject = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents " + (6 + index * 2) + " 0 R >>";
    addObject(pageObject);
    addObject("<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream");
  });
  addObject("<< /Title (" + (policy.title || "Privacy Notice").replace(/[()\\]/g, "\\$&").replace(/[^\x20-\x7E]/g, "?") + ") /Author (Arbitrade Platform) /Subject (Published Privacy Notice, version " + policy.versionLabel.replace(/[^a-zA-Z0-9 ._-]/g, "") + ") >>");

  let pdf = "%PDF-1.4\n%Arbitrade Privacy Notice\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += (index + 1) + " 0 obj\n" + object + "\nendobj\n";
  });
  const xrefOffset = pdf.length;
  pdf += "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";
  for (let index = 1; index <= objects.length; index++) {
    pdf += String(offsets[index]).padStart(10, "0") + " 00000 n \n";
  }
  pdf += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R /Info " + objects.length + " 0 R >>\nstartxref\n" + xrefOffset + "\n%%EOF";
  return new TextEncoder().encode(pdf).buffer as ArrayBuffer;
}
