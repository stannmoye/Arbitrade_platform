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


async function runAdminAppearanceInteractionCheck(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(10000);
  const apiRequests = [];
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("request", request => {
    if (request.url().includes("/api/trpc")) apiRequests.push({ method: request.method(), url: request.url() });
  });
  page.on("response", response => {
    if (response.url().includes("/api/trpc")) apiRequests.push({ status: response.status(), url: response.url() });
  });
  const initialAppearance = {
    defaultTheme: "original",
    enabledThemes: [...THEMES],
    customerCanSelect: false,
  };
  let savedAppearance = { ...initialAppearance, enabledThemes: [...initialAppearance.enabledThemes] };
  const mutations = [];
  const checks = [];
  const record = (check, passed, details = {}) => checks.push({
    route: "/ops-console-7f3a",
    routeName: "admin",
    width: 1440,
    theme: "original",
    check,
    passed,
    ...details,
  });

  try {
    await page.route("**/api/trpc*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      const procedurePath = decodeURIComponent(url.pathname.split("/api/trpc/")[1] || "");
      const procedures = procedurePath.split(",").filter(Boolean);
      let envelope = {};
      try {
        const raw = request.method() === "GET"
          ? url.searchParams.get("input")
          : request.postData();
        envelope = raw ? JSON.parse(raw) : {};
      } catch {
        envelope = {};
      }
      const inputAt = index => {
        const item = Array.isArray(envelope) ? envelope[index] : envelope[String(index)];
        return item?.json ?? item?.input?.json ?? envelope?.json ?? envelope?.input?.json ?? {};
      };
      const output = procedures.map((procedure, index) => {
        const input = inputAt(index);
        let data = null;
        if (procedure === "auth.me") {
          data = { id: 9001, email: "stage2-admin@example.test", name: "Stage 2 Admin", role: "admin" };
        } else if (procedure === "appearanceConfig") {
          data = savedAppearance;
        } else if (procedure === "adminOperations.settings") {
          data = { appearance: savedAppearance };
        } else if (procedure === "adminOperations.customers" || procedure === "adminOperations.packagePolicies") {
          data = [];
        } else if (procedure === "adminOperations.autoTradePolicy") {
          data = { globalEnabled: false };
        } else if (procedure === "adminOperations.updateSettings") {
          mutations.push(input);
          if (input?.appearance) {
            savedAppearance = {
              defaultTheme: input.appearance.defaultTheme,
              enabledThemes: [...input.appearance.enabledThemes],
              customerCanSelect: input.appearance.customerCanSelect === true,
            };
          }
          data = { ok: true };
        }
        return { result: { data: { json: data } } };
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(output),
      });
    });

    await page.goto(new URL("/ops-console-7f3a", BASE_URL).href, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    const adminLoaded = await page.getByRole("heading", { name: "Control centre" }).isVisible().catch(() => false);
    record("mock-authenticated-admin-route", adminLoaded, {
      note: "Uses mocked auth.me and tRPC responses; this is client-flow evidence, not live API authentication.",
    });

    if (!adminLoaded) {
      record("admin-appearance-screen-opened", false, {
        error: "Authenticated admin shell did not render from the mock API.",
        apiRequests: apiRequests.slice(0, 12),
        pageErrors,
        bodyText: await page.locator("body").innerText().catch(() => ""),
      });
      return checks;
    }

    await page.getByRole("button", { name: /Platform Configuration/ }).click();
    await page.getByRole("button", { name: /Appearance & Themes/ }).click();
    const appearanceLoaded = await page.getByRole("heading", { name: "Theme management" }).isVisible().catch(() => false);
    record("admin-appearance-screen-opened", appearanceLoaded);
    if (!appearanceLoaded) return checks;

    const previewButtons = page.locator(".arb-theme-preview-option");
    const previewCount = await previewButtons.count();
    const previewButton = page.getByRole("button", { name: /Aurora Modern/ });
    await previewButton.click();
    await page.waitForTimeout(30);
    const previewTheme = await page.evaluate(() => document.documentElement.dataset.arbTheme || "");
    record("admin-theme-preview", previewCount === THEMES.length && previewTheme === "aurora-modern", {
      previewCount,
      previewTheme,
    });

    await page.getByLabel("Default theme").selectOption("clean-light");
    await page.getByRole("checkbox", { name: /Midnight Premium/ }).uncheck();
    await page.getByRole("checkbox", { name: /Allow customers to choose their own theme/ }).check();
    await page.getByRole("button", { name: "Save appearance policy" }).click();
    await page.getByRole("status").filter({ hasText: "Appearance policy saved" }).waitFor({ state: "visible" });

    const saved = mutations.length > 0 &&
      mutations.at(-1)?.appearance?.defaultTheme === "clean-light" &&
      Array.isArray(mutations.at(-1)?.appearance?.enabledThemes) &&
      !mutations.at(-1).appearance.enabledThemes.includes("midnight-premium") &&
      mutations.at(-1).appearance.enabledThemes.includes("clean-light") &&
      mutations.at(-1).appearance.customerCanSelect === true &&
      savedAppearance.defaultTheme === "clean-light" &&
      !savedAppearance.enabledThemes.includes("midnight-premium") &&
      savedAppearance.customerCanSelect === true;
    record("admin-appearance-policy-save-request", saved, {
      mutationCount: mutations.length,
      savedAppearance,
      submittedAppearance: mutations.at(-1)?.appearance ?? null,
    });
    const feedback = (await page.getByRole("status").innerText()).includes("Appearance policy saved") &&
      (await page.getByLabel("Default theme").inputValue()) === "clean-light";
    record("admin-appearance-save-feedback-and-refetch", feedback);
  } catch (error) {
    record("admin-appearance-interaction-unhandled-error", false, {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await page.close();
  }
  return checks;
}

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
          // Measure default-state text contrast separately from the focus-ring
          // check above so focused-control overlays do not distort the audit.
          await page.evaluate(() => {
            const active = document.activeElement;
            if (active instanceof HTMLElement) active.blur();
          });
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
            // Sample settled colors, not interpolated mid-transition values.
            await page.addStyleTag({
              content: "*, *::before, *::after { transition: none !important; animation: none !important; }",
            });
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
                  // WCAG text-contrast criteria exclude inactive controls; their
                  // disabled/busy presentation is handled as a separate state.
                  if (element.matches(":disabled,[aria-disabled='true']") ||
                    element.closest("[aria-disabled='true']")) continue;
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
    const interactionChecks = await runAdminAppearanceInteractionCheck(browser);
    results.push(...interactionChecks);
    failures.push(...interactionChecks.filter(check => !check.passed));
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
      "The admin appearance interaction uses mocked auth.me and tRPC responses; it verifies the client flow and submitted policy only, not live server authorization or database persistence.",
      "Static-client browser smoke tests do not authenticate to the live API or verify customer-role enforcement.",
      "Populated financial-table keyboard scrolling and the full authenticated form/dialog/dropdown/disabled/busy interaction matrix remain outside this static-client run.",
      "The rendered contrast audit covers visible text on the three entry routes and semantic token pairs; human review of screenshots and broader authenticated portal coverage remain required.",
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
