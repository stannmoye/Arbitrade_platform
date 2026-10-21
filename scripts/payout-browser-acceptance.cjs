/* Customer payout browser acceptance against the built static client.
 * The API is deliberately mocked; transactional lifecycle evidence comes from
 * the separate disposable MySQL 8 and MariaDB integration suite.
 */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const BASE_URL = process.env.STAGE2_BASE_URL || "http://127.0.0.1:4173";
const REPORT_PATH = path.resolve("artifacts/stage2-browser/payout-interactions.json");
const THEMES = ["original", "midnight-premium", "clean-light", "emerald-finance", "aurora-modern", "gold-luxe"];

async function runAdminPayoutReview(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(10000);
  const checks = [];
  const pageErrors = [];
  const requests = [
    {
      id: 5101, userId: 9301, customerName: "Browser Test Customer",
      customerEmail: "payout-paid@example.test", requestReference: "payout-admin-paid-1",
      currency: "USD", amountMinor: 1234, destinationType: "bank_transfer",
      destinationDetails: "Test Beneficiary; Example Bank; account ending 1234",
      status: "pending", externalReference: null, resolutionNote: null, resolvedBy: null,
      resolvedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: 5102, userId: 9302, customerName: "Second Browser Test Customer",
      customerEmail: "payout-reject@example.test", requestReference: "payout-admin-reject-1",
      currency: "USD", amountMinor: 2500, destinationType: "bank_transfer",
      destinationDetails: "Other Beneficiary; Example Bank; account ending 9876",
      status: "pending", externalReference: null, resolutionNote: null, resolvedBy: null,
      resolvedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
  ];
  const record = (name, passed, detail = {}) => checks.push({
    route: "/ops-console-7f3a", routeName: "admin", width: 1440,
    check: name, passed, ...detail,
  });
  const currencies = [{ code: "USD", scale: 2 }];
  page.on("pageerror", error => pageErrors.push(error.message));

  try {
    await page.route(/\/api\/trpc(?:\/|$)/, async route => {
      const request = route.request();
      const url = new URL(request.url());
      const procedures = decodeURIComponent(url.pathname.split("/api/trpc/")[1] || "").split(",").filter(Boolean);
      let envelope = {};
      try {
        const raw = request.method() === "GET" ? url.searchParams.get("input") : request.postData();
        envelope = raw ? JSON.parse(raw) : {};
      } catch {}
      const inputAt = index => {
        const item = Array.isArray(envelope) ? envelope[index] : envelope[String(index)];
        return item?.json ?? item?.input?.json ?? envelope?.json ?? envelope?.input?.json ?? {};
      };
      const output = procedures.map((procedure, index) => {
        const input = inputAt(index);
        let data = null;
        if (procedure === "auth.me") {
          data = { id: 9401, email: "payout-admin@example.test", name: "Payout Browser Admin", role: "admin" };
        } else if (procedure === "appearanceConfig") {
          data = { defaultTheme: "original", enabledThemes: THEMES, customerCanSelect: false };
        } else if (procedure === "adminOperations.payoutRequests") {
          data = requests.map(item => ({ ...item }));
        } else if (procedure === "adminOperations.resolvePayoutRequest") {
          const current = requests.find(item => Number(item.id) === Number(input.requestId));
          if (!current || current.status !== "pending") {
            return { error: { json: { message: "Only a pending payout request can be resolved." } } };
          }
          if (input.action === "paid") {
            current.status = "paid";
            current.externalReference = input.externalReference;
          } else {
            current.status = "rejected";
            current.externalReference = null;
          }
          current.resolutionNote = input.note || null;
          current.resolvedBy = 9401;
          current.resolvedAt = new Date().toISOString();
          current.updatedAt = new Date().toISOString();
          data = { ...current };
        } else if (procedure === "adminOperations.ledgerActivity" || procedure === "adminOperations.pendingSettlements" || procedure === "adminOperations.customers") {
          data = [];
        } else if (procedure === "adminOperations.currencies") {
          data = currencies;
        } else if (procedure.endsWith(".logout")) {
          data = { success: true };
        } else if (procedure.endsWith(".settings") || procedure.endsWith(".branding")) {
          data = {};
        } else if (procedure.startsWith("adminOperations.")) {
          data = [];
        }
        return { result: { data: { json: data } } };
      });
      if (procedures.includes("adminOperations.resolvePayoutRequest")) {
        await new Promise(resolve => setTimeout(resolve, 350));
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(output) });
    });

    await page.goto(new URL("/ops-console-7f3a", BASE_URL).href, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.getByRole("heading", { name: "Control centre" }).waitFor({ state: "visible", timeout: 15000 });
    await page.locator(".admin-canonical-nav").getByRole("button", { name: /Wallet & Ledger/ }).click();
    await page.getByRole("heading", { name: "Transaction review" }).waitFor({ state: "visible", timeout: 15000 });
    await page.getByRole("heading", { name: "Customer payout requests" }).waitFor({ state: "visible", timeout: 10000 });

    const pendingCount = page.getByText("2 pending", { exact: true });
    const firstVisible = await page.getByText("payout-admin-paid-1", { exact: true }).isVisible().catch(() => false);
    const secondVisible = await page.getByText("payout-admin-reject-1", { exact: true }).isVisible().catch(() => false);
    record("admin transaction review loads pending payout queue",
      await pendingCount.isVisible().catch(() => false) && firstVisible && secondVisible, {
        pendingCountVisible: await pendingCount.isVisible().catch(() => false), firstVisible, secondVisible,
      });

    await page.getByLabel("External transfer reference for payout-admin-paid-1").fill("BANK-TRANSFER-VERIFIED-001");
    const paidRow = page.locator("tr").filter({ hasText: "payout-admin-paid-1" });
    const paidButton = paidRow.getByRole("button", { name: "Mark paid" });
    const paidEnabled = await paidButton.isEnabled();
    await paidButton.click();
    await page.locator(".admin-payout-history-head").waitFor({ state: "visible" });
    await page.getByText("BANK-TRANSFER-VERIFIED-001", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
    await page.locator("tr").filter({ hasText: "payout-admin-paid-1" }).getByText("paid", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
    record("admin paid resolution requires and records external transfer reference",
      paidEnabled && requests[0].status === "paid" && requests[0].externalReference === "BANK-TRANSFER-VERIFIED-001", {
        paidEnabled, persistedMockStatus: requests[0].status,
        externalReference: requests[0].externalReference,
      });

    const rejectRow = page.locator("tr").filter({ hasText: "payout-admin-reject-1" }).filter({ has: page.locator("button", { hasText: "Reject and release" }) });
    await page.getByLabel("Resolution note for payout-admin-reject-1").fill("Rejected for browser acceptance; no transfer was initiated.");
    const rejectButton = rejectRow.getByRole("button", { name: "Reject and release" });
    const rejectEnabled = await rejectButton.isEnabled();
    await rejectButton.click();
    await page.locator("tr").filter({ hasText: "payout-admin-reject-1" }).getByText("rejected", { exact: true }).waitFor({ state: "visible", timeout: 10000 });
    const noteVisible = await page.getByText("Rejected for browser acceptance; no transfer was initiated.", { exact: true }).isVisible().catch(() => false);
    record("admin rejection requires and preserves a resolution note",
      rejectEnabled && noteVisible && requests[1].status === "rejected", {
        rejectEnabled, noteVisible, persistedMockStatus: requests[1].status,
      });

    record("admin payout browser flow has no uncaught page errors", pageErrors.length === 0, { pageErrors });
  } catch (error) {
    record("admin payout review flow completes", false, {
      error: error instanceof Error ? error.message : String(error),
      pageErrors, bodyText: await page.locator("body").innerText().catch(() => ""),
      payoutStates: requests.map(item => ({ requestReference: item.requestReference, status: item.status })),
    });
  } finally {
    await page.close();
  }
  return checks;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const checks = [];
  const pageErrors = [];
  const requests = [];
  const currencies = [
    { code: "USD", scale: 2, name: "US Dollar", symbol: "$", usdRate: 1 },
    { code: "EUR", scale: 2, name: "Euro", symbol: "€", usdRate: 1.08 },
    { code: "GBP", scale: 2, name: "British Pound", symbol: "£", usdRate: 1.27 },
    { code: "BTC", scale: 8, name: "Bitcoin", symbol: "BTC", usdRate: 60000 },
    { code: "ETH", scale: 8, name: "Ethereum", symbol: "ETH", usdRate: 3000 },
    { code: "USDT", scale: 6, name: "Tether", symbol: "USDT", usdRate: 1 },
  ];
  const balances = {
    currencies,
    balances: [
      { currency: "USD", availableMinor: 10000, lockedMinor: 0, promotionalMinor: 2000 },
      { currency: "EUR", availableMinor: 10000, lockedMinor: 0, promotionalMinor: 0 },
      { currency: "GBP", availableMinor: 10000, lockedMinor: 0, promotionalMinor: 0 },
      { currency: "BTC", availableMinor: 100000000, lockedMinor: 0, promotionalMinor: 0 },
      { currency: "ETH", availableMinor: 100000000, lockedMinor: 0, promotionalMinor: 0 },
      { currency: "USDT", availableMinor: 10000000, lockedMinor: 0, promotionalMinor: 0 },
    ],
    summary: { totalUsd: 100, availableUsd: 80, earnedUsd: 0, promotionalUsd: 20 },
  };
  let requestCount = 0;
  let cancelCount = 0;
  let nextId = 1;
  let flowError = null;
  let adminChecks = [];
  const record = (name, passed, detail = {}) => checks.push({ name, passed, ...detail });
  const findWallet = currency => balances.balances.find(row => row.currency === currency);
  const minorUnitScale = currency => currencies.find(row => row.code === currency)?.scale ?? 2;

  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(10000);
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("dialog", dialog => { void dialog.accept().catch(() => undefined); });

    await page.route(/\/api\/trpc(?:\/|$)/, async route => {
      const req = route.request();
      const url = new URL(req.url());
      const procedures = decodeURIComponent(url.pathname.split("/api/trpc/")[1] || "").split(",").filter(Boolean);
      let envelope = {};
      try {
        const raw = req.method() === "GET" ? url.searchParams.get("input") : req.postData();
        envelope = raw ? JSON.parse(raw) : {};
      } catch {}
      const inputAt = index => {
        const item = Array.isArray(envelope) ? envelope[index] : envelope[String(index)];
        return item?.json ?? item?.input?.json ?? envelope?.json ?? envelope?.input?.json ?? {};
      };
      const output = procedures.map((procedure, index) => {
        const input = inputAt(index);
        let data = null;
        if (procedure === "auth.me") {
          data = { id: 9201, email: "payout-browser@example.test", name: "Payout Browser Customer", role: "customer" };
        } else if (procedure === "appearanceConfig") {
          data = { defaultTheme: "original", enabledThemes: THEMES, customerCanSelect: false };
        } else if (procedure === "customer.balances") {
          data = balances;
        } else if (procedure === "customer.payoutEligibility") {
          data = { allowed: true, reason: null };
        } else if (procedure === "customer.payoutRequests") {
          data = requests.map(row => ({ ...row }));
        } else if (procedure === "customer.walletPreferences") {
          data = { tradingCurrency: "USD", swapCurrency: "USD", autoTopUpEnabled: false, withdrawalWhitelistEnabled: true };
        } else if (procedure === "customer.requestPayout") {
          requestCount += 1;
          const item = {
            id: nextId++,
            userId: 9201,
            requestReference: "payout-browser-" + requestCount,
            currency: input.currency,
            amountMinor: input.amountMinor,
            destinationType: input.destinationType,
            destinationDetails: input.destinationDetails,
            status: "pending",
            externalReference: null,
            resolutionNote: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          requests.unshift(item);
          const wallet = findWallet(item.currency);
          if (wallet) {
            wallet.availableMinor -= item.amountMinor;
            wallet.lockedMinor += item.amountMinor;
          }
          balances.summary.availableUsd -= item.amountMinor / (10 ** minorUnitScale(item.currency));
          data = { ...item };
        } else if (procedure === "customer.cancelPayoutRequest") {
          cancelCount += 1;
          const item = requests.find(row => Number(row.id) === Number(input.requestId));
          if (item && item.status === "pending") {
            item.status = "cancelled";
            item.resolutionNote = "Cancelled by customer";
            item.updatedAt = new Date().toISOString();
            const wallet = findWallet(item.currency);
            if (wallet) {
              wallet.availableMinor += item.amountMinor;
              wallet.lockedMinor -= item.amountMinor;
            }
            balances.summary.availableUsd += item.amountMinor / (10 ** minorUnitScale(item.currency));
          }
          data = item ? { ...item } : null;
        } else if (procedure.endsWith(".logout")) {
          data = { success: true };
        } else if (procedure.endsWith(".settings") || procedure.endsWith(".branding")) {
          data = {};
        } else if (procedure.startsWith("customer.")) {
          data = [];
        }
        return { result: { data: { json: data } } };
      });
      if (procedures.some(procedure => procedure === "customer.requestPayout" || procedure === "customer.cancelPayoutRequest")) {
        await new Promise(resolve => setTimeout(resolve, 400));
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(output),
      });
    });

    try {
      await page.goto(new URL("/customer", BASE_URL).href, { waitUntil: "domcontentloaded", timeout: 30000 });
      const menuTrigger = page.getByRole("button", { name: "Open customer navigation" });
      await menuTrigger.waitFor({ state: "visible", timeout: 15000 });
      await menuTrigger.click();
      await page.locator(".customer-resource-nav").getByRole("button", { name: /^Wallet\b/ }).click();
      await page.getByRole("heading", { name: "Payout requests" }).waitFor({ state: "visible", timeout: 15000 });

      const available80 = page.getByText("Available for payout: USD 80.00");
      await available80.waitFor({ state: "visible" });
      const eligibilityAlert = page.locator(".payout-eligibility-alert");
      record("wallet navigation and eligible payout state", 
        await page.getByRole("heading", { name: "Wallet & cash" }).isVisible().catch(() => false) &&
        !(await eligibilityAlert.isVisible().catch(() => false)) &&
        await available80.isVisible().catch(() => false), {
          availableText: await available80.innerText().catch(() => null),
          eligibilityAlert: await eligibilityAlert.isVisible().catch(() => false),
        });

      const currencySelect = page.getByLabel("Payout currency");
      await currencySelect.selectOption("BTC");
      const cryptoType = await page.locator(".payout-destination-type").innerText();
      const cryptoDetails = page.getByLabel("Public wallet address and network");
      const cryptoLabel = await cryptoDetails.isVisible().catch(() => false);
      await cryptoDetails.fill("bc1q-public-test-destination");
      await currencySelect.selectOption("USD");
      const bankType = await page.locator(".payout-destination-type").innerText();
      const bankDetails = page.getByLabel("Beneficiary and bank details");
      const bankLabel = await bankDetails.isVisible().catch(() => false);
      const staleDestinationCleared = await bankDetails.inputValue().then(value => value === "").catch(() => false);
      record("payout destination type follows currency and clears previous destination text",
        cryptoType === "Crypto wallet transfer" && cryptoLabel &&
        bankType === "Bank transfer" && bankLabel && staleDestinationCleared, {
          cryptoType, cryptoLabel, bankType, bankLabel, staleDestinationCleared,
        });

      const amount = page.getByLabel("Amount");
      const submit = page.getByRole("button", { name: /Request payout/ });
      await amount.fill("81.00");
      const amountAboveAvailableDisabled = await submit.isDisabled();
      const amountErrorVisible = await page.getByText(/Enter a positive amount within the available balance/).isVisible().catch(() => false);
      await amount.fill("10.00");
      await page.getByLabel("Beneficiary and bank details").fill("A. Customer; Example Bank; account 00001234");
      const validAmountEnabled = await submit.isEnabled();
      record("promotional balance excluded from amount limit",
        amountAboveAvailableDisabled && amountErrorVisible && validAmountEnabled, {
          amountAboveAvailableDisabled, amountErrorVisible, validAmountEnabled,
          availableText: await available80.innerText().catch(() => null),
        });

      await submit.click();
      const pendingButton = page.getByRole("button", { name: /Submitting request/ });
      await pendingButton.waitFor({ state: "visible", timeout: 5000 });
      const busyDisabled = await pendingButton.isDisabled();
      const recordedMessage = page.getByText(/Payout request payout-browser-1 was recorded/);
      await recordedMessage.waitFor({ state: "visible", timeout: 10000 });
      await page.getByText("Pending manual review").waitFor({ state: "visible", timeout: 10000 });
      const available70 = await page.getByText("Available for payout: USD 70.00").isVisible().catch(() => false);
      record("payout submission updates feedback, reservation display, and history",
        busyDisabled && requestCount === 1 && available70 &&
        await recordedMessage.isVisible().catch(() => false) &&
        await page.getByText("Pending manual review").isVisible().catch(() => false), {
          requestCount, busyDisabled, available70,
          recordedMessage: await recordedMessage.innerText().catch(() => null),
        });

      await page.getByRole("button", { name: "Cancel request" }).click();
      const cancelledMessage = page.getByText(/Payout request payout-browser-1 was cancelled/);
      await cancelledMessage.waitFor({ state: "visible", timeout: 10000 });
      await page.getByText("Cancelled · funds released").waitFor({ state: "visible", timeout: 10000 });
      const available80Restored = await page.getByText("Available for payout: USD 80.00").isVisible().catch(() => false);
      record("cancelling a pending payout restores the displayed balance",
        cancelCount === 1 && available80Restored &&
        await cancelledMessage.isVisible().catch(() => false) &&
        await page.getByText("Cancelled · funds released").isVisible().catch(() => false), {
          cancelCount, available80Restored,
          cancelledMessage: await cancelledMessage.innerText().catch(() => null),
        });

      await page.waitForTimeout(150);
      record("payout browser flow has no uncaught page errors", pageErrors.length === 0, { pageErrors });
    } catch (error) {
      flowError = error instanceof Error ? error.message : String(error);
      record("payout browser flow completes", false, {
        flowError, requestCount, cancelCount, pageErrors,
        history: requests.map(item => ({ requestReference: item.requestReference, status: item.status })),
        bodyText: await page.locator("body").innerText().catch(() => ""),
      });
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }

  adminChecks = await runAdminPayoutReview(browser);
  checks.push(...adminChecks);

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    viewport: { width: 390, height: 844 },
    backend: "mocked tRPC/auth; no customer account or wallet is modified",
    checks: checks.length,
    passed: checks.filter(check => check.passed).length,
    failures: checks.filter(check => !check.passed),
    checksDetail: checks,
    limitations: [
      "This browser test verifies customer UI behavior with mocked auth and tRPC responses, not live server authorization or database persistence.",
      "Reservation, idempotency, cancellation, rejection, paid-reference uniqueness, and transaction rollback are verified by the separate disposable MySQL 8 and MariaDB integration suite.",
      "No external bank or blockchain transfer is initiated.",
    ],
    flowError,
  };
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ report: REPORT_PATH, checks: report.checks, passed: report.passed, failures: report.failures }, null, 2));
  if (report.failures.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
