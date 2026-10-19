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
  const consoleErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
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
  let failNextSettingsSave = false;
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
    await page.route(/\/api\/trpc(?:\/|$)/, async route => {
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
        } else if (procedure === "adminOperations.pendingSettlements") {
          data = Array.from({ length: 12 }, (_, index) => ({
            id: 7000 + index,
            userId: 8000 + index,
            customerName: `Stage Customer ${index + 1}`,
            customerEmail: `customer${index + 1}@example.test`,
            currency: "USD",
            symbol: "BTC/USD",
            principalMinor: 100000 + index * 100,
            rewardReservedMinor: 2500 + index * 10,
          }));
        } else if (procedure === "adminOperations.ledgerActivity") {
          data = Array.from({ length: 24 }, (_, index) => ({
            id: 9000 + index,
            userId: 8000 + index,
            customerName: `Ledger Customer ${index + 1}`,
            customerEmail: `ledger${index + 1}@example.test`,
            entryType: index % 2 ? "trade_reward" : "principal_reservation",
            amountMinor: index % 2 ? 1250 + index : -(10000 + index * 100),
            currency: "USD",
            withdrawable: index % 2 === 1,
            createdAt: new Date(Date.UTC(2026, 0, 1, 12, index)).toISOString(),
          }));
        } else if (procedure === "adminOperations.currencies") {
          data = [{ code: "USD", scale: 2 }];
        } else if (procedure === "adminOperations.autoTradePolicy") {
          data = { globalEnabled: false };
        } else if (procedure === "adminOperations.updateSettings") {
          if (failNextSettingsSave) {
            failNextSettingsSave = false;
            return {
              error: {
                json: {
                  message: "Simulated appearance save failure",
                  code: -32603,
                  data: {
                    code: "INTERNAL_SERVER_ERROR",
                    httpStatus: 500,
                    path: procedure,
                  },
                },
              },
            };
          }
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
        // SuperJSON omits metadata when the payload needs no special-value annotations.
        // An empty `meta.values` object is not a valid serialized annotation map for this client.
        return { result: { data: { json: data } } };
      });
      apiRequests.push({
        handled: true,
        procedurePath,
        procedures,
        output,
      });
      // Hold the mocked settings save briefly so the acceptance check can
      // observe the real pending/busy UI state before the server response.
      if (procedures.includes("adminOperations.updateSettings")) {
        await new Promise(resolve => setTimeout(resolve, 400));
      }
      try {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          // tRPC v11 httpBatchLink expects a JSON array of response envelopes
          // in the same order as the batched procedure inputs.
          body: JSON.stringify(output),
        });
        apiRequests.push({ fulfilled: true, procedurePath });
      } catch (error) {
        apiRequests.push({
          fulfilled: false,
          procedurePath,
          error: error instanceof Error ? error.message : String(error),
        });
        await route.continue();
      }
    });

    await page.goto(new URL("/ops-console-7f3a", BASE_URL).href, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    // The route initially renders an authentication loading state while the
    // mocked tRPC request resolves. Wait for the authenticated shell instead
    // of asserting synchronously after DOMContentLoaded.
    await page.getByRole("heading", { name: "Control centre" }).waitFor({
      state: "visible",
      timeout: 15000,
    }).catch(() => undefined);
    const adminLoaded = await page.getByRole("heading", { name: "Control centre" }).isVisible().catch(() => false);
    record("mock-authenticated-admin-route", adminLoaded, {
      note: "Uses mocked auth.me and tRPC responses; this is client-flow evidence, not live API authentication.",
    });

    if (!adminLoaded) {
      record("admin-appearance-screen-opened", false, {
        error: "Authenticated admin shell did not render from the mock API.",
        apiRequests: apiRequests.slice(0, 12),
        pageErrors,
        consoleErrors: consoleErrors.slice(0, 12),
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
    const previewThemeLabels = {
      original: /Original Arbitrade/i,
      "midnight-premium": /Midnight Premium/i,
      "clean-light": /Clean Light/i,
      "emerald-finance": /Emerald Finance/i,
      "aurora-modern": /Aurora Modern/i,
    };
    const appearanceScreenshotPaths = [];
    for (const screenshotTheme of THEMES) {
      await page.getByRole("button", { name: previewThemeLabels[screenshotTheme] }).click();
      await page.waitForFunction(expected =>
        document.documentElement.dataset.arbTheme === expected, screenshotTheme);
      const appearanceThemeSurface = await page.evaluate(() => {
        const root = document.documentElement;
        const portalMain = document.querySelector(".admin-portal .portal-main");
        const card = document.querySelector(".arb-appearance-admin .settings-card");
        const heading = card?.querySelector("h2");
        const probe = document.createElement("div");
        probe.style.backgroundColor = "var(--arb-color-canvas)";
        probe.style.color = "var(--arb-color-text)";
        probe.style.setProperty("border-color", "var(--arb-color-surface)");
        document.body.appendChild(probe);
        const expectedCanvas = getComputedStyle(probe).backgroundColor;
        const expectedText = getComputedStyle(probe).color;
        probe.style.backgroundColor = "var(--arb-color-surface)";
        const expectedSurface = getComputedStyle(probe).backgroundColor;
        const actualCanvas = portalMain ? getComputedStyle(portalMain).backgroundColor : null;
        const actualSurface = card ? getComputedStyle(card).backgroundColor : null;
        const actualText = heading ? getComputedStyle(heading).color : null;
        probe.remove();
        return {
          theme: root.dataset.arbTheme,
          expectedCanvas,
          actualCanvas,
          expectedSurface,
          actualSurface,
          expectedText,
          actualText,
          canvasMatches: actualCanvas === expectedCanvas,
          surfaceMatches: actualSurface === expectedSurface,
          textMatches: actualText === expectedText,
        };
      });
      record("admin-appearance-theme-surfaces-follow-selected-palette",
        appearanceThemeSurface.canvasMatches &&
        appearanceThemeSurface.surfaceMatches &&
        appearanceThemeSurface.textMatches,
        { ...appearanceThemeSurface, width: 1440, theme: screenshotTheme });
      await page.evaluate(() => window.scrollTo(0, 0));
      // Move away from nav controls before capture so native title tooltips do not contaminate evidence.
      await page.mouse.move(1, 1);
      await page.waitForTimeout(100);
      const desktopScreenshot = path.join(ARTIFACT_DIR, `admin-appearance-1440-${screenshotTheme}.png`);
      await page.screenshot({ path: desktopScreenshot, fullPage: true, animations: "disabled" });
      appearanceScreenshotPaths.push(desktopScreenshot);

      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => window.scrollTo(0, 0));
      if (screenshotTheme === "original") {
        const menuBounds = await page.locator(".admin-mobile-nav-trigger").boundingBox();
        const appearanceBounds = await page.locator(".arb-theme-selector-title").boundingBox();
        const noOverlap = Boolean(menuBounds && appearanceBounds && (
          menuBounds.x + menuBounds.width <= appearanceBounds.x ||
          appearanceBounds.x + appearanceBounds.width <= menuBounds.x ||
          menuBounds.y + menuBounds.height <= appearanceBounds.y ||
          appearanceBounds.y + appearanceBounds.height <= menuBounds.y
        ));
        record("admin-mobile-menu-does-not-overlap-appearance-label", noOverlap, {
          width: 390,
          menuBounds,
          appearanceBounds,
        });
        const themeSelectBounds = await page.locator(".arb-theme-selector-compact select").boundingBox();
        const themeSelectStyle = await page.locator(".arb-theme-selector-compact select").evaluate(element => {
          const style = getComputedStyle(element);
          return {
            width: style.width,
            minWidth: style.minWidth,
            flex: style.flex,
            flexShrink: style.flexShrink,
            viewportWidth: window.innerWidth,
            parentWidth: element.parentElement?.getBoundingClientRect().width ?? null,
          };
        });
        record("admin-mobile-theme-selector-retains-readable-width", Boolean(
          themeSelectBounds && themeSelectBounds.width >= 195
        ), {
          width: 390,
          themeSelectBounds,
          themeSelectStyle,
        });
        await page.setViewportSize({ width: 320, height: 844 });
        const narrowSelectBounds = await page.locator(".arb-theme-selector-compact select").boundingBox();
        const narrowDocumentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        record("admin-320-theme-selector-fits-without-page-overflow", Boolean(
          narrowSelectBounds && narrowSelectBounds.width >= 180 && narrowDocumentWidth <= 320
        ), {
          width: 320,
          narrowSelectBounds,
          documentWidth: narrowDocumentWidth,
        });
        await page.setViewportSize({ width: 390, height: 844 });
      }
      const selectorLabelColors = await page.locator(".arb-theme-selector-title").evaluate(element => ({
        labelColor: getComputedStyle(element).color,
        headerTextColor: getComputedStyle(document.querySelector(".portal-header .brand-lockup strong")).color,
      }));
      record("admin-mobile-theme-selector-label-contrast",
        selectorLabelColors.labelColor === selectorLabelColors.headerTextColor,
        { width: 390, theme: screenshotTheme, ...selectorLabelColors });
      // Clear hover state before taking the mobile screenshot as well.
      await page.mouse.move(1, 1);
      await page.waitForTimeout(100);
      const mobileScreenshot = path.join(ARTIFACT_DIR, `admin-appearance-390-${screenshotTheme}.png`);
      await page.screenshot({ path: mobileScreenshot, fullPage: true, animations: "disabled" });
      appearanceScreenshotPaths.push(mobileScreenshot);
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    record("admin-appearance-authenticated-panel-screenshots-captured",
      appearanceScreenshotPaths.length === THEMES.length * 2,
      { screenshotCount: appearanceScreenshotPaths.length, screenshots: appearanceScreenshotPaths.map(file => path.basename(file)) });

    const previewButton = page.getByRole("button", { name: /Aurora Modern/ });
    await previewButton.click();
    await page.waitForTimeout(30);
    const previewTheme = await page.evaluate(() => document.documentElement.dataset.arbTheme || "");
    record("admin-theme-preview", previewCount === THEMES.length && previewTheme === "aurora-modern", {
      previewCount,
      previewTheme,
    });

    await page.getByLabel("Default theme").selectOption("clean-light");
    await page.getByRole("checkbox", { name: /Clean Light/ }).uncheck();
    const fallbackDefault = await page.getByLabel("Default theme").inputValue();
    const fallbackOptions = await page.getByLabel("Default theme").locator("option").evaluateAll(options => options.map(option => option.value));
    record("admin-default-removal-falls-back-to-enabled-theme",
      fallbackDefault === "original" && !fallbackOptions.includes("clean-light"),
      { fallbackDefault, fallbackOptions });
    await page.getByRole("checkbox", { name: /Clean Light/ }).check();
    await page.getByLabel("Default theme").selectOption("clean-light");
    await page.getByRole("checkbox", { name: /Midnight Premium/ }).uncheck();
    await page.getByRole("checkbox", { name: /Allow customers to choose their own theme/ }).check();
    await page.getByRole("button", { name: "Save appearance policy" }).click();
    await page.waitForTimeout(60);
    const saveButton = page.getByRole("button", { name: /Saving…|Save appearance policy/ });
    const busySaveText = await saveButton.innerText();
    const busySaveDisabled = await saveButton.isDisabled();
    const busyDefaultDisabled = await page.getByLabel("Default theme").isDisabled();
    const busyThemeDisabled = await page.getByRole("checkbox", { name: /Aurora Modern/ }).isDisabled();
    const busyChoiceDisabled = await page.getByRole("checkbox", { name: /Allow customers to choose their own theme/ }).isDisabled();
    record("admin-appearance-save-busy-controls-disabled",
      busySaveText.includes("Saving") && busySaveDisabled && busyDefaultDisabled && busyThemeDisabled && busyChoiceDisabled,
      { busySaveText, busySaveDisabled, busyDefaultDisabled, busyThemeDisabled, busyChoiceDisabled });
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
    const updateRequestIndex = apiRequests.findIndex(item =>
      item.procedures?.includes("adminOperations.updateSettings"));
    const settingsRefetched = updateRequestIndex >= 0 &&
      apiRequests.slice(updateRequestIndex + 1).some(item =>
        item.procedures?.includes("adminOperations.settings"));
    const feedback = (await page.getByRole("status").filter({ hasText: "Appearance policy saved" }).innerText()).includes("Appearance policy saved") &&
      (await page.getByLabel("Default theme").inputValue()) === "clean-light" &&
      settingsRefetched;
    record("admin-appearance-save-feedback-and-refetch", feedback, {
      settingsRefetched,
      updateRequestIndex,
    });

    // A rejected save must not mutate the mock server's persisted policy or be
    // recorded as a successful mutation; the UI must also leave pending state.
    const persistedBeforeRejectedSave = {
      ...savedAppearance,
      enabledThemes: [...savedAppearance.enabledThemes],
    };
    const successfulMutationCountBeforeRejectedSave = mutations.length;
    failNextSettingsSave = true;
    await page.getByRole("checkbox", { name: /Allow customers to choose their own theme/ }).uncheck();
    await page.getByRole("button", { name: "Save appearance policy" }).click();
    const saveError = page.getByRole("alert").filter({ hasText: "Simulated appearance save failure" });
    await saveError.waitFor({ state: "visible" });
    const errorSaveEnabled = await page.getByRole("button", { name: "Save appearance policy" }).isEnabled();
    const errorDefaultEnabled = await page.getByLabel("Default theme").isEnabled();
    const errorThemeEnabled = await page.getByRole("checkbox", { name: /Aurora Modern/ }).isEnabled();
    const errorChoiceEnabled = await page.getByRole("checkbox", { name: /Allow customers to choose their own theme/ }).isEnabled();
    record("admin-appearance-save-error-feedback-controls-restored",
      await saveError.isVisible() && errorSaveEnabled && errorDefaultEnabled && errorThemeEnabled && errorChoiceEnabled,
      { errorVisible: await saveError.isVisible(), errorSaveEnabled, errorDefaultEnabled, errorThemeEnabled, errorChoiceEnabled });
    const rejectedSaveDidNotPersist =
      JSON.stringify(savedAppearance) === JSON.stringify(persistedBeforeRejectedSave) &&
      mutations.length === successfulMutationCountBeforeRejectedSave &&
      savedAppearance.customerCanSelect === true;
    record("admin-appearance-rejected-save-does-not-persist",
      rejectedSaveDidNotPersist,
      {
        persistedBeforeRejectedSave,
        persistedAfterRejectedSave: savedAppearance,
        successfulMutationCountBeforeRejectedSave,
        successfulMutationCountAfterRejectedSave: mutations.length,
        note: "Checks mocked server state only; live database persistence remains an independent acceptance gate.",
      });

    // Reset the admin route after saving appearance settings so the next mobile navigation
    // check starts from a clean workspace rather than a scrolled settings-card position.
    // Route navigation resets the active settings section, so reopen Appearance & Themes
    // before asserting that its controls have hydrated.
    await page.goto(`${BASE_URL}/ops-console-7f3a`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Control centre" }).waitFor({ state: "visible", timeout: 15000 });
    await page.getByRole("button", { name: /Platform Configuration/ }).click();
    await page.getByRole("button", { name: /Appearance & Themes/ }).click();
    await page.getByRole("heading", { name: "Theme management" }).waitFor({ state: "visible", timeout: 15000 });
    await page.getByLabel("Default theme").waitFor({ state: "visible" });
    await page.getByRole("checkbox", { name: /Allow customers to choose their own theme/ }).waitFor({ state: "visible" });
    await page.waitForFunction(() => {
      const labelled = Array.from(document.querySelectorAll("label"))
        .find(label => label.textContent?.trim().startsWith("Default theme"));
      const select = document.querySelector('select[aria-label="Default theme"]') ||
        labelled?.querySelector("select");
      return select instanceof HTMLSelectElement && !select.disabled;
    });
    const reloadedDefaultTheme = await page.getByLabel("Default theme").inputValue();

    // Exercise the native theme dropdown with keyboard input, not only selectOption().
    const keyboardThemeSelect = page.getByLabel("Default theme");
    await keyboardThemeSelect.focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    const keyboardSelectedTheme = await keyboardThemeSelect.inputValue();
    const keyboardDropdownWorks = keyboardSelectedTheme !== reloadedDefaultTheme;
    await keyboardThemeSelect.selectOption(reloadedDefaultTheme);
    record("admin-default-theme-dropdown-keyboard-navigation",
      keyboardDropdownWorks,
      { initialTheme: reloadedDefaultTheme, keyboardSelectedTheme });

    const reloadedCustomerChoice = await page.getByRole("checkbox", { name: /Allow customers to choose their own theme/ }).isChecked();
    const themeLabelPatterns = {
      original: /Original/i,
      "midnight-premium": /Midnight Premium/i,
      "clean-light": /Clean Light/i,
      "emerald-finance": /Emerald Finance/i,
      "aurora-modern": /Aurora Modern/i,
    };
    const reloadedThemeStates = await Promise.all(THEMES.map(async theme => ({
      theme,
      enabled: await page.getByRole("checkbox", { name: themeLabelPatterns[theme] }).isChecked(),
    })));
    const reloadedEnabledThemes = reloadedThemeStates.filter(item => item.enabled).map(item => item.theme);
    const rejectedSaveReloadPreservesPersistedPolicy =
      reloadedDefaultTheme === persistedBeforeRejectedSave.defaultTheme &&
      reloadedCustomerChoice === persistedBeforeRejectedSave.customerCanSelect &&
      JSON.stringify(reloadedEnabledThemes) === JSON.stringify(persistedBeforeRejectedSave.enabledThemes);
    record("admin-appearance-rejected-save-preserves-persisted-policy-on-reload",
      rejectedSaveReloadPreservesPersistedPolicy,
      {
        reloadedDefaultTheme,
        reloadedCustomerChoice,
        reloadedEnabledThemes,
        expectedPersistedPolicy: persistedBeforeRejectedSave,
        note: "Reload/refetch uses mocked settings storage; live database persistence remains an independent acceptance gate.",
      });

    // Navigate while the desktop quick-action trigger is unobstructed, then resize
    // the populated financial page to mobile width for the keyboard-scroll check.
    const quickActionsTrigger = page.getByRole("button", { name: "Open Quick Actions" });
    const triggerHitTarget = await quickActionsTrigger.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      return {
        visible: rect.width > 0 && rect.height > 0,
        hitTargetMatches: Boolean(hit && (hit === element || element.contains(hit))),
        hitTag: hit?.tagName ?? null,
        hitClass: typeof hit?.className === "string" ? hit.className : null,
        bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
    });
    record("quick-actions-trigger-pointer-hit-target",
      triggerHitTarget.visible && triggerHitTarget.hitTargetMatches,
      triggerHitTarget);
    await quickActionsTrigger.focus();

    const closedDrawerFocusability = await page.locator("#admin-navigation-drawer").evaluate(drawer => ({
      hidden: drawer.getAttribute("aria-hidden") === "true",
      searchTabIndex: drawer.querySelector('input[aria-label="Search actions and destinations"]')?.tabIndex ?? null,
      unintendedTabStops: drawer.querySelectorAll('a[href]:not([tabindex="-1"]):not([aria-disabled="true"]),button:not([tabindex="-1"]):not([disabled]),input:not([tabindex="-1"]):not([disabled]),select:not([tabindex="-1"]):not([disabled]),textarea:not([tabindex="-1"]):not([disabled]),[tabindex]:not([tabindex="-1"]):not([disabled]),[contenteditable="true"]').length,
    }));
    record("quick-actions-closed-drawer-has-no-tab-stops",
      closedDrawerFocusability.hidden &&
      closedDrawerFocusability.searchTabIndex === -1 &&
      closedDrawerFocusability.unintendedTabStops === 0,
      closedDrawerFocusability);

    await page.keyboard.press("Enter");
    const quickActionsDialog = page.getByRole("dialog", { name: "Quick Actions" });
    await page.waitForFunction(() => {
      const drawer = document.querySelector("#admin-navigation-drawer");
      return drawer?.getAttribute("aria-hidden") === "false" &&
        Boolean(drawer?.contains(document.activeElement));
    });
    const dialogSemantics = await quickActionsDialog.evaluate(element => ({
      visible: element.getAttribute("aria-hidden") === "false",
      modal: element.getAttribute("aria-modal"),
      focusInside: element.contains(document.activeElement),
    }));
    const triggerExpandedWhileOpen = await page.locator(".admin-slide-trigger").getAttribute("aria-expanded");
    record("quick-actions-dialog-accessibility-and-focus",
      dialogSemantics.visible && dialogSemantics.modal === "true" &&
      dialogSemantics.focusInside && triggerExpandedWhileOpen === "true",
      { ...dialogSemantics, triggerExpandedWhileOpen });

    const commandSearch = quickActionsDialog.getByRole("textbox", {
      name: "Search actions and destinations",
    });
    await commandSearch.fill("wallet");
    const walletDestinationVisible = await quickActionsDialog.getByRole("button", {
      name: "Wallet & ledger",
    }).isVisible();
    const addCustomerHiddenForWallet = await quickActionsDialog.getByRole("button", {
      name: /Add Customer/,
    }).count() === 0;
    await commandSearch.fill("support");
    const supportCounterVisible = await quickActionsDialog.getByRole("button", {
      name: /Open tickets/,
    }).isVisible();
    const walletDestinationHiddenForSupport = await quickActionsDialog.getByRole("button", {
      name: "Wallet & ledger",
    }).count() === 0;
    await commandSearch.fill("no-such-action-or-destination");
    const noResultsFeedback = await quickActionsDialog.getByRole("status")
      .filter({ hasText: "No matching actions or destinations." }).isVisible();
    await commandSearch.fill("");
    record("quick-actions-search-filters-actions-and-destinations",
      walletDestinationVisible && addCustomerHiddenForWallet &&
      supportCounterVisible && walletDestinationHiddenForSupport && noResultsFeedback,
      {
        walletDestinationVisible,
        addCustomerHiddenForWallet,
        supportCounterVisible,
        walletDestinationHiddenForSupport,
        noResultsFeedback,
      });

    // Dialogs must remain operable when the on-screen keyboard leaves very little
    // vertical space. Exercise the real rendered dialog at a compact phone size.
    await page.setViewportSize({ width: 320, height: 568 });
    const compactDialogLayout = await quickActionsDialog.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const close = element.querySelector('.admin-slide-close');
      const search = element.querySelector('input[aria-label="Search actions and destinations"]');
      const nav = element.querySelector('.admin-slide-nav');
      const navStyle = nav ? getComputedStyle(nav) : null;
      const withinViewport = rect.left >= 0 && rect.top >= 0 &&
        rect.right <= window.innerWidth + 1 && rect.bottom <= window.innerHeight + 1;
      return {
        bounds: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
          width: rect.width, height: rect.height },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        maxHeight: style.maxHeight,
        overflowY: navStyle?.overflowY ?? null,
        navClientHeight: nav instanceof HTMLElement ? nav.clientHeight : null,
        navScrollHeight: nav instanceof HTMLElement ? nav.scrollHeight : null,
        withinViewport,
        closeButtonPresent: close instanceof HTMLElement,
        searchPresent: search instanceof HTMLInputElement,
        documentWidth: document.documentElement.scrollWidth,
      };
    });
    const compactCloseButtonVisible = await quickActionsDialog.locator('.admin-slide-close').isVisible();
    const compactSearchVisible = await commandSearch.isVisible();
    record("quick-actions-dialog-fits-compact-mobile-viewport",
      compactDialogLayout.withinViewport &&
      compactDialogLayout.bounds.width <= 320 &&
      compactDialogLayout.bounds.height <= 568 &&
      compactDialogLayout.overflowY === "auto" &&
      compactDialogLayout.closeButtonPresent &&
      compactDialogLayout.searchPresent &&
      compactCloseButtonVisible &&
      compactSearchVisible &&
      compactDialogLayout.documentWidth <= 320,
      { ...compactDialogLayout, compactCloseButtonVisible, compactSearchVisible });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await quickActionsDialog.evaluate(element => { element.scrollTop = 0; });

    const dialogFocusable = quickActionsDialog.locator(
      'button:not([tabindex="-1"]), input:not([tabindex="-1"])'
    );
    const dialogFocusableCount = await dialogFocusable.count();
    const firstDialogFocusable = dialogFocusable.first();
    const lastDialogFocusable = dialogFocusable.last();
    await firstDialogFocusable.focus();
    await page.keyboard.press("Shift+Tab");
    const reverseFocusWrapped = await lastDialogFocusable.evaluate(element =>
      document.activeElement === element
    );
    await page.keyboard.press("Tab");
    const forwardFocusWrapped = await firstDialogFocusable.evaluate(element =>
      document.activeElement === element
    );
    record("quick-actions-dialog-traps-keyboard-focus",
      dialogFocusableCount >= 2 && reverseFocusWrapped && forwardFocusWrapped,
      { dialogFocusableCount, reverseFocusWrapped, forwardFocusWrapped });

    await page.keyboard.press("Escape");
    await page.waitForFunction(() =>
      document.querySelector("#admin-navigation-drawer")?.getAttribute("aria-hidden") === "true" &&
      document.activeElement === document.querySelector(".admin-slide-trigger")
    );
    const focusRestored = await page.locator(".admin-slide-trigger").evaluate(element =>
      document.activeElement === element
    );
    record("quick-actions-dialog-escape-closes-and-restores-focus", focusRestored, { focusRestored });

    await quickActionsTrigger.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: /Wallet & ledger/ }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: /Wallet & ledger/ }).click();
    await page.getByRole("heading", { name: "Transaction review" }).waitFor({ state: "visible" });
    await page.setViewportSize({ width: 390, height: 844 });

    for (const tableCase of [
      { label: "Trades awaiting manual settlement", check: "populated-settlement-table-keyboard-scroll", minimumRows: 10 },
      { label: "Wallet activity ledger", check: "populated-financial-table-keyboard-scroll", minimumRows: 20 },
    ]) {
      const region = page.getByRole("region", { name: tableCase.label });
      await region.waitFor({ state: "visible" });
      const before = await region.evaluate(element => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        scrollLeft: element.scrollLeft,
        tabIndex: element.tabIndex,
        role: element.getAttribute("role"),
        label: element.getAttribute("aria-label"),
        rows: element.querySelectorAll("tbody tr").length,
      }));
      await region.focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(100);
      const after = await region.evaluate(element => ({
        scrollLeft: element.scrollLeft,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      }));
      const passed = before.rows >= tableCase.minimumRows &&
        before.scrollWidth > before.clientWidth &&
        before.tabIndex === 0 &&
        before.role === "region" &&
        before.label === tableCase.label &&
        after.scrollLeft > before.scrollLeft &&
        after.documentWidth <= after.viewportWidth + 1;
      record(tableCase.check, passed, {
        tableLabel: tableCase.label,
        rows: before.rows,
        clientWidth: before.clientWidth,
        scrollWidth: before.scrollWidth,
        scrollLeftBefore: before.scrollLeft,
        scrollLeftAfter: after.scrollLeft,
        tabIndex: before.tabIndex,
        role: before.role,
        accessibleName: before.label,
        documentWidth: after.documentWidth,
        viewportWidth: after.viewportWidth,
        note: "Uses mocked administrator and ledger data; verifies the rendered table's keyboard scrolling and containment, not live ledger authorization or persistence.",
      });
    }
  } catch (error) {
    record("admin-appearance-interaction-unhandled-error", false, {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await page.close();
  }
  return checks;
}

async function runCustomerAuthFormInteractionCheck(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(10000);
  const checks = [];
  const pageErrors = [];
  let registerRequests = 0;
  page.on("pageerror", error => pageErrors.push(error.message));
  const record = (check, passed, details = {}) => checks.push({
    route: "/customer",
    routeName: "customer",
    width: 390,
    check,
    passed,
    ...details,
  });

  try {
    await page.route("**/api/customer/register", async route => {
      registerRequests += 1;
      // Keep the request pending long enough to observe the actual busy state.
      await new Promise(resolve => setTimeout(resolve, 450));
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Simulated registration failure" }),
      });
    });
    await page.goto(new URL("/customer", BASE_URL).href, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.getByRole("heading", { name: "Create your customer account" }).waitFor({
      state: "visible",
      timeout: 15000,
    });

    const firstName = page.getByLabel("First name");
    const lastName = page.getByLabel("Last name");
    const email = page.getByLabel("Email address");
    const password = page.getByLabel("Password");
    const submit = page.getByRole("button", { name: /Register customer account/ });
    const fieldsFound = await Promise.all([
      firstName.isVisible(),
      lastName.isVisible(),
      email.isVisible(),
      password.isVisible(),
    ]);
    const fieldSemantics = {
      firstNameRequired: await firstName.getAttribute("required") !== null,
      lastNameRequired: await lastName.getAttribute("required") !== null,
      emailRequired: await email.getAttribute("required") !== null,
      emailType: await email.getAttribute("type"),
      passwordRequired: await password.getAttribute("required") !== null,
      passwordMinLength: await password.getAttribute("minlength"),
    };

    await submit.click();
    const validationAlert = page.getByRole("alert");
    await validationAlert.waitFor({ state: "visible" });
    const validationText = await validationAlert.innerText();
    const invalidStates = await Promise.all(
      [firstName, lastName, email, password].map(async field =>
        await field.getAttribute("aria-invalid") === "true"
      ),
    );
    record("customer-registration-required-fields-validation", 
      fieldsFound.every(Boolean) &&
      fieldSemantics.firstNameRequired &&
      fieldSemantics.lastNameRequired &&
      fieldSemantics.emailRequired &&
      fieldSemantics.emailType === "email" &&
      fieldSemantics.passwordRequired &&
      fieldSemantics.passwordMinLength === "10" &&
      invalidStates.every(Boolean) &&
      /first and last name/i.test(validationText) &&
      registerRequests === 0,
      {
        fieldsFound,
        fieldSemantics,
        invalidStates,
        validationText,
        registerRequests,
      },
    );

    await firstName.fill("Jordan");
    await lastName.fill("Davis");
    await email.fill("jordan.davis@example.test");
    await password.fill("StageTwoSecurePass123");
    const validStates = await Promise.all(
      [firstName, lastName, email, password].map(async field =>
        await field.getAttribute("aria-invalid") !== "true"
      ),
    );
    await submit.click();
    const busyButton = page.getByRole("button", { name: /Working/ });
    await busyButton.waitFor({ state: "visible" });
    const busyDisabled = await busyButton.isDisabled();
    const busyAria = await busyButton.getAttribute("aria-busy");
    const errorAlert = page.getByRole("alert").filter({ hasText: "Simulated registration failure" });
    await errorAlert.waitFor({ state: "visible" });
    const restoredButton = page.getByRole("button", { name: /Register customer account/ });
    await page.waitForFunction(() => {
      const button = document.querySelector(".auth-primary");
      return button instanceof HTMLButtonElement && !button.disabled && button.getAttribute("aria-busy") === "false";
    });
    const errorRole = await errorAlert.getAttribute("role");
    const errorLive = await errorAlert.getAttribute("aria-live");
    const describedBy = await restoredButton.getAttribute("aria-describedby");
    record("customer-registration-busy-and-error-recovery",
      validStates.every(Boolean) &&
      busyDisabled &&
      busyAria === "true" &&
      await restoredButton.isEnabled() &&
      errorRole === "alert" &&
      errorLive === "assertive" &&
      describedBy === "customer-auth-error" &&
      registerRequests === 1 &&
      pageErrors.length === 0,
      {
        validStates,
        busyDisabled,
        busyAria,
        errorRole,
        errorLive,
        describedBy,
        registerRequests,
        pageErrors,
      },
    );
  } catch (error) {
    record("customer-registration-form-interaction-completes", false, {
      error: error instanceof Error ? error.message : String(error),
      registerRequests,
      pageErrors,
    });
  } finally {
    await page.close();
  }
  return checks;
}

