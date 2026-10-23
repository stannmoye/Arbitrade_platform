import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const schema = read("../drizzle/schema.ts");
const migration = read("../drizzle/0064_customer_api_keys.sql");
const apiKeys = read("./api-access.ts");
const apiRoutes = read("./_core/api-access-routes.ts");
const router = read("./routers.ts");
const server = read("./_core/index.ts");
const migrationRunner = read("../scripts/apply-portal-migrations.mjs");
const recovery = read("../installer/migration-recovery-status.mjs");
const customerUi = read("../client/src/components/CustomerApiAccessPanel.tsx");
const adminUi = read("../client/src/App.tsx");

describe("customer API access foundation", () => {
  it("declares the key table and registers the additive migration in both portal migration paths", () => {
    expect(schema).toContain('mysqlTable("customer_api_keys"');
    expect(schema).toContain('uniqueIndex("customer_api_keys_hash_uq")');
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `customer_api_keys`");
    expect(migration).toContain("`keyHash` varchar(64) NOT NULL");
    expect(migrationRunner).toContain('"0064_customer_api_keys.sql"');
    expect(recovery).toContain('"0064_customer_api_keys.sql"');
  });

  it("stores only hashed secrets, returns a secret once, caps keys and scopes every key to its owner", () => {
    expect(apiKeys).toContain('crypto.createHash("sha256")');
    expect(apiKeys).toContain('crypto.randomBytes(32).toString("base64url")');
    expect(apiKeys).toContain("MAX_ACTIVE_KEYS_PER_CUSTOMER = 5");
    expect(apiKeys).toContain(".where(eq(customerApiKeys.userId, userId))");
    expect(apiKeys).toContain('.for("update")');
    expect(apiKeys).toContain("keyHash: hashApiKey(secret)");
    expect(apiKeys).toContain('action: "api.key.created"');
    expect(apiKeys).toContain('action: "api.key.revoked"');
    expect(apiKeys).toContain("warning: \"Copy this secret now. It cannot be displayed again.\"");
    expect(apiKeys).not.toContain("keyHash: secret");
  });

  it("exposes customer-only create/list/revoke procedures and read-only scoped REST endpoints", () => {
    expect(router).toContain("apiKeys: protectedProcedure.query");
    expect(router).toContain("createApiKey: protectedProcedure.input");
    expect(router).toContain("revokeApiKey: protectedProcedure.input");
    expect(apiRoutes).toContain('req.header("authorization")');
    expect(apiRoutes).toContain("API_KEY_INVALID");
    expect(apiRoutes).toContain("API_ACCESS_DISABLED");
    expect(apiRoutes).toContain("identity.scopes.includes(scope)");
    expect(apiRoutes).toContain('"/api/v1/account/balances"');
    expect(apiRoutes).toContain('"/api/v1/account/trades"');
    expect(apiRoutes).toContain("requestedLimit > 100");
    expect(apiRoutes).toContain("nextBeforeId");
    expect(apiRoutes).toContain("apiIpRateLimit");
    expect(apiRoutes).toContain('"/api/v1/account/withdrawals"');
    expect(apiRoutes).toContain('"/api/v1/platform/status"');
    expect(server).toContain("registerCustomerApiAccessRoutes(app)");
    expect(apiRoutes).toContain('app.post("/api/v1/webhooks"');
    expect(apiRoutes).not.toContain('app.post("/api/v1/account/withdrawals');
    expect(apiRoutes).not.toContain('app.post("/api/v1/account/withdrawal-requests');
  });

  it("provides customer key controls and admin-editable integration policy and message templates", () => {
    expect(customerUi).toContain("Copy now · shown once");
    expect(customerUi).toContain("Revoke");
    expect(customerUi).toContain("Read permissions only. No key can initiate a withdrawal.");
    expect(adminUi).toContain("saveApiAccessSettings");
    expect(adminUi).toContain("Message template studio");
    expect(adminUi).toContain("WhatsApp Business destination");
    expect(adminUi).toContain("Wallet / deposit provider");
    expect(adminUi).toContain("Secret keys are not stored in these fields");
    expect(adminUi).toContain("Encrypted provider credentials");
  });
});
