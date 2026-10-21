import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

describe("expired announcement retry behavior", () => {
  const start = db.indexOf("export async function broadcastCustomerNotification(");
  const end = db.indexOf("export async function retryNotificationCampaign(", start);
  const broadcast = db.slice(start, end);

  it("checks the persisted campaign before applying the new-campaign deadline guard", () => {
    const lookup = broadcast.indexOf(
      "let campaign=(await db.select().from(notificationCampaigns)",
    );
    const createBranch = broadcast.indexOf("if(!campaign) {", lookup);
    const deadlineGuard = broadcast.indexOf(
      'if(expiresAt && expiresAt.getTime()<=now.getTime())throw new RangeError("Announcement expiry must be in the future")',
    );

    expect(lookup).toBeGreaterThanOrEqual(0);
    expect(createBranch).toBeGreaterThan(lookup);
    expect(deadlineGuard).toBeGreaterThan(createBranch);
  });

  it("returns an already-expired campaign idempotently without entering delivery retry", () => {
    const expiryGuard = broadcast.indexOf('if(campaign.status==="expired") {');
    const terminalReturn = broadcast.indexOf('status:"expired" as const', expiryGuard);
    const cleanupTransaction = broadcast.indexOf("await db.transaction(async tx=>", expiryGuard);
    const staleDeliveryCleanup = broadcast.indexOf('tx.update(notificationCampaignDeliveries).set({status:"expired"})', cleanupTransaction);
    const pendingDeliveryQuery = broadcast.indexOf("const pending=await db.select");

    expect(expiryGuard).toBeGreaterThanOrEqual(0);
    expect(cleanupTransaction).toBeGreaterThan(expiryGuard);
    expect(staleDeliveryCleanup).toBeGreaterThan(cleanupTransaction);
    expect(terminalReturn).toBeGreaterThan(staleDeliveryCleanup);
    expect(terminalReturn).toBeLessThan(pendingDeliveryQuery);
    expect(broadcast).not.toContain('if(campaign.status==="expired")throw new Error("Expired announcement campaigns cannot be republished")');
  });

  it("atomically expires an existing campaign and retryable deliveries before delivery retry begins", () => {
    const expiryBranch = broadcast.indexOf("if(campaign.expiresAt && campaign.expiresAt.getTime()<=now.getTime())");
    const transaction = broadcast.indexOf("const expiredTransition=await db.transaction(async tx=>", expiryBranch);
    const campaignTransition = broadcast.indexOf('tx.update(notificationCampaigns).set({status:"expired"})', transaction);
    const deliveryTransition = broadcast.indexOf('tx.update(notificationCampaignDeliveries).set({status:"expired"})', transaction);
    const expiredReturn = broadcast.indexOf('status:"expired" as const', deliveryTransition);
    const pendingDeliveryQuery = broadcast.indexOf("const pending=await db.select", expiryBranch);

    expect(expiryBranch).toBeGreaterThanOrEqual(0);
    expect(transaction).toBeGreaterThan(expiryBranch);
    expect(campaignTransition).toBeGreaterThan(transaction);
    expect(deliveryTransition).toBeGreaterThan(campaignTransition);
    expect(expiredReturn).toBeGreaterThan(deliveryTransition);
    expect(pendingDeliveryQuery).toBeGreaterThan(expiredReturn);
    expect(broadcast).toContain('if(campaign.status==="expired") {');
    expect(broadcast).toContain('tx.update(notificationCampaignDeliveries).set({status:"expired"})');
  });

  it("keeps the periodic lifecycle worker as a retry path for campaigns whose expiry transaction rolls back", () => {
    const lifecycleStart = db.indexOf("export async function processNotificationCampaignLifecycle(");
    const lifecycleEnd = db.indexOf("export async function listAdminNotificationCampaigns(", lifecycleStart);
    const lifecycle = db.slice(lifecycleStart, lifecycleEnd);

    expect(lifecycle).toContain("const changed=await db.transaction(async tx=>");
    expect(lifecycle).toContain('tx.update(notificationCampaigns).set({status:"expired"})');
    expect(lifecycle).toContain('tx.update(notificationCampaignDeliveries).set({status:"expired"})');
    expect(lifecycle).toContain("if(changed)expiredCount++");
  });
});
