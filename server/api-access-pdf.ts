/**
 * Minimal dependency-free PDF writer for text-only account reports.
 * Input is treated as plain text; unsupported glyphs are replaced rather than
 * interpreted as PDF syntax. Keep generated report content customer-scoped.
 */
function pdfText(value: unknown): string {
  return String(value ?? "")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .slice(0, 180);
}

export function createTextPdf(lines: string[]): Buffer {
  const safeLines = lines.length ? lines : ["No report data is available."];
  const pages: string[][] = [];
  for (let i = 0; i < safeLines.length; i += 48) pages.push(safeLines.slice(i, i + 48));
  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  const pageRefs: number[] = [];
  pages.forEach((pageLines, index) => {
    const pageId = 4 + index * 2;
    const contentId = pageId + 1;
    pageRefs.push(pageId);
    const stream = [
      "BT",
      "/F1 9 Tf",
      "50 790 Td",
      ...pageLines.flatMap((line, lineIndex) => lineIndex === 0
        ? [`(${pdfText(line)}) Tj`]
        : ["0 -15 Td", `(${pdfText(line)}) Tj`]),
      "ET",
    ].join("\n");
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`;
  });
  objects[2] = `<< /Type /Pages /Kids [${pageRefs.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`;
  let output = "%PDF-1.4\n%ArbitradeReport\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(output, "ascii");
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(output, "ascii");
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) output += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(output, "ascii");
}
