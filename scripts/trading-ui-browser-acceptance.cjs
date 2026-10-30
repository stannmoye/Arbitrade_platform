const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("playwright");

/**
 * Non-production Trading browser acceptance against a running Arbitrade deployment.
 * Uses real application APIs and existing authenticated browser storage states.
 * No API routes are intercepted and no financial mutations are submitted.
 *
 * Required environment:
 *   TRADING_ACCEPTANCE_BASE_URL
 *   TRADING_ACCEPTANCE_ENVIRONMENT=non-production (required safety acknowledgement)
 *   TRADING_CUSTOMER_STORAGE_STATE (seeded and automatically eligible)
 *   TRADING_UNQUALIFIED_CUSTOMER_STORAGE_STATE (seeded with no qualifying manual admin credit)
 *   TRADING_ADMIN_STORAGE_STATE
 *   TRADING_ACCEPTANCE_CUSTOMER_EMAIL (eligible customer shown in the admin directory)
 *
 * Uses real application APIs only. In the explicitly isolated non-production environment it
 * temporarily changes one bounded admin policy value to prove save/reload persistence, then
 * restores and verifies the original value. No financial mutations are submitted.
 */
async function main() {
  const baseURL = process.env.TRADING_ACCEPTANCE_BASE_URL;
  const environment = process.env.TRADING_ACCEPTANCE_ENVIRONMENT;
  const customerState = process.env.TRADING_CUSTOMER_STORAGE_STATE;
  const unqualifiedCustomerState = process.env.TRADING_UNQUALIFIED_CUSTOMER_STORAGE_STATE;
  const adminState = process.env.TRADING_ADMIN_STORAGE_STATE;
  const acceptanceCustomerEmail = process.env.TRADING_ACCEPTANCE_CUSTOMER_EMAIL;

  assert.equal(environment, "non-production",
    "Set TRADING_ACCEPTANCE_ENVIRONMENT=non-production only for an isolated acceptance deployment.");

  for (const [name, value] of Object.entries({
    TRADING_ACCEPTANCE_BASE_URL: baseURL,
    TRADING_CUSTOMER_STORAGE_STATE: customerState,
    TRADING_UNQUALIFIED_CUSTOMER_STORAGE_STATE: unqualifiedCustomerState,
    TRADING_ADMIN_STORAGE_STATE: adminState,
    TRADING_ACCEPTANCE_CUSTOMER_EMAIL: acceptanceCustomerEmail,
  })) {
    assert.ok(value, `${name} must be set to run Trading browser acceptance.`);
  }
  assert.ok(fs.existsSync(customerState), "Eligible customer storage state file must exist.");
  assert.ok(fs.existsSync(unqualifiedCustomerState), "Unqualified customer storage state file must exist.");
  assert.ok(fs.existsSync(adminState), "Administrator storage state file must exist.");
  assert.match(acceptanceCustomerEmail, /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    "TRADING_ACCEPTANCE_CUSTOMER_EMAIL must identify the seeded eligible customer in the admin directory.");

  let parsedBaseURL;
  try {
    parsedBaseURL = new URL(baseURL);
  } catch {
    assert.fail("TRADING_ACCEPTANCE_BASE_URL must be an absolute HTTP(S) URL.");
  }
  assert.ok(["http:", "https:"].includes(parsedBaseURL.protocol),
    "TRADING_ACCEPTANCE_BASE_URL must use HTTP or HTTPS.");
  assert.equal(parsedBaseURL.username, "", "Acceptance URL must not embed credentials.");
  assert.equal(parsedBaseURL.password, "", "Acceptance URL must not embed credentials.");

  for (const [label, statePath] of [
    ["Eligible customer", customerState],
    ["Unqualified customer", unqualifiedCustomerState],
    ["Administrator", adminState],
  ]) {
    let state;
    try {
      state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    } catch {
      assert.fail(`${label} storage state must be readable JSON.`);
    }
    assert.ok(state && Array.isArray(state.cookies) && Array.isArray(state.origins),
      `${label} storage state must use the Playwright storageState format.`);
  }

  const browser = await chromium.launch({ headless: true });
  const failures = [];
  const results = [];
  try {
    const customerContext = await browser.newContext({ storageState: customerState });
    const customerPage = await customerContext.newPage();
    const eligibilityResponses = [];
    const extractTrpcData = (payload) => payload?.result?.data?.json ?? payload?.result?.data;
    const summarizeEligibility = (payload) => {
      const data = extractTrpcData(payload);
      if (!data || typeof data !== "object") return undefined;
      return {
        eligible: data.eligible,
        status: data.status,
        qualifyingDepositUsdMinor: data.qualifyingDepositUsdMinor,
        dailyOpportunityAllowance: data.dailyOpportunityAllowance,
        currentPackage: data.currentPackage ? {
          name: data.currentPackage.name,
          durationMonths: data.currentPackage.durationMonths,
          opportunitiesPerDay: data.currentPackage.opportunitiesPerDay,
        } : null,
        nextPackage: data.nextPackage ? {
          name: data.nextPackage.name,
          amountNeededUsdMinor: data.nextPackage.amountNeededUsdMinor,
          durationMonths: data.nextPackage.durationMonths,
          additionalDailyOpportunities: data.nextPackage.additionalDailyOpportunities,
        } : null,
      };
    };
    customerPage.on("response", async (response) => {
      if (response.url().includes("/api/trpc/customer.tradingEligibility")) {
        let payload;
        try {
          payload = await response.json();
        } catch {
          payload = undefined;
        }
        eligibilityResponses.push({
          status: response.status(),
          url: response.url(),
          hasTrpcError: Boolean(payload?.error),
          hasTrpcResult: Boolean(payload?.result?.data),
          data: summarizeEligibility(payload),
        });
      }
    });

    await customerPage.goto(baseURL, { waitUntil: "domcontentloaded" });
    const tradingNav = customerPage.getByRole("button", { name: /^trading$/i }).or(customerPage.getByRole("link", { name: /^trading$/i })).first();
    if (await tradingNav.count()) await tradingNav.click();
    // "Your Trading Journey" is an eyebrow label, not a heading; the actual h2 is "Package progress".
    await customerPage.getByRole("heading", { name: /package progress/i }).waitFor({ timeout: 20_000 });
    await customerPage.getByText(/total daily opportunity allowance/i).waitFor({ timeout: 20_000 });
    await customerPage.getByText(/PACKAGE ACTIVE|NO PACKAGE ASSIGNED/i).waitFor({ timeout: 20_000 });

    const bodyText = await customerPage.locator("body").innerText();
    assert.match(bodyText, /total daily opportunity allowance/i);
    assert.match(bodyText, /PACKAGE ACTIVE|NO PACKAGE ASSIGNED/i,
      "Customer must show the server-derived assigned or not-yet-qualified state.");

    const actionableLabels = await customerPage
      .locator("button, a, [role='button'], input[type='submit']")
      .evaluateAll((elements) => elements.map((element) => {
        const inputValue = element instanceof HTMLInputElement ? element.value : "";
        return [
          element.getAttribute("aria-label"),
          element.getAttribute("title"),
          element.textContent,
          inputValue,
        ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      }).filter(Boolean));
    const actionableText = actionableLabels.join("\n");
    assert.doesNotMatch(actionableText,
      /(?:activate|subscribe|purchase|buy|browse|explore|select|choose|manage)\s+(?:(?:a|all|available)\s+)?(?:packages?|tiers?)|(?:view|compare|see)\s+(?:all|available)\s+(?:packages?|tiers?)|(?:packages?|tiers?)\s+(?:activation|subscription|purchase|management|catalog(?:ue)?|selector)/i,
      "Customer must not have package browsing, purchasing, selection, or activation controls.");
    assert.doesNotMatch(actionableText,
      /(?:trading|opportunit(?:y|ies)|auto[\s-]?trade)\s*(?:on|off)/i,
      "Customer must not control the server-managed Trading engine.");
    assert.ok(!actionableLabels.some((label) =>
      /^(?:(?:trading\s+)?packages?|(?:trading\s+)?tiers?|all\s+(?:packages?|tiers?))$/i.test(label)),
      "Customer must not have a standalone package/tier catalogue navigation entry.");

    const tierCardCount = await customerPage.locator(".trading-tier-card").count();
    assert.ok(tierCardCount <= 2,
      `Customer may see the active tier and one next milestone only; found ${tierCardCount} tier cards.`);
    assert.doesNotMatch(bodyText, /activate package|subscribe to package|purchase package/i,
      "Customer UI must not offer package activation or purchase.");
    assert.ok(eligibilityResponses.length > 0,
      "Customer eligibility must be loaded from the real tRPC API.");
    assert.ok(eligibilityResponses.every((response) =>
      response.status >= 200 && response.status < 300 && !response.hasTrpcError && response.hasTrpcResult),
      "Customer eligibility tRPC responses must contain successful result data, not only HTTP 2xx.");
    const eligibilityData = [...eligibilityResponses].reverse().find((response) => response.data)?.data;
    assert.ok(eligibilityData, "Real customer eligibility API data must include the eligibility contract.");
    assert.equal(eligibilityData.status, "eligible",
      "TRADING_CUSTOMER_STORAGE_STATE must be an automatically qualified customer.");
    assert.equal(eligibilityData.eligible, true,
      "The eligible customer storage state must resolve to server-derived eligibility.");
    assert.ok(eligibilityData.currentPackage,
      "An eligible customer must have an automatically assigned current package.");
    assert.ok(eligibilityData.dailyOpportunityAllowance > 0,
      "The assigned tiers must contribute a positive cumulative daily allowance.");
    assert.equal(eligibilityData.eligible, eligibilityData.status === "eligible",
      "Eligibility boolean and status must agree.");
    assert.ok(Number.isSafeInteger(eligibilityData.qualifyingDepositUsdMinor) &&
      eligibilityData.qualifyingDepositUsdMinor >= 0,
      "Qualifying USD amount must be a non-negative safe integer in minor units.");
    assert.ok(Number.isSafeInteger(eligibilityData.dailyOpportunityAllowance) &&
      eligibilityData.dailyOpportunityAllowance >= 0,
      "Cumulative daily opportunity allowance must be a non-negative safe integer.");
    if (eligibilityData.currentPackage) {
      assert.ok(typeof eligibilityData.currentPackage.name === "string" && eligibilityData.currentPackage.name.length > 0);
      assert.ok(Number.isSafeInteger(eligibilityData.currentPackage.opportunitiesPerDay) &&
        eligibilityData.currentPackage.opportunitiesPerDay >= 0);
    }
    if (eligibilityData.nextPackage) {
      assert.ok(Number.isSafeInteger(eligibilityData.nextPackage.amountNeededUsdMinor) &&
        eligibilityData.nextPackage.amountNeededUsdMinor >= 0);
      assert.ok(Number.isSafeInteger(eligibilityData.nextPackage.additionalDailyOpportunities) &&
        eligibilityData.nextPackage.additionalDailyOpportunities >= 0);
    }
    const renderedAllowance = await customerPage.locator(".trading-total-allowance-value").innerText();
    assert.equal(Number(renderedAllowance), eligibilityData.dailyOpportunityAllowance,
      "Customer-visible daily allowance must match the real API's cumulative entitlement total.");
    assert.doesNotMatch(bodyText, /retry needed|couldn.t load package details/i,
      "Customer eligibility must not remain in an API-error state.");

    // Confirm a customer cannot read the administrator-only package catalogue API.
    const customerAdminProbe = await customerPage.evaluate(async () => {
      const response = await fetch("/api/trpc/admin.tradingPackages", {
        method: "GET",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      let payload;
      try {
        payload = await response.json();
      } catch {
        payload = undefined;
      }
      return {
        status: response.status,
        errorCode: payload?.error?.data?.code ?? payload?.error?.json?.data?.code,
        hasResult: payload?.result?.data !== undefined,
      };
    });
    assert.ok(
      customerAdminProbe.status === 403 || customerAdminProbe.errorCode === "FORBIDDEN",
      `Administrator-only package API must reject customer role; received HTTP ${customerAdminProbe.status}, code ${customerAdminProbe.errorCode ?? "none"}.`,
    );
    assert.equal(customerAdminProbe.hasResult, false,
      "Forbidden customer request must not return the admin package catalogue.");

    // Exercise the real refresh control against the unmocked application API.
    const refreshButton = customerPage.getByRole("button", { name: /refresh trading package progress/i });
    assert.equal(await refreshButton.count(), 1, "Customer must have a single explicit refresh control.");
    const refreshedResponsePromise = customerPage.waitForResponse(
      (response) => response.url().includes("/api/trpc/customer.tradingEligibility"),
      { timeout: 20_000 },
    );
    await refreshButton.click();
    const refreshedResponse = await refreshedResponsePromise;
    let refreshedPayload;
    try {
      refreshedPayload = await refreshedResponse.json();
    } catch {
      refreshedPayload = undefined;
    }
    assert.ok(
      refreshedResponse.status() >= 200 &&
      refreshedResponse.status() < 300 &&
      !refreshedPayload?.error &&
      refreshedPayload?.result?.data !== undefined,
      "Manual refresh must complete through the real eligibility API and return result data.",
    );
    await customerPage.waitForFunction(() => {
      const button = document.querySelector('button[aria-label="Refresh Trading package progress"]');
      return Boolean(button && !button.disabled);
    }, { timeout: 20_000 });
    const refreshedBodyText = await customerPage.locator("body").innerText();
    assert.match(refreshedBodyText, /total daily opportunity allowance/i);
    assert.doesNotMatch(refreshedBodyText, /retry needed|couldn.t load package details/i,
      "A successful refresh must not leave the customer in an API-error state.");

    // Exercise a real browser network outage, not a mocked API response, then recover.
    await customerContext.setOffline(true);
    await refreshButton.click();
    const eligibilityErrorAlert = customerPage.getByRole("alert")
      .filter({ hasText: /couldn.t load package details/i });
    await eligibilityErrorAlert.waitFor({ state: "visible", timeout: 45_000 });
    await customerPage.getByText(/RETRY NEEDED/i).waitFor({ state: "visible", timeout: 10_000 });
    const offlineBodyText = await customerPage.locator("body").innerText();
    assert.doesNotMatch(offlineBodyText, /PACKAGE ACTIVE/i,
      "A failed refresh must not present the cached package status as freshly confirmed.");
    assert.equal(await customerPage.locator(".trading-tier-card").count(), 0,
      "A failed eligibility refresh must not leave stale package cards displayed as current.");

    await customerContext.setOffline(false);
    await customerPage.waitForFunction(() => {
      const button = document.querySelector('button[aria-label="Refresh Trading package progress"]');
      return Boolean(button && !button.disabled);
    }, { timeout: 30_000 });
    const recoveryResponsePromise = customerPage.waitForResponse(
      (response) => response.url().includes("/api/trpc/customer.tradingEligibility"),
      { timeout: 20_000 },
    );
    await refreshButton.click();
    const recoveryResponse = await recoveryResponsePromise;
    let recoveryPayload;
    try {
      recoveryPayload = await recoveryResponse.json();
    } catch {
      recoveryPayload = undefined;
    }
    assert.ok(recoveryResponse.status() >= 200 && recoveryResponse.status() < 300 &&
      !recoveryPayload?.error && extractTrpcData(recoveryPayload) !== undefined,
      "Eligibility must recover from the network outage through the real application API.");
    await eligibilityErrorAlert.waitFor({ state: "hidden", timeout: 20_000 });
    const recoveryData = summarizeEligibility(recoveryPayload);
    assert.ok(recoveryData && ["eligible", "not_eligible"].includes(recoveryData.status));
    assert.equal(Number(await customerPage.locator(".trading-total-allowance-value").innerText()),
      recoveryData.dailyOpportunityAllowance,
      "Recovered customer allowance must again match current API data.");

    // Exercise the customer page at desktop and mobile widths without changing persisted data.
    for (const viewport of [{ width: 1365, height: 900 }, { width: 390, height: 844 }]) {
      await customerPage.setViewportSize(viewport);
      const heading = customerPage.getByRole("heading", { name: /package progress/i });
      const bounds = await heading.boundingBox();
      assert.ok(bounds && bounds.width > 0 && bounds.height > 0,
        `Package progress heading must remain visible at viewport ${viewport.width}x${viewport.height}.`);
    }
    results.push({
      journey: "customer eligibility",
      status: "passed",
      apiResponses: eligibilityResponses.length,
      packageActivationControls: "not present",
      customerCannotReadAdminPackageApi: "FORBIDDEN",
      refreshApi: "real application response received",
      networkErrorAndRetry: "real network outage surfaced; real API recovery verified",
      cumulativeQuotaMatchesApi: true,
      visibleTierCards: tierCardCount,
      responsiveViewports: ["1365x900", "390x844"],
    });
    await customerContext.close();


    // Use a distinct seeded customer with no qualifying manual admin credit to cover
    // first-load skeleton and the genuine no-package/empty state. API responses remain real.
    const unqualifiedContext = await browser.newContext({ storageState: unqualifiedCustomerState });
    const unqualifiedPage = await unqualifiedContext.newPage();
    const unqualifiedCdp = await unqualifiedContext.newCDPSession(unqualifiedPage);
    await unqualifiedPage.goto(baseURL, { waitUntil: "domcontentloaded" });
    await unqualifiedCdp.send("Network.enable");
    await unqualifiedCdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 1500,
      downloadThroughput: 500_000,
      uploadThroughput: 250_000,
      connectionType: "cellular3g",
    });
    const unqualifiedTradingNav = unqualifiedPage
      .getByRole("button", { name: /^trading$/i })
      .or(unqualifiedPage.getByRole("link", { name: /^trading$/i })).first();
    if (await unqualifiedTradingNav.count()) await unqualifiedTradingNav.click();
    const packageLoading = unqualifiedPage.locator(".trading-package-loading");
    await packageLoading.waitFor({ state: "visible", timeout: 20_000 });
    assert.match(await packageLoading.innerText(), /loading package details/i,
      "Initial eligibility fetch must expose its loading state.");
    await unqualifiedCdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
      connectionType: "wifi",
    });

    const unqualifiedHeading = unqualifiedPage.getByRole("heading", { name: /package progress/i });
    await unqualifiedHeading.waitFor({ state: "visible", timeout: 20_000 });
    const unqualifiedApi = await unqualifiedPage.evaluate(async () => {
      const response = await fetch("/api/trpc/customer.tradingEligibility", {
        method: "GET",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      let payload;
      try {
        payload = await response.json();
      } catch {
        payload = undefined;
      }
      return {
        status: response.status,
        errorCode: payload?.error?.data?.code ?? payload?.error?.json?.data?.code,
        payload,
      };
    });
    const unqualifiedData = summarizeEligibility(unqualifiedApi.payload);
    assert.ok(unqualifiedApi.status >= 200 && unqualifiedApi.status < 300 &&
      !unqualifiedApi.errorCode && unqualifiedData,
      "Unqualified customer eligibility must come from a successful real API response.");
    assert.equal(unqualifiedData.status, "not_eligible");
    assert.equal(unqualifiedData.eligible, false);
    assert.equal(unqualifiedData.currentPackage, null,
      "The test account must not have an assigned package without qualifying credits.");
    assert.equal(unqualifiedData.qualifyingDepositUsdMinor, 0,
      "The empty-state test account must have no qualifying manual admin credit.");
    assert.equal(unqualifiedData.dailyOpportunityAllowance, 0,
      "The not-yet-qualified customer must have no active daily entitlement.");
    await unqualifiedPage.getByText(/NO PACKAGE ASSIGNED/i).waitFor({ state: "visible", timeout: 20_000 });
    assert.equal(await unqualifiedPage.locator(".trading-tier-card-current").count(), 1,
      "Unqualified customer must see only the no-package current-state card.");
    assert.match(await unqualifiedPage.locator("body").innerText(),
      /assigned automatically when you qualify/i,
      "Empty state must explain automatic package assignment.");
    assert.equal(Number(await unqualifiedPage.locator(".trading-total-allowance-value").innerText()), 0,
      "Empty-state allowance must match the server's zero quota.");
    await unqualifiedContext.close();
    results.push({
      journey: "unqualified customer loading and empty/no-package state",
      status: "passed",
      initialLoadingState: "visible under real network throttling",
      qualifyingDepositUsdMinor: 0,
      assignedPackage: null,
      dailyOpportunityAllowance: 0,
    });

    const adminContext = await browser.newContext({ storageState: adminState });
    const adminPage = await adminContext.newPage();
    await adminPage.goto(baseURL, { waitUntil: "domcontentloaded" });

    // Confirm the actual administrator package catalogue API is readable under admin auth.
    const adminPackageRead = await adminPage.evaluate(async () => {
      const response = await fetch("/api/trpc/admin.tradingPackages", {
        method: "GET",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      let payload;
      try {
        payload = await response.json();
      } catch {
        payload = undefined;
      }
      return {
        status: response.status,
        hasError: Boolean(payload?.error),
        hasResult: payload?.result?.data !== undefined,
      };
    });
    assert.ok(
      adminPackageRead.status >= 200 &&
      adminPackageRead.status < 300 &&
      !adminPackageRead.hasError &&
      adminPackageRead.hasResult,
      `Administrator package API must return real result data; received HTTP ${adminPackageRead.status}.`,
    );

    // An administrator must not be allowed to read a customer-only eligibility endpoint.
    const forbiddenProbe = await adminPage.evaluate(async () => {
      const response = await fetch("/api/trpc/customer.tradingEligibility", {
        method: "GET",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      let payload;
      try {
        payload = await response.json();
      } catch {
        payload = undefined;
      }
      return {
        status: response.status,
        errorCode: payload?.error?.data?.code ?? payload?.error?.json?.data?.code,
        hasResult: Boolean(payload?.result?.data),
      };
    });
    assert.ok(
      forbiddenProbe.status === 403 || forbiddenProbe.errorCode === "FORBIDDEN",
      `Customer eligibility endpoint must reject administrator role; received HTTP ${forbiddenProbe.status}, code ${forbiddenProbe.errorCode ?? "none"}.`,
    );
    assert.equal(forbiddenProbe.hasResult, false,
      "Forbidden administrator request must not return customer eligibility data.");

    await adminPage.setViewportSize({ width: 1365, height: 900 });
    const adminNavigation = adminPage.locator(".admin-canonical-nav");
    const tradeSettingsGroup = adminNavigation.locator(".admin-nav-group-heading")
      .filter({ hasText: "Trade Settings" }).first();
    await tradeSettingsGroup.waitFor({ state: "visible", timeout: 20_000 });
    assert.equal(await tradeSettingsGroup.getAttribute("aria-expanded"), "true",
      "Trade Settings navigation group must be expanded and available.");
    const navigationPalette = await adminNavigation.locator(".admin-nav-group").evaluateAll((groups) => groups.map((group) => ({
      accent: getComputedStyle(group).getPropertyValue("--nav-accent").trim(),
      label: group.querySelector(".admin-nav-group-heading span")?.textContent?.trim() ?? "",
    })));
    assert.equal(navigationPalette.length, 13, "All canonical administrator menu groups must be present.");
    assert.equal(new Set(navigationPalette.map((group) => group.accent)).size, navigationPalette.length,
      "Every administrator menu must have its own distinct professional accent colour.");
    assert.ok(navigationPalette.every((group) => group.accent), "Every menu accent must resolve to a visible colour.");
    const submenuPalette = await adminNavigation.locator(".admin-nav-group").evaluateAll((groups) => groups.map((group) => {
      const accent = getComputedStyle(group).getPropertyValue("--nav-accent").trim();
      const submenu = group.querySelector(".admin-nav-submenu button");
      return submenu ? {
        accent,
        inheritedAccent: getComputedStyle(submenu).getPropertyValue("--nav-accent").trim(),
        submenuColor: getComputedStyle(submenu).color,
        submenuBackground: getComputedStyle(submenu).backgroundColor,
      } : null;
    }).filter(Boolean));
    assert.ok(submenuPalette.length > 0, "At least one nested submenu must be available for colour-family verification.");
    assert.ok(submenuPalette.every((entry) => entry.accent && entry.inheritedAccent === entry.accent &&
      entry.submenuColor && entry.submenuBackground),
      "Every nested submenu must inherit the exact parent menu accent and render its related colour family.");
    const tradeGroupLayout = await tradeSettingsGroup.evaluate((heading) => {
      const group = heading.closest(".trade-nav-group");
      const submenu = group?.querySelector(".admin-nav-group-items");
      const lastItem = group?.querySelector(".admin-nav-item-wrap:last-child");
      const groupBounds = group?.getBoundingClientRect();
      const submenuBounds = submenu?.getBoundingClientRect();
      const lastItemBounds = lastItem?.getBoundingClientRect();
      return {
        overflow: group ? getComputedStyle(group).overflow : "missing",
        submenuHeight: submenu?.scrollHeight ?? 0,
        submenuClientHeight: submenu?.clientHeight ?? 0,
        groupBottom: groupBounds?.bottom ?? 0,
        submenuBottom: submenuBounds?.bottom ?? 0,
        lastItemBottom: lastItemBounds?.bottom ?? 0,
      };
    });
    assert.notEqual(tradeGroupLayout.overflow, "hidden",
      "Expanded Trade submenu container must not clip menu content or keyboard focus.");
    assert.ok(tradeGroupLayout.submenuHeight > 0 && tradeGroupLayout.submenuClientHeight > 0,
      "Expanded Trade submenu content must retain its full layout height.");
    assert.ok(tradeGroupLayout.submenuBottom <= tradeGroupLayout.groupBottom + 1 &&
      tradeGroupLayout.lastItemBottom <= tradeGroupLayout.groupBottom + 1,
      "The final expanded Trade submenu item must fit inside its visible navigation group.");

    const packagesNavigation = adminNavigation.getByRole("button", { name: /packages & eligibility/i });
    await packagesNavigation.waitFor({ state: "visible", timeout: 20_000 });
    await packagesNavigation.click();
    const packageEditorHeading = adminPage.getByRole("heading", { name: /trading tiers & automation policy/i });
    await packageEditorHeading.waitFor({ state: "visible", timeout: 20_000 });
    await adminPage.getByRole("button", { name: /save all tier policies/i }).waitFor({ state: "visible", timeout: 20_000 });

    // Repeat the package-settings navigation through the actual mobile menu.
    await adminPage.setViewportSize({ width: 390, height: 844 });
    const mobileMenuButton = adminPage.locator(".admin-mobile-nav-trigger");
    await mobileMenuButton.waitFor({ state: "visible", timeout: 20_000 });
    await mobileMenuButton.click();
    const mobileNavigation = adminPage.locator(".admin-canonical-nav");
    await mobileNavigation.waitFor({ state: "visible", timeout: 20_000 });
    const mobilePackagesNavigation = mobileNavigation.getByRole("button", { name: /packages & eligibility/i });
    await mobilePackagesNavigation.waitFor({ state: "visible", timeout: 20_000 });
    await mobilePackagesNavigation.click();
    const mobileHeadingBounds = await packageEditorHeading.boundingBox();
    assert.ok(mobileHeadingBounds && mobileHeadingBounds.width > 0 && mobileHeadingBounds.height > 0,
      "Package settings heading must remain visible in the mobile administrator workflow.");


    // Probe an invalid administrator setting. The server Zod schema rejects retry
    // delay 4 (minimum 5) before the DB updater is invoked; values and versions must
    // be unchanged immediately and after a reload.
    await adminPage.setViewportSize({ width: 1365, height: 900 });
    const firstPolicyCard = adminPage.locator(".package-admin-card").first();
    await firstPolicyCard.waitFor({ state: "visible", timeout: 20_000 });
    const packageName = (await firstPolicyCard.locator("h2").innerText()).trim();
    const retryDelayInput = firstPolicyCard.getByLabel(/technical retry delay/i);
    const originalRetryDelay = await retryDelayInput.inputValue();
    const readPolicySnapshot = async () => adminPage.evaluate(async () => {
      const response = await fetch("/api/trpc/adminOperations.packagePolicies", {
        method: "GET",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      let payload;
      try {
        payload = await response.json();
      } catch {
        payload = undefined;
      }
      const data = payload?.result?.data?.json ?? payload?.result?.data;
      return {
        status: response.status,
        hasError: Boolean(payload?.error),
        rows: Array.isArray(data) ? data.map((row) => ({
          packageName: String(row.packageName),
          tradeRetryDelaySeconds: Number(row.tradeRetryDelaySeconds ?? 30),
          policyVersion: Number(row.policyVersion ?? 1),
        })).sort((a, b) => a.packageName.localeCompare(b.packageName)) : null,
      };
    });

    // Prove a valid admin setting is persisted by the real API and survives reload.
    // The environment guard above restricts this reversible write to a dedicated non-prod app.
    const originalRetryDelayNumber = Number(originalRetryDelay);
    assert.ok(Number.isSafeInteger(originalRetryDelayNumber) &&
      originalRetryDelayNumber >= 5 && originalRetryDelayNumber <= 3600,
      "Seeded policy must start with a server-valid retry delay that can be restored.");
    const temporaryRetryDelay = originalRetryDelayNumber === 3600
      ? originalRetryDelayNumber - 1 : originalRetryDelayNumber + 1;
    const openPackageSettingsAndGetRetryInput = async () => {
      await adminPage.reload({ waitUntil: "domcontentloaded" });
      await adminPage.setViewportSize({ width: 1365, height: 900 });
      const nav = adminPage.locator(".admin-canonical-nav");
      await nav.getByRole("button", { name: /packages & eligibility/i }).click();
      await adminPage.getByRole("heading", { name: /trading tiers & automation policy/i })
        .waitFor({ state: "visible", timeout: 20_000 });
      const card = adminPage.locator(".package-admin-card")
        .filter({ has: adminPage.getByRole("heading", { name: packageName, exact: true }) }).first();
      const input = card.getByLabel(/technical retry delay/i);
      await input.waitFor({ state: "visible", timeout: 20_000 });
      return input;
    };
    const saveAdminPoliciesThroughUi = async () => {
      const responsePromise = adminPage.waitForResponse(
        (response) => response.url().includes("/api/trpc/adminOperations.updatePackagePolicies"),
        { timeout: 20_000 },
      );
      await adminPage.getByRole("button", { name: /save all tier policies/i }).click();
      const response = await responsePromise;
      let payload;
      try {
        payload = await response.json();
      } catch {
        payload = undefined;
      }
      assert.ok(response.status() >= 200 && response.status() < 300 && !payload?.error &&
        payload?.result?.data !== undefined,
        "The real administrator settings save must return a successful tRPC result; received HTTP " +
        response.status() + ".");
    };

    let restorationRequired = false;
    try {
      restorationRequired = true;
      await retryDelayInput.fill(String(temporaryRetryDelay));
      await saveAdminPoliciesThroughUi();
      const savedPolicyRows = await readPolicySnapshot();
      const savedRow = savedPolicyRows.rows?.find((row) => row.packageName === packageName);
      assert.ok(savedPolicyRows.status >= 200 && savedRow,
        "Successfully saved policy must be visible from a fresh persisted policy API query.");
      assert.equal(savedRow.tradeRetryDelaySeconds, temporaryRetryDelay,
        "Valid settings save must persist the updated retry delay in the database.");

      const retryDelayAfterReload = await openPackageSettingsAndGetRetryInput();
      assert.equal(await retryDelayAfterReload.inputValue(), String(temporaryRetryDelay),
        "A valid setting must survive a real page reload using server-reloaded policy data.");
    } finally {
      if (restorationRequired) {
        // Always restore the seeded setting, including when an earlier assertion fails.
        const restoreInput = await openPackageSettingsAndGetRetryInput();
        await restoreInput.fill(originalRetryDelay);
        await saveAdminPoliciesThroughUi();
        const restoredPolicyRows = await readPolicySnapshot();
        const restoredRow = restoredPolicyRows.rows?.find((row) => row.packageName === packageName);
        assert.ok(restoredRow, "Original policy row must exist after settings cleanup.");
        assert.equal(restoredRow.tradeRetryDelaySeconds, originalRetryDelayNumber,
          "The browser acceptance run must restore the original seeded retry-delay setting.");
        const restoredInputAfterReload = await openPackageSettingsAndGetRetryInput();
        assert.equal(await restoredInputAfterReload.inputValue(), originalRetryDelay,
          "The original setting must remain persisted after restoration and reload.");
      }
    }

    const beforeInvalidSave = await readPolicySnapshot();
    assert.ok(beforeInvalidSave.status >= 200 && beforeInvalidSave.status < 300 &&
      !beforeInvalidSave.hasError && Array.isArray(beforeInvalidSave.rows) && beforeInvalidSave.rows.length > 0,
      "Disposable acceptance database must expose persisted package-policy rows before form validation.");
    const beforeRow = beforeInvalidSave.rows.find((row) => row.packageName === packageName);
    assert.ok(beforeRow, "The package editor card must map to a persisted package-policy row.");
    assert.equal(Number(originalRetryDelay), beforeRow.tradeRetryDelaySeconds,
      "Rendered retry delay must equal its persisted API value.");

    await retryDelayInput.fill("4");
    assert.equal(await retryDelayInput.inputValue(), "4");
    const rejectedMutationPromise = adminPage.waitForResponse(
      (response) => response.url().includes("/api/trpc/adminOperations.updatePackagePolicies"),
      { timeout: 20_000 },
    );
    await adminPage.getByRole("button", { name: /save all tier policies/i }).click();
    const rejectedMutation = await rejectedMutationPromise;
    let rejectedPayload;
    try {
      rejectedPayload = await rejectedMutation.json();
    } catch {
      rejectedPayload = undefined;
    }
    const validationCode = rejectedPayload?.error?.data?.code ?? rejectedPayload?.error?.json?.data?.code;
    assert.ok(rejectedMutation.status() >= 400 || validationCode === "BAD_REQUEST",
      "Out-of-range policy submission must be rejected by server validation; received HTTP " +
      rejectedMutation.status() + " and code " + (validationCode ?? "none") + ".");

    const afterInvalidSave = await readPolicySnapshot();
    assert.deepEqual(afterInvalidSave.rows, beforeInvalidSave.rows,
      "Rejected invalid settings must leave every persisted package policy and policy version unchanged.");

    await adminPage.reload({ waitUntil: "domcontentloaded" });
    await adminPage.setViewportSize({ width: 1365, height: 900 });
    const reloadedNavigation = adminPage.locator(".admin-canonical-nav");
    await reloadedNavigation.getByRole("button", { name: /packages & eligibility/i }).click();
    const reloadedPolicyHeading = adminPage.getByRole("heading", { name: /trading tiers & automation policy/i });
    await reloadedPolicyHeading.waitFor({ state: "visible", timeout: 20_000 });
    const reloadedCard = adminPage.locator(".package-admin-card")
      .filter({ has: adminPage.getByRole("heading", { name: packageName, exact: true }) }).first();
    const reloadedRetryInput = reloadedCard.getByLabel(/technical retry delay/i);
    await reloadedRetryInput.waitFor({ state: "visible", timeout: 20_000 });
    await adminPage.waitForFunction(({ name, value }) => {
      const cards = Array.from(document.querySelectorAll(".package-admin-card"));
      const card = cards.find((item) => item.querySelector("h2")?.textContent?.trim() === name);
      const input = card ? Array.from(card.querySelectorAll("label"))
        .find((label) => label.textContent?.toLowerCase().includes("technical retry delay"))
        ?.querySelector("input") : null;
      return Boolean(input && input.value === value);
    }, { name: packageName, value: originalRetryDelay }, { timeout: 20_000 });
    assert.equal(await reloadedRetryInput.inputValue(), originalRetryDelay,
      "Reload after invalid submission must show the unchanged persisted retry delay.");


    // Verify the eligible test account's assigned package IDs, assignment statuses and
    // terms versions in the actual admin customer directory. Part 1 owns this UI/API.
    await adminPage.locator(".admin-canonical-nav")
      .getByRole("button", { name: /customer directory/i }).click();
    await adminPage.getByRole("heading", { name: /customer controls/i })
      .waitFor({ state: "visible", timeout: 20_000 });
    const assignedCustomerCard = adminPage.locator(".admin-customer-card")
      .filter({ hasText: acceptanceCustomerEmail }).first();
    await assignedCustomerCard.waitFor({ state: "visible", timeout: 20_000 });
    assert.ok((await assignedCustomerCard.innerText()).includes(acceptanceCustomerEmail),
      "The selected admin customer card must visibly identify the configured eligible test customer.");
    const assignedTierGroup = assignedCustomerCard.getByRole("group", {
      name: /automatic trading tier assignments/i,
    });
    await assignedTierGroup.waitFor({ state: "visible", timeout: 20_000 });
    const assignedTierText = await assignedTierGroup.innerText();
    assert.match(assignedTierText, /Package ID\s+\d+/i,
      "Admin customer directory must display the assigned package ID.");
    assert.match(assignedTierText, /Assignment #\d+/i,
      "Admin customer directory must display the persisted package-assignment ID.");
    assert.match(assignedTierText, /Terms v\d+/i,
      "Admin customer directory must display the assignment terms version.");
    assert.match(assignedTierText, /\b(?:active|expired|cancelled|revoked|suspended|pending)\b/i,
      "Admin customer directory must display a recognizable persisted assignment status.");
    results.push({
      journey: "admin customer directory assigned package IDs and statuses",
      status: "passed",
      seededCustomer: "identified by TRADING_ACCEPTANCE_CUSTOMER_EMAIL",
      checks: ["package ID", "assignment ID", "status", "terms version"],
    });

    const adminBodyText = await adminPage.locator("body").innerText();
    assert.match(adminBodyText, /trade settings/i);
    assert.match(adminBodyText, /packages & eligibility/i);
    assert.match(adminBodyText, /trading tiers & automation policy/i);
    results.push({
      journey: "administrator Trade Settings, package configuration, setting save/reload, and invalid-form persistence",
      status: "passed",
      packageCatalogueApi: "authorized real application response",
      validSettingsRoundTrip: "temporary value persisted through reload; original value restored and verified",
      invalidForm: "server rejected out-of-range value; persisted policy/version unchanged after reload",
      adminResponsiveViewports: ["1365x900", "390x844"],
      successfulSettingsMutationsSubmitted: 2,
      financialMutationsSubmitted: 0,
      invalidMutationRejectedBeforePersistence: true,
    });
    await adminContext.close();

    process.stdout.write(JSON.stringify({
      suite: "Trading non-production browser acceptance",
      baseURL,
      results,
    }, null, 2) + "\n");
  } catch (error) {
    failures.push(error instanceof Error ? error.stack || error.message : String(error));
  } finally {
    await browser.close();
  }

  if (failures.length) {
    process.stderr.write(failures.join("\n\n") + "\n");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.stack : String(error)) + "\n");
  process.exitCode = 1;
});
