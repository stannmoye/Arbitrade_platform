/*
 * Focused Chromium acceptance for Trade opportunity delivery.
 * Start the static client with `PORT=4173 pnpm dev:static`, then run this file.
 * All authentication and API responses are mocked; this verifies client rendering,
 * visibility-gated acknowledgement, admin filtering/drill-down and filtered export,
 * not live server authorization or database persistence.
 */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const BASE_URL = process.env.OPPORTUNITY_DELIVERY_BASE_URL || "http://127.0.0.1:4173";
const ARTIFACT_DIR = path.resolve(process.env.OPPORTUNITY_DELIVERY_ARTIFACTS || "artifacts/opportunity-delivery-browser");
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

const now = Date.now();
const iso = (value) => new Date(value).toISOString();
const deliveryOffer = {
  id: 901,
  deliveryEventId: 5901,
  deliveryLeaseToken: "5d8d0000-0000-4000-8000-000000000001",
  popupEligible: true,
  offerStatus: "open",
  eventStatus: "DELIVERED",
  deliveryStatus: "delivered",
  expiryStatus: "active",
  opensAt: iso(now),
  closesAt: iso(now + 10 * 60 * 1000),
  companyDisplayName: "Acceptance Fixture Company",
  companyName: "Acceptance Fixture Company",
  companyReferenceId: "fixture-001",
  companyLogoUrl: null,
  packageName: "Acceptance Tier",
  symbol: "AFC",
  currency: "USD",
  currencySymbol: "$",
  currencyScale: 2,
  minimumMinor: 25000,
  balanceAvailableMinor: 500000,
  shortfallMinor: 0,
  balanceStatus: "sufficient",
  configuredDurationSeconds: 300,
  configuredProfitRateBps: 250,
  expectedRewardBps: 250,
};
const customerFeed = {
  serverTime: iso(now),
  offers: [deliveryOffer],
  missed: [],
  autoTrades: [],
  settled: [],
  delivery: { enabled: true, maxPopupsPerDay: 1, popupPolicy: { popupDisplaySeconds: 600 }, pausedUntilSettled: false, cooldownActive: false },
};

const lifecycleSummary = {
  sourceAvailable: true,
  last24Hours: { generated: 12, queued: 8, received: 7, rendered: 5, failed: 1, expired: 1, noticed: 4, opened: 3, dismissed: 1, withdrawn: 0, traded: 1, settled: 0, zeroBalance: 0 },
  retainedDaily: [],
  generatedAt: iso(now),
};
const overview = {
  sourceAvailable: true,
  windowStart: iso(now - 24 * 60 * 60 * 1000),
  generatedAt: iso(now),
  generated24h: 12,
  deliveryAttempted24h: 9,
  successfullyDelivered24h: 7,
  browserReceived24h: 7,
  browserAcknowledged24h: 6,
  rendered24h: 5,
  failedEvents24h: 1,
  expiredEvents24h: 1,
  completed24h: 2,
  currentQueue: { queued: 2, inProgress: 1, retryWait: 1, pendingTotal: 4, currentFailed: 1, currentExpired: 1, staleProcessingLeases: 1, pendingPastExpiry: 0 },
  averageQueueToBrowserReceiptMilliseconds24h: 1650,
  averageLatency24hSampleCount: 7,
  prior29DayAverageLatencyMilliseconds: 1200,
  prior29DayLatencySampleCount: 49,
  pendingBeyondObservedWait: 1,
  pendingApproachingExpiry: 1,
  trackedBacklogBaselineCount: 14,
  trackedBacklogDeltaOneHour: 2,
  oldestPendingAgeMilliseconds: 94000,
  oldestPending: { opportunityId: 901, createdAt: iso(now - 94000), expiresAt: iso(now + 50000) },
  repeatedFailureOpportunities24h: 1,
  attributionNote: "Rolling counts use append-only evidence; current queue counts use persisted popup status.",
};
const deliveryRecord = {
  opportunityId: 901,
  popupEventId: 5901,
  customerId: 8001,
  customerName: "Acceptance Customer",
  customerEmail: "acceptance.customer@example.test",
  packageName: "Acceptance Tier",
  companyName: "Acceptance Fixture Company",
  generatedAt: iso(now - 180000),
  deliveryStatus: "retry_wait",
  assignmentStatus: "assigned",
  retryAttempts: 2,
  retryAt: iso(now + 45000),
  receivedAt: null,
  renderedAt: null,
  openedAt: null,
  completedAt: null,
  expiredAt: null,
  lastErrorCode: "NETWORK_TIMEOUT",
  failureCategory: "timeout",
  diagnosticMessage: "The recorded customer delivery attempt timed out.",
  workerId: null,
};
const workerHealth = {
  workers: [{ workerKey: "trading-opportunities", isCurrentInstance: true, status: "healthy", healthRecordAvailable: true, heartbeatAt: iso(now - 5000), lastSuccessAt: iso(now - 10000) }],
  opportunityDelivery: { opportunityCycle: { status: "healthy", healthRecordAvailable: true, heartbeatAt: iso(now - 5000) } },
};

