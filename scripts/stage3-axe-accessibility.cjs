/* Stage 3 diagnostic accessibility scan.
 * Runs axe-core against the static preview for every supported theme and route.
 * Results are diagnostic evidence until findings are reviewed; this does not
 * replace keyboard-only, screen-reader, or authenticated staging acceptance.
 */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const axe = require("axe-core");

const BASE_URL = process.env.STAGE2_BASE_URL || "http://127.0.0.1:4173";
const ROUTES = [
  { path: "/", name: "gateway" },
  { path: "/customer", name: "customer" },
  { path: "/ops-console-7f3a", name: "admin" },
];
const THEMES = [
  "original",
  "midnight-premium",
  "clean-light",
  "emerald-finance",
  "aurora-modern",
];
const OUT_DIR = path.resolve("artifacts/stage2-browser");
fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const scans = [];
  try {
    for (const route of ROUTES) {
      for (const theme of THEMES) {
        const page = await browser.newPage({
          viewport: { width: 1440, height: 1000 },
          reducedMotion: "reduce",
        });
        const pageErrors = [];
        page.on("pageerror", error => pageErrors.push(error.message));
        try {
          await page.addInitScript(value => {
            document.documentElement.dataset.arbTheme = value;
          }, theme);
          const response = await page.goto(new URL(route.path, BASE_URL).href, {
            waitUntil: "domcontentloaded",
            timeout: 20000,
          });
          await page.waitForTimeout(400);
          // The application may apply its stored/default theme after init scripts;
          // force the requested selector again so each theme gets an actual scan.
          await page.evaluate(value => {
            document.documentElement.dataset.arbTheme = value;
          }, theme);
          await page.waitForTimeout(100);
          await page.addScriptTag({ content: axe.source });
          const results = await page.evaluate(async () => {
            return await window.axe.run(document, {
              runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"],
              },
            });
          });
          scans.push({
            route: route.path,
            routeName: route.name,
            theme,
            url: page.url(),
            httpStatus: response ? response.status() : null,
            title: await page.title(),
            violations: results.violations.map(item => ({
              id: item.id,
              impact: item.impact,
              help: item.help,
              helpUrl: item.helpUrl,
              nodeCount: item.nodes.length,
              nodes: item.nodes.slice(0, 20).map(node => ({
                target: node.target,
                failureSummary: node.failureSummary,
              })),
            })),
            violationCount: results.violations.length,
            incompleteCount: results.incomplete.length,
            pageErrors,
          });
        } catch (error) {
          scans.push({
            route: route.path,
            routeName: route.name,
            theme,
            scanError: error instanceof Error ? error.message : String(error),
            pageErrors,
          });
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "ci-gate-no-violations",
    standards: ["WCAG 2.0 A/AA", "WCAG 2.1 A/AA", "WCAG 2.2 AA", "axe best-practice"],
    routes: ROUTES,
    themes: THEMES,
    scanCount: scans.length,
    scanErrors: scans.filter(scan => scan.scanError).length,
    totalViolations: scans.reduce((sum, scan) => sum + (scan.violationCount || 0), 0),
    byImpact: scans.reduce((summary, scan) => {
      for (const violation of scan.violations || []) {
        summary[violation.impact || "unknown"] = (summary[violation.impact || "unknown"] || 0) + 1;
      }
      return summary;
    }, {}),
    scans,
    limitation: "Static preview only. Findings are diagnostic and do not prove live authorization, persistence, or assistive-technology acceptance.",
  };
  const output = path.join(OUT_DIR, "axe-accessibility-report.json");
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    report: output,
    scanCount: report.scanCount,
    scanErrors: report.scanErrors,
    totalViolations: report.totalViolations,
    byImpact: report.byImpact,
  }, null, 2));
  if (report.scanErrors > 0 || report.totalViolations > 0) process.exitCode = 1;
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
