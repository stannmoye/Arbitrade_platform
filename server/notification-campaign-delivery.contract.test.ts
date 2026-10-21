import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const router = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0055_notification_campaign_delivery_tracking.sql", import.meta.url), "utf8");
const withdrawalMigration = readFileSync(new URL("../drizzle/0058_withdrawable_notification_campaigns.sql", import.meta.url), "utf8");
const runner = readFileSync(new URL("../scripts/apply-portal-migrations.mjs", import.meta.url), "utf8");
const recovery = readFileSync(new URL("../installer/migration-recovery-status.mjs", import.meta.url), "utf8");
const migrationAssertions = readFileSync(new URL("../scripts/notification-migration-db-assertions.mjs", import.meta.url), "utf8");
const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const core = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");

describe("Stage 4 announcement campaign delivery persistence", () => {
  it("stores campaigns and per-recipient delivery state with unique campaign-recipient identity", () => {
    expect(schema).toContain('mysqlTable("notification_campaigns"');
    expect(schema).toContain('mysqlTable("notification_campaign_deliveries"');
    expect(schema).toContain('uniqueIndex("notification_campaign_delivery_recipient_uq")');
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `notification_campaigns`");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS `notification_campaign_deliveries`");
    expect(migration).toContain("UNIQUE KEY `notification_campaign_creator_event_uq`");
    expect(migration).toContain("UNIQUE KEY `notification_campaign_delivery_recipient_uq`");
    expect(migration).toContain("enum('draft','scheduled','published','expired','failed')");
  });

  it("rejects conflicting campaign payload retries and records delivery failures separately", () => {
    expect(db).toContain("Announcement event key was already used with a different campaign payload");
    expect(db).toContain('errorCode:"DELIVERY_FAILED"');
    expect(db).toContain('status:"failed"');
    expect(db).toContain("partitionNotificationRecipients(recipients,50)");
    expect(db).toContain("processNotificationCampaignLifecycle");
    expect(db).toContain("Expired announcement campaigns cannot be republished");
  });

  it("exposes bounded campaign history and synchronizes read receipts by recipient", () => {
    expect(router).toContain("announcementHistory: adminProcedure.query(() => listAdminNotificationCampaigns())");
    expect(db).toContain("export async function listAdminNotificationCampaigns()");
    expect(db).toContain('eq(notificationCampaignDeliveries.userId,userId)');
    expect(db).toContain('set({status:"read",readAt:new Date()})');
    expect(router).toContain("retryAnnouncement: adminProcedure.input");
    expect(app).toContain("trpc.adminOperations.announcementHistory.useQuery");
    expect(app).toContain("Retry failed deliveries");
    expect(app).toContain('type="datetime-local"');
    expect(core).toContain("processNotificationCampaignLifecycle");
  });

  it("counts scheduled lifecycle outcomes from the persisted campaign status", () => {
    const lifecycleStart = db.indexOf("export async function processNotificationCampaignLifecycle");
    const lifecycleEnd = db.indexOf("export async function listAdminNotificationCampaigns", lifecycleStart);
    const lifecycle = db.slice(lifecycleStart, lifecycleEnd);
    expect(lifecycle).toContain('if(result.status==="published") published++');
    expect(lifecycle).toContain('else if(result.status==="expired") expiredDuringPublish++');
    expect(lifecycle).toContain('return {expired:expired.length+expiredDuringPublish,published,failed}');
    expect(lifecycle).not.toContain('}); published++;');
  });

  it("registers the forward-only migration in both normal and recovery tooling", () => {
    expect(runner).toContain('"0055_notification_campaign_delivery_tracking.sql"');
    expect(recovery).toContain('"0055_notification_campaign_delivery_tracking.sql"');
    expect(runner).toContain('"0058_withdrawable_notification_campaigns.sql"');
    expect(recovery).toContain('"0058_withdrawable_notification_campaigns.sql"');
    expect(migrationAssertions).toContain("campaignWithdrawalEnumsVerified: true");
  });

  it("withdraws campaigns transactionally, validates the admin, records audit, and retains recipient evidence", () => {
    const start = db.indexOf("export async function withdrawNotificationCampaign(");
    const end = db.indexOf("export async function processNotificationCampaignLifecycle(", start);
    const implementation = db.slice(start, end);
    expect(implementation).toContain("return db.transaction(async tx=>{");
    expect(implementation).toContain('actor.role!=="admin"');
    expect(implementation).toContain('.for("update")');
    expect(implementation).toContain('status:"withdrawn"');
    expect(implementation).toContain('action:"notification.campaign.withdrawn"');
    expect(implementation).toContain('eq(notificationCampaignDeliveries.status,"pending")');
    expect(implementation).toContain('eq(notificationCampaignDeliveries.status,"failed")');
    expect(implementation).toContain('if(campaign.status==="withdrawn")return {success:true,changed:false');
    expect(db).toContain("Withdrawn announcement campaigns cannot be republished");
    expect(db).toContain('inArray(notificationCampaigns.status,["expired","withdrawn"])');
    expect(withdrawalMigration).toContain("'expired','failed','withdrawn'");
    expect(withdrawalMigration).toContain("'failed','expired','withdrawn'");
  });

  it("exposes withdrawal only in the admin router and gives operators a confirmed, status-scoped action", () => {
    expect(router).toContain("withdrawAnnouncement: adminProcedure.input");
    expect(router).toContain("withdrawNotificationCampaign(ctx.user.id,input.campaignId)");
    expect(app).toContain("trpc.adminOperations.withdrawAnnouncement.useMutation");
    expect(app).toContain("Withdraw campaign");
    expect(app).toContain("window.confirm(\"Withdraw this campaign?");
    expect(app).toContain('"draft","scheduled","published","failed"].includes(campaign.status)');
    expect(app).toContain("delivery.withdrawn||0");
  });
});