function decodeInput(request, index) {
  try {
    const url = new URL(request.url());
    const raw = request.method() === "GET" ? url.searchParams.get("input") : request.postData();
    const envelope = raw ? JSON.parse(raw) : {};
    const item = Array.isArray(envelope) ? envelope[index] : envelope[String(index)];
    return item?.json ?? item?.input?.json ?? envelope?.json ?? envelope?.input?.json ?? {};
  } catch {
    return {};
  }
}

async function waitFor(predicate, description, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${description}.`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function adminResponse(procedure, input) {
  if (procedure === "auth.me") return { id: 9001, email: "delivery-admin@example.test", name: "Delivery Acceptance Admin", role: "admin" };
  if (procedure === "adminOperations.customers") return [];
  if (procedure === "adminOperations.packagePolicies" || procedure === "adminOperations.overviewPackagePolicies") return [];
  if (procedure === "adminOperations.popupLifecycleSummary") return lifecycleSummary;
  if (procedure === "adminOperations.deliveryOverview") return overview;
  if (procedure === "adminOperations.workerHealth") return workerHealth;
  if (procedure === "adminOperations.deliveryDiagnostics") return {
    sourceAvailable: true,
    items: input.workerStatus && input.workerStatus !== "healthy" ? [] : [deliveryRecord],
    nextCursor: null,
    generatedAt: iso(Date.now()),
    range: { from: iso(now - 30 * 86400000), to: iso(now), pageSize: input.pageSize || 25 },
    ...(input.workerStatus ? { workerStatusObservation: { requested: input.workerStatus, observed: "healthy", scope: "global_current_trading_opportunities_worker_not_per_opportunity_attribution" } } : {}),
  };
  if (procedure === "adminOperations.deliveryFailureAnalysis") return {
    sourceAvailable: true,
    categories: [{ category: "timeout", opportunities: 1, failureEvents: 2, lastFailureAt: iso(now - 50000) }],
    generatedAt: iso(now),
    range: { from: iso(now - 30 * 86400000), to: iso(now) },
  };
  if (procedure === "adminOperations.deliveryCustomerDiagnostics") return {
    sourceAvailable: true,
    customer: { id: 8001, name: "Acceptance Customer", email: "acceptance.customer@example.test", packageName: "Acceptance Tier" },
    summary: {
      generated: 4, browserReceived: 3, rendered: 2, pending: 1, failed: 0, expired: 0, retried: 2,
      currentDeliveryStatus: "retry_wait", currentOpportunityId: 901, currentStatusAt: iso(now - 10000),
      mostRecentFailure: { failureCategory: "timeout", errorCode: "NETWORK_TIMEOUT", message: "The recorded delivery attempt timed out." },
      lastReceivedAt: iso(now - 60000), lastRenderedAt: iso(now - 50000), lastFailureAt: iso(now - 40000),
      trackedByDiagnosticHistory: 3, olderGeneratedWithoutEventHistory: 1,
      retryHistory: [{ opportunityId: 901, retryAttempt: 2, eventAt: iso(now - 30000), retryAt: iso(now + 45000), errorCode: "NETWORK_TIMEOUT" }],
    },
  };
  if (procedure === "adminOperations.deliveryOpportunityDiagnostics") return {
    sourceAvailable: true,
    opportunity: { ...deliveryRecord, customerId: 8001, companyReferenceId: "fixture-001", deliveryStatus: "retry_wait", retryAt: iso(now + 45000) },
    historyAvailable: true,
    history: [
      { id: 1, eventType: "generated", eventAt: iso(now - 180000), durationMs: null, evidenceSource: "diagnostic_event" },
      { id: 2, eventType: "queued", eventAt: iso(now - 170000), durationMs: 10000, evidenceSource: "diagnostic_event" },
      { id: 3, eventType: "retry_scheduled", eventAt: iso(now - 30000), durationMs: 140000, retryAttempt: 2, retryAt: iso(now + 45000), errorCode: "NETWORK_TIMEOUT", failureCategory: "timeout", message: "The recorded delivery attempt timed out.", evidenceSource: "diagnostic_event" },
    ],
  };
  if (procedure === "adminOperations.settings") return {};
  return null;
}

async function installMockApi(page, role, mutationObserver, options = {}) {
  await page.route(/\/api\/trpc(?:\/|$)/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const procedurePath = decodeURIComponent(url.pathname.split("/api/trpc/")[1] || "");
    const procedures = procedurePath.split(",").filter(Boolean);
    const output = await Promise.all(procedures.map(async (procedure, index) => {
      const input = decodeInput(request, index);
      let data = null;
      if (procedure === "auth.me") data = role === "admin"
        ? { id: 9001, email: "delivery-admin@example.test", name: "Delivery Acceptance Admin", role: "admin" }
        : { id: 8001, email: "acceptance.customer@example.test", name: "Acceptance Customer", role: "user" };
      else if (role === "admin") {
        data = adminResponse(procedure, input);
        if (options.unavailable && procedure === "adminOperations.popupLifecycleSummary") data = { sourceAvailable: false, last24Hours: {}, retainedDaily: [], generatedAt: null };
        if (options.unavailable && procedure === "adminOperations.deliveryOverview") data = { sourceAvailable: false, generatedAt: null, currentQueue: null };
      }
      else if (procedure === "customer.opportunities") data = customerFeed;
      else if (procedure === "customer.balances") data = { balances: [], currencies: [] };
      else if (procedure === "customer.soundSettings") data = {};
      else if (procedure === "customer.trades") data = [];
      else if (procedure === "customer.popupLifecycle") data = { ok: true };
      else if (procedure === "customer.popupDeliveryStatus") {
        const status = input.status;
        const observation = status === "rendered" ? await page.locator('[aria-label="Customer opportunity alert"]').evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return { connected: element.isConnected, visibility: style.visibility, display: style.display, opacity: style.opacity, documentVisibility: document.visibilityState, inViewport: rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth, width: rect.width, height: rect.height };
        }).catch(() => null) : null;
        mutationObserver.push({ procedure, input, observation });
        data = { ok: true, status };
      }
      return { result: { data: { json: data } } };
    }));
    try {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(output) });
    } catch {
      await route.continue();
    }
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const checks = [];
  const check = (name, passed, details = {}) => {
    checks.push({ name, passed: Boolean(passed), ...details });
    if (!passed) throw new Error(`${name} failed: ${JSON.stringify(details)}`);
  };
  const pageErrors = [];

  try {
    const admin = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    admin.on("pageerror", (error) => pageErrors.push(`admin: ${error.message}`));
    await installMockApi(admin, "admin", []);
    await admin.goto(`${BASE_URL}/ops-console-7f3a`, { waitUntil: "domcontentloaded" });
    await admin.getByRole("heading", { name: "Control centre" }).waitFor({ state: "visible", timeout: 15000 });
    const tradeGroup = admin.locator(".admin-nav-group--trade-settings");
    const tradeGroupHeading = tradeGroup.locator(".admin-nav-group-heading");
    if (await tradeGroupHeading.getAttribute("aria-expanded") !== "true") await tradeGroupHeading.click();
    await tradeGroup.getByRole("button", { name: /Active & Pending Opportunities/ }).click();
    await admin.getByRole("heading", { name: "Opportunity delivery", exact: true }).waitFor({ state: "visible", timeout: 10000 });
    await admin.getByText("Successfully delivered").waitFor({ state: "visible" });
    await admin.getByText("Browser acknowledgements").waitFor({ state: "visible" });
    await admin.getByText("Visible popup renders").waitFor({ state: "visible" });
    await admin.getByText("Pending approaching expiry").waitFor({ state: "visible" });
    await admin.getByText("Tracked backlog change · 1h").waitFor({ state: "visible" });
    await admin.getByText("Opportunity delivery explorer").waitFor({ state: "visible" });
    await admin.getByRole("cell", { name: "#901" }).waitFor({ state: "visible" });
    check("admin-dashboard-renders-distinct-receipt-ack-render-and-risk-metrics", true);
    const adminDesktop = path.join(ARTIFACT_DIR, "admin-delivery-1440.png");
    await admin.screenshot({ path: adminDesktop, fullPage: true, animations: "disabled" });

    await admin.getByLabel("Current Trading worker status").selectOption("healthy");
    await admin.getByRole("button", { name: "Apply filters" }).click();
    await admin.getByText(/current global status is “healthy”/i).waitFor({ state: "visible" });
    check("admin-worker-status-filter-is-clearly-global", true);

    await admin.getByRole("button", { name: "Acceptance Customer" }).click();
    await admin.getByRole("heading", { name: /Customer delivery summary/ }).waitFor({ state: "visible" });
    await admin.getByText("retry_wait").waitFor({ state: "visible" });
    await admin.getByRole("button", { name: "Inspect", exact: true }).click();
    await admin.getByRole("heading", { name: "Opportunity #901 lifecycle" }).waitFor({ state: "visible" });
    await admin.getByText("retry scheduled").waitFor({ state: "visible" });
    check("customer-and-opportunity-drilldowns-render-retry-history", true);

    const [download] = await Promise.all([
      admin.waitForEvent("download"),
      admin.getByRole("button", { name: "Export filtered CSV" }).click(),
    ]);
    const csvPath = path.join(ARTIFACT_DIR, "opportunity-delivery-diagnostics.csv");
    await download.saveAs(csvPath);
    const csv = fs.readFileSync(csvPath, "utf8");
    check("filtered-csv-export-contains-only-diagnostic-fixture", csv.includes("901") && csv.includes("NETWORK_TIMEOUT"), { csvPath });
    await admin.setViewportSize({ width: 390, height: 844 });
    const mobileScreenshot = path.join(ARTIFACT_DIR, "admin-delivery-390.png");
    await admin.screenshot({ path: mobileScreenshot, fullPage: true, animations: "disabled" });
    const mobileWidth = await admin.evaluate(() => document.documentElement.scrollWidth);
    check("admin-mobile-page-has-no-horizontal-overflow", mobileWidth <= 390, { mobileWidth });

    const noDataAdmin = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    noDataAdmin.on("pageerror", (error) => pageErrors.push(`unavailable-admin: ${error.message}`));
    await installMockApi(noDataAdmin, "admin", [], { unavailable: true });
    await noDataAdmin.goto(`${BASE_URL}/ops-console-7f3a`, { waitUntil: "domcontentloaded" });
    await noDataAdmin.getByRole("heading", { name: "Control centre" }).waitFor({ state: "visible", timeout: 15000 });
    const noDataTradeGroup = noDataAdmin.locator(".admin-nav-group--trade-settings");
    const noDataTradeHeading = noDataTradeGroup.locator(".admin-nav-group-heading");
    if (await noDataTradeHeading.getAttribute("aria-expanded") !== "true") await noDataTradeHeading.click();
    await noDataTradeGroup.getByRole("button", { name: /Active & Pending Opportunities/ }).click();
    await noDataAdmin.getByText("The advanced delivery data source is unavailable. Metrics below are not reported as zero.").waitFor({ state: "visible" });
    const unavailableQueueCard = noDataAdmin.locator(".delivery-overview-metrics > *").filter({ hasText: "Currently queued" });
    check("unavailable-database-is-not-rendered-as-zero", (await unavailableQueueCard.innerText()).includes("Unavailable"));

    const customer = await browser.newPage({ viewport: { width: 390, height: 844 } });
    customer.on("pageerror", (error) => pageErrors.push(`customer: ${error.message}`));
    const deliveryMutations = [];
    await customer.addInitScript(() => {
      let observer;
      const apply = () => {
        if (!document.head || document.getElementById("qa-hide-delivery-popup")) return;
        const style = document.createElement("style");
        style.id = "qa-hide-delivery-popup";
        style.textContent = ".center-opportunity-toast { visibility: hidden !important; }";
        document.head.appendChild(style);
        observer.disconnect();
      };
      observer = new MutationObserver(apply);
      observer.observe(document, { childList: true, subtree: true });
      apply();
    });
    customer.on("console", (message) => { if (message.type() === "error") pageErrors.push(`customer console: ${message.text()}`); });
    await installMockApi(customer, "customer", deliveryMutations);
    await customer.goto(`${BASE_URL}/customer`, { waitUntil: "domcontentloaded" });
    const alert = customer.locator(".center-opportunity-toast");
    try { await alert.waitFor({ state: "attached", timeout: 15000 }); }
    catch (error) {
      console.error("customer DOM:", (await customer.locator("body").innerText()).slice(0, 3500));
      console.error("customer errors:", pageErrors);
      throw error;
    }
    await waitFor(() => deliveryMutations.some((entry) => entry.input.status === "received"), "browser receipt acknowledgement");
    await customer.waitForTimeout(1000);
    const received = deliveryMutations.some((entry) => entry.input.status === "received");
    const renderedWhileHidden = deliveryMutations.some((entry) => entry.input.status === "rendered");
    check("customer-browser-receipt-does-not-require-visible-render", received);
    check("hidden-popup-does-not-send-render-acknowledgement", !renderedWhileHidden);
    await customer.evaluate(() => document.getElementById("qa-hide-delivery-popup")?.remove());
    await waitFor(() => deliveryMutations.some((entry) => entry.input.status === "rendered"), "visible render acknowledgement");
    await customer.waitForTimeout(300);
    const rendered = deliveryMutations.find((entry) => entry.input.status === "rendered");
    check("visible-popup-sends-render-ack-only-after-visible-paint", Boolean(rendered && rendered.observation?.connected && rendered.observation?.visibility === "visible" && rendered.observation?.documentVisibility === "visible" && rendered.observation?.inViewport), { observation: rendered?.observation });
    const customerScreenshot = path.join(ARTIFACT_DIR, "customer-popup-390.png");
    await customer.screenshot({ path: customerScreenshot, fullPage: true, animations: "disabled" });

    check("no-client-page-errors", pageErrors.length === 0, { pageErrors });
    const report = { baseUrl: BASE_URL, mocked: true, generatedAt: new Date().toISOString(), checks, pageErrors, screenshots: [adminDesktop, mobileScreenshot, customerScreenshot], csvPath };
    fs.writeFileSync(path.join(ARTIFACT_DIR, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
