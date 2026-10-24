import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../drizzle/0065_api_access_automation.sql");
const schema = read("../drizzle/schema.ts");
const runner = read("../scripts/apply-portal-migrations.mjs");
const recovery = read("../installer/migration-recovery-status.mjs");
const automation = read("./api-access-automation.ts");
const vault = read("./api-access-vault.ts");
const routes = read("./_core/api-access-routes.ts");
const router = read("./routers.ts");
const server = read("./_core/index.ts");
const customerUi = read("../client/src/components/CustomerApiAccessPanel.tsx");
const adminUi = read("../client/src/components/AdminApiAccessCentre.tsx");

describe("API automation integration contracts", () => {
  it("registers the automation tables in schema and the standalone portal migration paths", () => {
    for (const table of [
      "customer_api_notification_preferences", "customer_api_webhooks", "api_provider_credentials",
      "api_notification_deliveries", "api_platform_incidents", "api_provider_events", "customer_api_usage_daily",
    ]) {
      expect(migration).toContain("CREATE TABLE IF NOT EXISTS `" + table + "`");
      expect(schema).toContain('mysqlTable("' + table + '"');
      expect(runner).toContain('"' + table + '"');
    }
    expect(runner).toContain('"0065_api_access_automation.sql"');
    expect(recovery).toContain('"0065_api_access_automation.sql"');
    // Portal-only migration files must not be appended to the main Drizzle journal bridge.
    expect(read("../drizzle/meta/_journal.json")).not.toContain('"tag": "0065_api_access_automation"');
  });

  it("encrypts provider secrets and never exposes them through configuration status", () => {
    expect(vault).toContain('createCipheriv("aes-256-gcm"');
    expect(vault).toContain('createDecipheriv("aes-256-gcm"');
    expect(vault).toContain("API_ACCESS_ENCRYPTION_KEY");
    expect(vault).toContain("async function apiProviderCredentialStatus");
    expect(vault).toContain("encryptedPayload");
    expect(adminUi).toContain("Save encrypted WhatsApp credentials");
    expect(adminUi).toContain("Save encrypted wallet credentials");
    expect(router).toContain("testWhatsAppProviderConnection: adminProcedure.mutation");
    expect(adminUi).toContain("Test WhatsApp connection");
  });

  it("requires a verified opted-in WhatsApp destination and uses timestamped HMAC webhooks", () => {
    expect(automation).toContain("requestCustomerWhatsAppVerification");
    expect(automation).toContain("verifyCustomerWhatsAppNumber");
    expect(automation).toContain("whatsappVerified");
    expect(automation).toContain("whatsappOptIn");
    expect(automation).toContain('createHmac("sha256"');
    expect(automation).toContain('"X-Arbitrade-Timestamp"');
    expect(automation).toContain('"X-Arbitrade-Signature"');
    expect(automation).toContain("validateWebhookUrl");
    expect(automation).toContain("DELIVERY_INTERRUPTED");
    expect(automation).toContain("dailyReportDeliveryEnabled");
    expect(customerUi).toContain("Send verification code");
    expect(customerUi).toContain("Create webhook");
    expect(customerUi).toContain("Usage and performance");
  });

  it("starts the durable outbox worker and maintains customer-scoped API/report boundaries", () => {
    expect(server).toContain("processApiNotificationOutbox");
    expect(server).toContain("apiAutomationWorker.unref()");
    expect(router).toContain("saveApiAutomationPreferences");
    expect(router).toContain("requestWhatsAppVerification");
    expect(router).toContain("apiUsage: protectedProcedure.query");
    expect(routes).toContain('"/api/v1/account/api-usage"');
    expect(routes).toContain("DEPOSIT_PROVIDER_NOT_CONFIGURED");
    expect(routes).toContain("FEE_LEDGER_NOT_CONFIGURED");
    expect(routes).toContain('completeness: "partial"');
    expect(routes).toContain('"/api/v1/platform/incidents"');
  });
});
