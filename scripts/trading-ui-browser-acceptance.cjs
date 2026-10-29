const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("playwright");

/**
 * Read-only Trading browser acceptance against a running Arbitrade deployment.
 * Uses real application APIs and existing authenticated browser storage states.
 * No API routes are intercepted and no financial mutations are submitted.
 *
 * Required environment:
 *   TRADING_ACCEPTANCE_BASE_URL
 *   TRADING_CUSTOMER_STORAGE_STATE
 *   TRADING_ADMIN_STORAGE_STATE
 */
async function main() {
  const baseURL = process.env.TRADING_ACCEPTANCE_BASE_URL;
  const customerState = process.env.TRADING_CUSTOMER_STORAGE_STATE;
  const adminState = process.env.TRADING_ADMIN_STORAGE_STATE;

  for (const [name, value] of Object.entries({
    TRADING_ACCEPTANCE_BASE_URL: baseURL,
    TRADING_CUSTOMER_STORAGE_STATE: customerState,
    TRADING_ADMIN_STORAGE_STATE: adminState,
  })) {
    assert.ok(value, `${name} must be set to run Trading browser acceptance.`);
  }
  assert.ok(fs.existsSync(customerState), "Customer storage state file must exist.");
  assert.ok(fs.existsSync(adminState), "Administrator storage state file must exist.");

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
    ["Customer", customerState],
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
      /(?:activate|subscribe|purchase|buy|select|choose)\s+(?:a\s+)?(?:package|tier)|(?:package|tier)\s+(?:activation|subscription|purchase|management|catalog(?:ue)?)/i,
      "Customer must not have package browsing, purchasing, selection, or activation controls.");
    assert.doesNotMatch(actionableText,
      /(?:trading|opportunit(?:y|ies)|auto[\s-]?trade)\s*(?:on|off)/i,
      "Customer must not control the server-managed Trading engine.");

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
      visibleTierCards: tierCardCount,
      responsiveViewports: ["1365x900", "390x844"],
    });
    await customerContext.close();

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

    await adminPage.getByText("Trade Settings", { exact: true }).waitFor({ timeout: 20_000 });
    await adminPage.getByText(/packages & eligibility/i).waitFor({ timeout: 20_000 });
    const adminBodyText = await adminPage.locator("body").innerText();
    assert.match(adminBodyText, /trade settings/i);
    assert.match(adminBodyText, /packages & eligibility/i);
    results.push({
      journey: "administrator Trading navigation and package API",
      status: "passed",
      packageCatalogueApi: "authorized real application response",
      mutationsSubmitted: 0,
    });
    await adminContext.close();

    process.stdout.write(JSON.stringify({
      suite: "Trading read-only browser acceptance",
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