async function runCustomerThemePolicyInteractionCheck(browser) {
  const checks = [];
  const scenarios = [
    {
      name: "customer-choice-disabled",
      policy: { defaultTheme: "clean-light", enabledThemes: ["clean-light", "aurora-modern"], customerCanSelect: false },
      expectedEditable: false,
    },
    {
      name: "customer-choice-enabled",
      policy: { defaultTheme: "clean-light", enabledThemes: ["clean-light", "aurora-modern"], customerCanSelect: true },
      expectedEditable: true,
    },
  ];

  for (const scenario of scenarios) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(10000);
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    const apiRequests = [];
    try {
      await page.addInitScript((storedTheme) => {
        try {
          if (storedTheme) localStorage.setItem("arbitrade-theme", storedTheme);
          else localStorage.removeItem("arbitrade-theme");
        } catch {}
      }, scenario.expectedEditable ? null : "aurora-modern");
      await page.route(/\/api\/trpc(?:\/|$)/, async route => {
        const request = route.request();
        const url = new URL(request.url());
        const procedurePath = decodeURIComponent(url.pathname.split("/api/trpc/")[1] || "");
        const procedures = procedurePath.split(",").filter(Boolean);
        let envelope = {};
        try {
          const raw = request.method() === "GET" ? url.searchParams.get("input") : request.postData();
          envelope = raw ? JSON.parse(raw) : {};
        } catch {
          envelope = {};
        }
        const inputAt = index => {
          const item = Array.isArray(envelope) ? envelope[index] : envelope[String(index)];
          return item?.json ?? item?.input?.json ?? envelope?.json ?? envelope?.input?.json ?? {};
        };
        const output = procedures.map((procedure, index) => {
          let data = null;
          if (procedure === "auth.me") {
            data = { id: 9002, email: "stage2-customer@example.test", name: "Stage 2 Customer", role: "customer" };
          } else if (procedure === "appearanceConfig") {
            data = scenario.policy;
          } else if (procedure.endsWith(".logout")) {
            data = { success: true };
          } else if (procedure.endsWith(".settings") || procedure.endsWith(".branding")) {
            data = {};
          } else if (procedure.startsWith("customer.") && /\.(balances|opportunities|trades|notifications|tickets|soundSettings)$/.test(procedure)) {
            data = [];
          }
          return { result: { data: { json: data } } };
        });
        apiRequests.push({ procedures, method: request.method() });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(output),
        });
      });

      await page.goto(new URL("/customer", BASE_URL).href, { waitUntil: "domcontentloaded", timeout: 30000 });
      const selector = page.locator('section[aria-label="Appearance settings"]');
      await selector.waitFor({ state: "visible", timeout: 15000 });
      const select = selector.locator("select");
      const editable = await select.count() === 1;
      let options = [];
      let selectedTheme = null;
      let persistedTheme = null;
      let appliedTheme = null;
      if (editable) {
        options = await select.locator("option").evaluateAll(items => items.map(item => item.value));
        if (scenario.expectedEditable) {
          await select.selectOption("aurora-modern");
          await page.waitForFunction(() => document.documentElement.dataset.arbTheme === "aurora-modern");
          selectedTheme = await page.evaluate(() => document.documentElement.dataset.arbTheme || null);
          persistedTheme = await page.evaluate(() => localStorage.getItem("arbitrade-theme"));
        }
      }
      appliedTheme = await page.evaluate(() => document.documentElement.dataset.arbTheme || null);
      const correctEditability = editable === scenario.expectedEditable;
      const correctDisabledFallback = scenario.expectedEditable || appliedTheme === "clean-light";
      const correctOptions = !scenario.expectedEditable ||
        (options.length === 2 && options.includes("clean-light") && options.includes("aurora-modern") &&
          !options.includes("original") && !options.includes("midnight-premium") && !options.includes("emerald-finance"));
      const correctSelection = !scenario.expectedEditable ||
        (selectedTheme === "aurora-modern" && persistedTheme === "aurora-modern");
      const passed = correctEditability && correctDisabledFallback && correctOptions && correctSelection && pageErrors.length === 0;

      // The customer navigation drawer must be inert while closed and must
      // preserve a complete keyboard focus loop when open.
      if (scenario.name === "customer-choice-disabled") {
        const trigger = page.getByRole("button", { name: "Open customer navigation" });
        const drawer = page.locator("#customer-navigation-drawer");
        const focusableSelector = 'a[href]:not([tabindex="-1"]):not([aria-disabled="true"]),button:not([tabindex="-1"]):not([disabled]),input:not([tabindex="-1"]):not([disabled]),select:not([tabindex="-1"]):not([disabled]),textarea:not([tabindex="-1"]):not([disabled]),[tabindex]:not([tabindex="-1"]):not([disabled]),[contenteditable="true"]';
        const closedState = await drawer.evaluate((element, selector) => ({
          hidden: element.getAttribute("aria-hidden") === "true",
          searchTabIndex: element.querySelector('input[aria-label="Search customer pages and resources"]')?.tabIndex ?? null,
          focusableCount: element.querySelectorAll(selector).length,
        }), focusableSelector);
        const closedDrawerSafe = closedState.hidden &&
          closedState.searchTabIndex === -1 &&
          closedState.focusableCount === 0;
        checks.push({
          route: "/customer",
          routeName: "customer",
          width: 1440,
          theme: scenario.policy.defaultTheme,
          check: "customer-navigation-closed-drawer-has-no-tab-stops",
          passed: closedDrawerSafe,
          ...closedState,
          note: "Counts links, buttons, form controls, explicit tab stops, and editable content while the drawer is closed.",
        });

        await trigger.focus();
        await page.keyboard.press("Enter");
        await page.waitForFunction(() => {
          const element = document.querySelector("#customer-navigation-drawer");
          return element?.getAttribute("aria-hidden") === "false" &&
            Boolean(element.contains(document.activeElement));
        });
        const customerSearch = drawer.getByRole("textbox", { name: "Search customer pages and resources" });
        await customerSearch.fill("wallet");
        const walletSearchVisible = await drawer.getByRole("button", { name: /Wallet/ }).isVisible();
        const dashboardHiddenForWallet = await drawer.getByRole("button", { name: /Dashboard/ }).count() === 0;
        checks.push({
          route: "/customer",
          routeName: "customer",
          width: 1440,
          theme: scenario.policy.defaultTheme,
          check: "customer-navigation-search-filters-destinations",
          passed: walletSearchVisible && dashboardHiddenForWallet,
          walletSearchVisible,
          dashboardHiddenForWallet,
          note: "Verifies customer navigation search filters destinations in the mocked customer session.",
        });

        await customerSearch.fill("no-such-customer-destination-xyz");
        const emptySearchStatus = drawer.getByRole("status");
        await emptySearchStatus.waitFor({ state: "visible" });
        const emptySearchText = await emptySearchStatus.innerText();
        const emptySearchLiveMode = await emptySearchStatus.getAttribute("aria-live");
        const emptySearchAnnounced = /No pages or resources match/.test(emptySearchText) &&
          emptySearchLiveMode === "polite";
        checks.push({
          route: "/customer",
          routeName: "customer",
          width: 1440,
          theme: scenario.policy.defaultTheme,
          check: "customer-navigation-empty-search-announced",
          passed: emptySearchAnnounced,
          emptySearchText,
          emptySearchLiveMode,
          note: "Checks the empty-result message is exposed as a polite live status for assistive technology.",
        });

        await customerSearch.fill("");
        await drawer.getByRole("button", { name: /Dashboard/ }).waitFor({ state: "visible" });
        await drawer.evaluate((element, selector) => element.querySelectorAll(selector)[0]?.focus(), focusableSelector);
        await page.keyboard.press("Shift+Tab");
        const focusTrapWorks = await drawer.evaluate((element, selector) => {
          const focusable = Array.from(element.querySelectorAll(selector));
          return focusable.length > 1 && document.activeElement === focusable[focusable.length - 1];
        }, focusableSelector);
        checks.push({
          route: "/customer",
          routeName: "customer",
          width: 1440,
          theme: scenario.policy.defaultTheme,
          check: "customer-navigation-focus-trap-wraps-backward",
          passed: focusTrapWorks,
          focusTrapWorks,
          note: "Verifies Shift+Tab from the first drawer control wraps to the last focusable control.",
        });

        await page.keyboard.press("Tab");
        const forwardFocusTrapWorks = await drawer.evaluate((element, selector) => {
          const focusable = Array.from(element.querySelectorAll(selector));
          return focusable.length > 1 && document.activeElement === focusable[0];
        }, focusableSelector);
        checks.push({
          route: "/customer",
          routeName: "customer",
          width: 1440,
          theme: scenario.policy.defaultTheme,
          check: "customer-navigation-focus-trap-wraps-forward",
          passed: forwardFocusTrapWorks,
          forwardFocusTrapWorks,
          note: "Verifies Tab from the last drawer control wraps to the first focusable control.",
        });

        await page.keyboard.press("Escape");
        await page.waitForFunction(() => {
          const element = document.querySelector("#customer-navigation-drawer");
          return element?.getAttribute("aria-hidden") === "true" &&
            document.activeElement?.getAttribute("aria-label") === "Open customer navigation";
        });
        const focusRestored = await trigger.evaluate(element => document.activeElement === element);
        checks.push({
          route: "/customer",
          routeName: "customer",
          width: 1440,
          theme: scenario.policy.defaultTheme,
          check: "customer-navigation-escape-restores-trigger-focus",
          passed: focusRestored,
          focusRestored,
        });
      }

      checks.push({
        route: "/customer",
        routeName: "customer",
        width: 1440,
        theme: scenario.policy.defaultTheme,
        check: `customer-theme-policy-${scenario.name}`,
        passed,
        expectedEditable: scenario.expectedEditable,
        editable,
        options,
        selectedTheme,
        persistedTheme,
        appliedTheme,
        staleStoredThemeIgnored: scenario.expectedEditable || appliedTheme === "clean-light",
        pageErrors,
        apiProcedures: [...new Set(apiRequests.flatMap(item => item.procedures))],
        note: "Uses mocked customer auth and appearanceConfig; proves the client policy UI and local preference behavior, not live server authorization or database persistence.",
      });
    } catch (error) {
      checks.push({
        route: "/customer",
        routeName: "customer",
        width: 1440,
        theme: scenario.policy.defaultTheme,
        check: `customer-theme-policy-${scenario.name}`,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
        pageErrors,
        apiProcedures: [...new Set(apiRequests.flatMap(item => item.procedures))],
      });
    } finally {
      await page.close();
    }
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

          if (route.name === "gateway" && width <= 360) {
            const headingWord = await page.evaluate(() => {
              const heading = document.querySelector(".portal-gateway .gateway-card h1");
              if (!heading) return { found: false, rectCount: 0, fontSize: null, text: null };
              const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
              let node;
              while ((node = walker.nextNode())) {
                const text = node.textContent || "";
                const start = text.toLowerCase().indexOf("workspace");
                if (start < 0) continue;
                const range = document.createRange();
                range.setStart(node, start);
                range.setEnd(node, start + "workspace".length);
                return {
                  found: true,
                  rectCount: range.getClientRects().length,
                  fontSize: getComputedStyle(heading).fontSize,
                  text: heading.textContent?.trim() || "",
                };
              }
              return { found: false, rectCount: 0, fontSize: getComputedStyle(heading).fontSize, text: heading.textContent?.trim() || "" };
            });
            const headingItem = {
              route: route.path,
              routeName: route.name,
              width,
              check: "gateway-heading-word-not-split",
              ...headingWord,
              passed: headingWord.found && headingWord.rectCount === 1,
            };
            results.push(headingItem);
            if (!headingItem.passed) failures.push(headingItem);
          }

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
    const customerFormChecks = await runCustomerAuthFormInteractionCheck(browser);
    results.push(...customerFormChecks);
    failures.push(...customerFormChecks.filter(check => !check.passed));
    const customerPolicyChecks = await runCustomerThemePolicyInteractionCheck(browser);
    results.push(...customerPolicyChecks);
    failures.push(...customerPolicyChecks.filter(check => !check.passed));
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
      "Customer theme-choice enabled/disabled checks use mocked auth.me and appearanceConfig responses; they verify selector visibility, allow-list options, applied theme, and local preference only, not live server authorization or database persistence.",
      "Customer registration form checks use a mocked rejected registration response; they verify client-side required-field validation and busy/error recovery, not live signup authorization or persistence.",
      "Static-client browser smoke tests do not authenticate to the live API or verify customer-role enforcement.",
      "Keyboard scrolling is exercised on populated mocked administrator settlement and wallet-ledger tables; live ledger data/authorization and the full authenticated form/dialog/dropdown/disabled/busy interaction matrix remain outside this static-client run.",
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
