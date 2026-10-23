/**
 * Wrap administrator-authored notice markup in a restricted, script-free document.
 * The sandbox and CSP permit inline HTML/CSS styling but block scripts, forms,
 * nested frames, network connections and external resource loads.
 */
const NOTICE_CSP = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'\">";

export function buildPrivacyHtmlDocument(content: string): string {
  const source = (content || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<(iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(iframe|object|embed|form)\b[^>]*\/?>/gi, "")
    .replace(/<meta\b(?=[^>]*http-equiv\s*=\s*["']?refresh)[^>]*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src|action)\s*=\s*(["']?)\s*javascript:[^"'\s>]+\2/gi, '$1="#"');
  if (/<html[\s>]/i.test(source)) {
    if (/<head[\s>]/i.test(source)) return source.replace(/<head([^>]*)>/i, (match) => match + NOTICE_CSP + '<meta name="viewport" content="width=device-width, initial-scale=1">');
    return source.replace(/<html([^>]*)>/i, (match) => match + "<head>" + NOTICE_CSP + '<meta name="viewport" content="width=device-width, initial-scale=1"></head>');
  }
  return '<!doctype html><html><head><meta charset="utf-8">' + NOTICE_CSP +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<style>html{color-scheme:light}body{margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;line-height:1.6;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%;border-collapse:collapse}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style>' +
    '</head><body>' + source + '</body></html>';
}
