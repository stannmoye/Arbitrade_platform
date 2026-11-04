import assert from "node:assert/strict";
import { chromium, type Browser, type Page } from "playwright";

const GLOBAL_SWITCHES = [
  "Tier policy master",
  "Pop-up delivery",
  "Company rotation",
  "Randomized timing",
  "Burst delivery",
  "Require previous settlement",
] as const;

async function launchAuthenticatedPage(
  baseUrl: string,
  loginPath: string,
  email: string,
  password: string
) {
  const browser: Browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const login = await context.request.post(`${baseUrl}${loginPath}`, {
      data: { email, password },
    });
    assert.equal(
      login.status(),
      200,
      `Disposable test account login failed: ${login.status()}`
    );
    const page = await context.newPage();
    return { browser, page };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

async function waitForStatus(page: Page) {
  await page
    .getByText(
      "Global Trade control saved and verified from a fresh database read.",
      { exact: true }
    )
    .waitFor({ timeout: 10_000 });
}

export async function verifyAdminTradeSettingsInBrowser(input: {
  baseUrl: string;
  email: string;
  password: string;
  beforeDatabaseFailure?: () => Promise<void>;
  afterDatabaseFailure?: () => Promise<void>;
}) {
  const { browser, page } = await launchAuthenticatedPage(
    input.baseUrl,
    "/api/admin/login",
    input.email,
    input.password
  );
  try {
    await page.goto(`${input.baseUrl}/ops-console-7f3a`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("button", { name: "Trade Settings" }).click();
    await page.getByRole("button", { name: /Package Configuration/ }).click();
    await page
      .getByRole("heading", { name: "Package Configuration" })
      .waitFor({ timeout: 15_000 });
    await page
      .getByRole("heading", { name: "Global Trade master controls" })
      .waitFor({ timeout: 15_000 });

    const reason = page.getByLabel(
      "Administrator reason (required, 5–500 characters)"
    );
    const firstControl = page.getByRole("switch", { name: GLOBAL_SWITCHES[0] });
    assert.equal(
      await firstControl.isDisabled(),
      true,
      "A Trade control must not save without an administrator reason."
    );
    await reason.fill("bad");
    assert.equal(
      await firstControl.isDisabled(),
      true,
      "A too-short reason must not enable a settings save."
    );
    await reason.fill("");
    const states = new Map<string, boolean>();
    for (const name of GLOBAL_SWITCHES) {
      const control = page.getByRole("switch", { name });
      await control.waitFor({ timeout: 10_000 });
      states.set(name, (await control.getAttribute("aria-checked")) === "true");
    }

    for (const name of GLOBAL_SWITCHES) {
      const control = page.getByRole("switch", { name });
      for (const desired of [false, true]) {
        const current = (await control.getAttribute("aria-checked")) === "true";
        if (current !== desired) {
          await reason.fill(
            `Isolated browser persistence test: ${name} ${desired ? "ON" : "OFF"}`
          );
          await control.click();
          await waitForStatus(page);
          await control.waitFor({ state: "visible" });
          assert.equal(
            (await control.getAttribute("aria-checked")) === "true",
            desired,
            `${name} did not reflect the freshly read saved value.`
          );
          states.set(name, desired);
        }
        for (const other of GLOBAL_SWITCHES) {
          assert.equal(
            (await page
              .getByRole("switch", { name: other })
              .getAttribute("aria-checked")) === "true",
            states.get(other),
            `Saving ${name} unexpectedly changed independent control ${other}.`
          );
        }
      }
    }
    for (const name of GLOBAL_SWITCHES) {
      assert.equal(
        (await page
          .getByRole("switch", { name })
          .getAttribute("aria-checked")) === "true",
        true,
        `${name} did not remain enabled alongside the other independent controls.`
      );
    }
    let databaseFailureReported = false;
    if (input.beforeDatabaseFailure) {
      await input.beforeDatabaseFailure();
      try {
        const control = page.getByRole("switch", { name: "Randomized timing" });
        await reason.fill("Force a disposable database write failure");
        await control.click();
        const panel = page.getByRole("region", {
          name: "Global Trade master controls",
        });
        await panel.getByRole("alert").waitFor({ timeout: 10_000 });
        assert.equal(
          await panel.getByRole("status").count(),
          0,
          "A failed database write must not show the success notification."
        );
        assert.equal(
          (await control.getAttribute("aria-checked")) === "true",
          true,
          "A failed save must not make the UI show an unpersisted value as saved."
        );
        databaseFailureReported = true;
      } finally {
        await input.afterDatabaseFailure?.();
      }
    }
    return {
      testedSwitches: [...GLOBAL_SWITCHES],
      independentSwitchesCoexist: true,
      readBackConfirmed: true,
      invalidReasonBlocked: true,
      databaseFailureReported,
    };
  } finally {
    await browser.close();
  }
}

export async function verifyCustomerPopupInBrowser(input: {
  baseUrl: string;
  email: string;
  password: string;
  expectedCompanyName?: string | null;
  expectedOpportunityId?: number;
}) {
  const { browser, page } = await launchAuthenticatedPage(
    input.baseUrl,
    "/api/customer/login",
    input.email,
    input.password
  );
  try {
    const opportunityApiResponse = page.waitForResponse(
      response =>
        response.url().includes("/api/trpc/customer.opportunities") &&
        response.status() === 200,
      { timeout: 20_000 }
    );
    await page.goto(`${input.baseUrl}/customer`, {
      waitUntil: "domcontentloaded",
    });
    const liveApiResponse = await opportunityApiResponse;
    const liveApiPayload = await liveApiResponse.text();
    if (input.expectedCompanyName) {
      assert.ok(
        liveApiPayload.includes(input.expectedCompanyName),
        "The authenticated customer.opportunities API response did not contain the generated company record."
      );
    }
    if (input.expectedOpportunityId) {
      assert.ok(
        liveApiPayload.includes(String(input.expectedOpportunityId)),
        "The authenticated customer.opportunities API response did not contain the generated opportunity id."
      );
    }
    const alert = page.getByRole("region", {
      name: "Customer opportunity alert",
    });
    await alert.waitFor({ state: "visible", timeout: 20_000 });
    await alert
      .getByText(
        "Informational notice only. It does not execute a trade, allocate capital, or change a wallet balance.",
        { exact: true }
      )
      .waitFor();
    if (input.expectedCompanyName)
      await alert
        .getByText(input.expectedCompanyName, { exact: false })
        .first()
        .waitFor();
    const text = await alert.innerText();
    await alert.getByRole("button", { name: "Dismiss notification" }).click();
    await alert.waitFor({ state: "hidden", timeout: 10_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6_000);
    assert.equal(
      await alert.count(),
      0,
      "The acknowledged customer popup reappeared after refresh."
    );
    return {
      authenticatedApiReturnedOpportunity: true,
      popupRendered: true,
      acknowledgedByDismissal: true,
      disclaimerVisible: true,
      companyName: input.expectedCompanyName ?? null,
      popupText: text,
    };
  } finally {
    await browser.close();
  }
}
