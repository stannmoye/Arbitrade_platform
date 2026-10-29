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

  const browser = await chromium.launch({ headless: true });
  const failures = [];
  const results = [];
  try {
    const customerContext = await browser.newContext({ storageState: customerState });
    const customerPage = await customerContext.newPage();
    const eligibilityResponses = [];
    customerPage.on("response", (response) => {
      if (response.url().includes("/api/trpc/customer.tradingEligibility")) {
        eligibilityResponses.push({ status: response.status(), url: response.url() });
      }
    });

    await customerPage.goto(baseURL, { waitUntil: "domcontentloaded" });
    const tradingNav = customerPage.getByRole("button", { name: /^trading$/i }).or(customerPage.getByRole("link", { name: /^trading$/i })).first();
    if (await tradingNav.count()) await tradingNav.click();
    await customerPage.getByRole("heading", { name: /your trading journey/i }).waitFor({ timeout: 20_000 });
    await customerPage.getByText(/total daily opportunity allowance/i).waitFor({ timeout: 20_000 });
    await customerPage.waitForTimeout(1_000);

    const bodyText = await customerPage.locator("body").innerText();
    assert.match(bodyText, /total daily opportunity allowance/i);
    assert.doesNotMatch(bodyText, /activate package|subscribe to package|purchase package/i,
      "Customer UI must not offer package activation or purchase.");
    assert.ok(eligibilityResponses.length > 0,
      "Customer eligibility must be loaded from the real tRPC API.");
    assert.ok(eligibilityResponses.every((response) => response.status >= 200 && response.status < 300),
      "Customer eligibility API responses must be successful.");
    assert.doesNotMatch(bodyText, /retry needed|couldn.t load package details/i,
      "Customer eligibility must not remain in an API-error state.");
    results.push({
      journey: "customer eligibility",
      status: "passed",
      apiResponses: eligibilityResponses.length,
      packageActivationControls: "not present",
    });
    await customerContext.close();

    const adminContext = await browser.newContext({ storageState: adminState });
    const adminPage = await adminContext.newPage();
    await adminPage.goto(baseURL, { waitUntil: "domcontentloaded" });
    await adminPage.getByText("Trade Settings", { exact: true }).waitFor({ timeout: 20_000 });
    await adminPage.getByText(/packages & eligibility/i).waitFor({ timeout: 20_000 });
    const adminBodyText = await adminPage.locator("body").innerText();
    assert.match(adminBodyText, /trade settings/i);
    assert.match(adminBodyText, /packages & eligibility/i);
    results.push({
      journey: "administrator Trading navigation",
      status: "passed",
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
