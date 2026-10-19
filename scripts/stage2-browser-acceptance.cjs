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
                const parseColor = value => {
                  const input = String(value).trim();
                  const hex = input.match(/^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i);
                  if (hex) {
                    let digits = hex[1];
                    if (digits.length === 3 || digits.length === 4) {
                      digits = digits.slice(0, 3).split("").map(channel => channel + channel).join("");
                    } else if (digits.length === 8) {
                      digits = digits.slice(0, 6);
                    }
                    return [0, 2, 4].map(index => Number.parseInt(digits.slice(index, index + 2), 16));
                  }
                  const parts = input.match(/[\d.]+/g);
                  return parts && parts.length >= 3 ? parts.slice(0, 3).map(Number) : null;
                };
                const luminance = rgb => {
                  const linear = rgb.map(channel => {
                    const normalized = channel / 255;
                    return normalized <= 0.04045
                      ? normalized / 12.92
                      : ((normalized + 0.055) / 1.055) ** 2.4;
                  });
                  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
                };
                const contrastRatio = (foreground, background) => {
                  const first = luminance(foreground);
                  const second = luminance(background);
                  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
                };
                const styles = getComputedStyle(root);
                const tokenPairs = [
                  { name: "text-on-canvas", foreground: "--arb-color-text", background: "--arb-color-canvas", minimum: 4.5 },
                  { name: "text-on-surface", foreground: "--arb-color-text", background: "--arb-color-surface", minimum: 4.5 },
                  { name: "soft-text-on-canvas", foreground: "--arb-color-text-soft", background: "--arb-color-canvas", minimum: 4.5 },
                  { name: "muted-text-on-canvas", foreground: "--arb-color-text-muted", background: "--arb-color-canvas", minimum: 4.5 },
                  { name: "focus-ring-on-canvas", foreground: "--arb-focus-ring", background: "--arb-color-canvas", minimum: 3 },
                ];
                const contrastChecks = tokenPairs.map(pair => {
                  const foregroundValue = styles.getPropertyValue(pair.foreground).trim();
                  const backgroundValue = styles.getPropertyValue(pair.background).trim();
                  const foreground = parseColor(foregroundValue);
                  const background = parseColor(backgroundValue);
                  const ratio = foreground && background
                    ? contrastRatio(foreground, background)
                    : null;
                  return {
                    name: pair.name,
                    foregroundToken: pair.foreground,
                    backgroundToken: pair.background,
                    foreground: foregroundValue,
                    background: backgroundValue,
                    ratio: ratio === null ? null : Number(ratio.toFixed(2)),
                    minimum: pair.minimum,
                    passed: ratio !== null && ratio + 1e-6 >= pair.minimum,
                  };
                });
                const parseColorWithAlpha = value => {
                  const parts = String(value).match(/[\d.]+/g);
                  if (!parts || parts.length < 3) return null;
                  const channels = parts.map(Number);
                  return {
                    rgb: channels.slice(0, 3),
                    alpha: channels.length >= 4 ? channels[3] : 1,
                  };
                };
                const solidBackground = element => {
                  let current = element;
                  while (current && current !== document.documentElement.parentElement) {
                    const parsed = parseColorWithAlpha(getComputedStyle(current).backgroundColor);
                    if (parsed && parsed.alpha >= 0.99) {
                      return {
                        rgb: parsed.rgb,
                        value: getComputedStyle(current).backgroundColor,
                        source: current.tagName.toLowerCase(),
                      };
                    }
                    current = current.parentElement;
                  }
                  const fallback = parseColorWithAlpha(styles.getPropertyValue("--arb-color-canvas"));
                  return fallback
                    ? { rgb: fallback.rgb, value: styles.getPropertyValue("--arb-color-canvas").trim(), source: "--arb-color-canvas" }
                    : null;
                };
                const textSamples = [];
                const textFailures = [];
                for (const element of Array.from(document.querySelectorAll("body *"))) {
                  const text = Array.from(element.childNodes)
                    .filter(node => node.nodeType === Node.TEXT_NODE)
                    .map(node => node.textContent || "")
                    .join(" ")
                    .trim();
                  if (!text) continue;
                  const computed = getComputedStyle(element);
                  if (computed.display === "none" || computed.visibility === "hidden" ||
                    Number(computed.opacity) === 0) continue;
                  const rect = element.getBoundingClientRect();
                  if (rect.width <= 0 || rect.height <= 0) continue;
                  const foreground = parseColorWithAlpha(computed.color);
                  const background = solidBackground(element);
                  if (!foreground || !background) continue;
                  const ratio = contrastRatio(foreground.rgb, background.rgb);
                  const fontSize = Number.parseFloat(computed.fontSize) || 16;
                  const fontWeight = Number.parseInt(computed.fontWeight, 10) || 400;
                  const largeText = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
                  const minimum = largeText ? 3 : 4.5;
                  const sample = {
                    text: text.slice(0, 80),
                    tag: element.tagName.toLowerCase(),
                    className: typeof element.className === "string" ? element.className.slice(0, 100) : "",
                    foreground: computed.color,
                    background: background.value,
                    backgroundSource: background.source,
                    ratio: Number(ratio.toFixed(2)),
                    minimum,
                    passed: ratio + 1e-6 >= minimum,
                  };
                  textSamples.push(sample);
                  if (!sample.passed) textFailures.push(sample);
                }
                const renderedTextAudit = {
                  measured: textSamples.length,
                  belowThreshold: textFailures.length,
                  minimumRatio: textSamples.length
                    ? Math.min(...textSamples.map(sample => sample.ratio))
                    : null,
                  failures: textFailures.slice(0, 20),
                };
                return {
                  theme: root.dataset.arbTheme || null,
                  background: getComputedStyle(body).backgroundColor,
                  textColor: getComputedStyle(body).color,
                  viewportWidth: window.innerWidth,
                  documentWidth: root.scrollWidth,
                  contrastChecks,
                  renderedTextAudit,
                };
              });
              const { contrastChecks, renderedTextAudit, ...visualSummary } = visual;
              const themeItem = {
                route: route.path,
                routeName: route.name,
                width,
                theme,
                ...visualSummary,
                passed: visualSummary.theme === theme &&
                  visualSummary.documentWidth <= visualSummary.viewportWidth + 1,
              };
              results.push(themeItem);
              if (!themeItem.passed) failures.push(themeItem);
              const renderedTextItem = {
                route: route.path,
                routeName: route.name,
                width,
                theme,
                check: "rendered-text-contrast",
                ...renderedTextAudit,
                passed: renderedTextAudit.measured > 0 && renderedTextAudit.belowThreshold === 0,
              };
              results.push(renderedTextItem);
              if (!renderedTextItem.passed) failures.push(renderedTextItem);
              for (const check of contrastChecks) {
                const contrastItem = {
                  route: route.path,
                  routeName: route.name,
                  width,
                  theme,
                  check: `contrast:${check.name}`,
                  ...check,
                  passed: check.passed,
                };
                results.push(contrastItem);
                if (!contrastItem.passed) failures.push(contrastItem);
              }
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
