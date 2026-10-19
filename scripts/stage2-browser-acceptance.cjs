/* Stage 2 browser acceptance smoke matrix.
 * Runs against the built client in Chromium. The report and screenshots are
 * diagnostic evidence; any viewport overflow or failed route load fails CI.
 */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const BASE_URL = process.env.STAGE2_BASE_URL || "http://127.0.0.1:4173";
const WIDTHS = [320, 360, 390, 430, 480, 768, 1024, 1280, 1440, 1920];
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
const ARTIFACT_DIR = path.resolve("artifacts/stage2-browser");
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const failures = [];

  try {
    for (const route of ROUTES) {
      for (const width of WIDTHS) {
        const page = await browser.newPage({
          viewport: { width, height: 900 },
          deviceScaleFactor: 1,
        });
        page.setDefaultTimeout(15000);
        const pageErrors = [];
        page.on("pageerror", error => pageErrors.push(error.message));

        try {
          const response = await page.goto(new URL(route.path, BASE_URL).href, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });
          await page.locator("#root").waitFor({ state: "attached" });
          await page.waitForTimeout(350);

          const dimensions = await page.evaluate(() => ({
            viewportWidth: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            rootWidth: document.querySelector("#root")?.scrollWidth ?? 0,
            hasRenderedContent: Boolean(document.querySelector("#root")?.childElementCount),
            title: document.title,
          }));

          const overflow = dimensions.documentWidth > dimensions.viewportWidth + 1;
          await page.keyboard.press("Tab");
          const focusItem = await page.evaluate(() => {
            const element = document.activeElement;
            if (!element || element === document.body || element === document.documentElement) {
              return { found: false, visible: false, focusStyle: false, tag: null };
            }
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            const visible = rect.width > 0 && rect.height > 0 &&
              rect.bottom > 0 && rect.right > 0 &&
              rect.top < window.innerHeight && rect.left < window.innerWidth;
            const focusStyle = (style.outlineStyle !== "none" &&
              Number.parseFloat(style.outlineWidth) > 0) || style.boxShadow !== "none";
            return { found: true, visible, focusStyle, tag: element.tagName.toLowerCase(),
              outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth,
              boxShadow: style.boxShadow };
          });
          const focusResult = {
            route: route.path,
            routeName: route.name,
            width,
            check: "keyboard-focus-visible",
            ...focusItem,
            passed: focusItem.found && focusItem.visible && focusItem.focusStyle,
          };
          results.push(focusResult);
          if (!focusResult.passed) failures.push(focusResult);
          const ok = Boolean(response && response.status() < 500) &&
            dimensions.hasRenderedContent && !overflow && pageErrors.length === 0;
          const item = {
            route: route.path,
            routeName: route.name,
            width,
            theme: "runtime-default",
            httpStatus: response?.status() ?? null,
            ...dimensions,
            pageErrors,
            passed: ok,
          };
          results.push(item);
          if (!ok) failures.push(item);

          // Keep a compact set of visual artifacts for mobile and desktop.
          if (width === 320 || width === 1440) {
            await page.screenshot({
              path: path.join(ARTIFACT_DIR, `${route.name}-${width}-default.png`),
              fullPage: true,
              animations: "disabled",
            });
          }

          // Exercise each theme's CSS selector in the actual browser. This is a
          // visual-token smoke check, not a substitute for authenticated admin
          // interactions or a human WCAG contrast review.
          {
            for (const theme of THEMES) {
              await page.evaluate(value => {
                document.documentElement.dataset.arbTheme = value;
                document.documentElement.classList.toggle("dark", value !== "clean-light");
                document.documentElement.style.colorScheme = value === "clean-light" ? "light" : "dark";
              }, theme);
              await page.waitForTimeout(80);
              const visual = await page.evaluate(() => {
                const root = document.documentElement;
                const body = document.body;
                return {
                  theme: root.dataset.arbTheme || null,
                  background: getComputedStyle(body).backgroundColor,
                  textColor: getComputedStyle(body).color,
                  viewportWidth: window.innerWidth,
                  documentWidth: root.scrollWidth,
                };
              });
              const themeItem = {
                route: route.path,
                routeName: route.name,
                width,
                theme,
                ...visual,
                passed: visual.theme === theme && visual.documentWidth <= visual.viewportWidth + 1,
              };
              results.push(themeItem);
              if (!themeItem.passed) failures.push(themeItem);
              if (width === 320 || width === 1440) {
                await page.screenshot({
                  path: path.join(ARTIFACT_DIR, `${route.name}-${width}-${theme}.png`),
                  fullPage: true,
                  animations: "disabled",
                });
              }
            }
          }
        } catch (error) {
          const item = {
            route: route.path,
            routeName: route.name,
            width,
            passed: false,
            error: error instanceof Error ? error.message : String(error),
            pageErrors,
          };
          results.push(item);
          failures.push(item);
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
    baseUrl: BASE_URL,
    widths: WIDTHS,
    routes: ROUTES,
    themes: THEMES,
    checks: results.length,
    failures: failures.length,
    passed: results.length - failures.length,
    results,
    failureDetails: failures,
    limitations: [
      "Static-client browser smoke tests do not authenticate to the live API.",
      "Theme attribute overrides validate rendered CSS selection, not the administrator save flow.",
      "Rendered WCAG contrast still requires explicit contrast measurements and review.",
    ],
  };
  fs.writeFileSync(path.join(ARTIFACT_DIR, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    checks: report.checks,
    passed: report.passed,
    failures: report.failures,
    report: path.join(ARTIFACT_DIR, "report.json"),
  }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
