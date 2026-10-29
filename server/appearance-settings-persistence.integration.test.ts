import { afterAll, describe, expect, it } from "vitest";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { and, eq, like, or } from "drizzle-orm";
import { appSettings, customerNotifications, notificationCampaignDeliveries, notificationCampaigns, opportunityPackagePolicies, packages, supportAttachments, supportMessages, supportTickets, users, v5AuditEvents } from "../drizzle/schema";
import { createContext } from "./_core/context";
import { createLocalSession } from "./_core/localAuth";
import { appRouter } from "./routers";
import { addTicketAttachment, getAppSetting, getDb, getTicketAttachmentAccess, getTicketUploadPolicy, getUserById, setAppSetting } from "./db";
import { isAllowedAttachmentRequest } from "./_core/attachmentPolicy";

// This suite is intentionally opt-in: ordinary unit-test runs must never write
// to a developer's configured database. CI enables it only after provisioning
// the disposable fresh-install MariaDB fixture.
const enabled = process.env.RUN_APPEARANCE_SETTINGS_DB_INTEGRATION === "1";
const missingValue = `__stage2_missing_${Date.now()}_${Math.random().toString(36).slice(2)}__`;
const administratorId = 1;

describe.skipIf(!enabled)("administrator appearance settings database integration", () => {
  const admin = appRouter.createCaller({
    user: { id: administratorId, role: "admin" },
  } as never);
  const customer = appRouter.createCaller({
    user: { id: 9002, role: "customer" },
  } as never);

  let previousValue: string | undefined;
  let temporaryCustomerId: number | undefined;
  const temporaryCustomerIds: number[] = [];
  let temporaryTicketId: number | undefined;
  let temporaryTicketNumber: string | undefined;
  let temporaryCampaignId: number | undefined;
  let temporaryNotificationId: number | undefined;
  let temporaryTradingPackageId: number | undefined;

  it("resolves signed browser sessions against database roles before authorizing settings", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database is not available");

    const unique = Date.now().toString() + "_" + Math.random().toString(36).slice(2, 9);
    const insert = await db.insert(users).values({
      openId: "stage2:session:" + unique,
      email: "stage2-session-" + unique + "@example.test",
      name: "Stage 2 Session Customer",
      loginMethod: "email",
      role: "user",
    });
    temporaryCustomerId = Number(insert[0].insertId);
    temporaryCustomerIds.push(temporaryCustomerId);

    const administrator = await getUserById(administratorId);
    expect(administrator?.role).toBe("admin");
    if (!administrator) throw new Error("Fresh-install administrator fixture is missing");

    const createSessionContext = (userId: number, authVersion: number) =>
      createContext({
        req: {
          headers: {
            cookie: "arbitrade_app_session=" + createLocalSession(userId, authVersion),
          },
        } as never,
        res: {} as never,
      });

    const adminContext = await createSessionContext(
      administrator.id,
      Number(administrator.authVersion || 0),
    );
    expect(adminContext.user?.id).toBe(administrator.id);
    expect(adminContext.user?.role).toBe("admin");
    await expect(appRouter.createCaller(adminContext).adminOperations.settings()).resolves.toBeDefined();

    const customer = await getUserById(temporaryCustomerId);
    expect(customer?.role).toBe("user");
    if (!customer) throw new Error("Temporary customer session fixture is missing");
    const customerContext = await createSessionContext(
      customer.id,
      Number(customer.authVersion || 0),
    );
    expect(customerContext.user?.id).toBe(customer.id);
    expect(customerContext.user?.role).toBe("user");

    await expect(
      appRouter.createCaller(customerContext).adminOperations.settings(),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      appRouter.createCaller(customerContext).adminOperations.updateSettings({
        appearance: {
          defaultTheme: "original",
          enabledThemes: ["original"],
          customerCanSelect: false,
        },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Exercise the production tRPC router/context through a real local HTTP adapter,
    // while keeping the disposable database and test server isolated from deployment.
    const httpApp = express();
    httpApp.use(express.json());
    httpApp.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
    const server = httpApp.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Could not resolve the isolated tRPC test server address");
      }
      const endpoint = "http://127.0.0.1:" + address.port + "/api/trpc";
      const adminToken = createLocalSession(
        administrator.id,
        Number(administrator.authVersion || 0),
      );
      const customerToken = createLocalSession(
        customer.id,
        Number(customer.authVersion || 0),
      );

      const adminRead = await fetch(endpoint + "/adminOperations.settings", {
        headers: { cookie: "arbitrade_app_session=" + adminToken },
      });
      expect(adminRead.status).toBe(200);
      const adminPayload = await adminRead.json() as {
        result?: { data?: { json?: { appearance?: unknown } } };
      };
      expect(adminPayload.result?.data?.json?.appearance).toBeDefined();

      const customerRead = await fetch(endpoint + "/adminOperations.settings", {
        headers: { cookie: "arbitrade_app_session=" + customerToken },
      });
      expect(customerRead.status).toBe(403);

      const customerWrite = await fetch(endpoint + "/adminOperations.updateSettings", {
        method: "POST",
        headers: {
          cookie: "arbitrade_app_session=" + customerToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          json: {
            appearance: {
              defaultTheme: "original",
              enabledThemes: ["original"],
              customerCanSelect: false,
            },
          },
        }),
      });
      expect(customerWrite.status).toBe(403);

      const anonymousRead = await fetch(endpoint + "/adminOperations.settings");
      expect(anonymousRead.status).toBe(403);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      });
    }
  });

  it("persists and versions a full Trading tier policy, audits the change, and rejects customer writes", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database is not available");
    const rows = await admin.adminOperations.packagePolicies();
    expect(rows.length).toBeGreaterThan(0);
    const before = rows[0] as any;
    const partialPolicy = (row: any, overrides: any = {}) => ({
      packageName: row.packageName,
      maxPopupsPerDay: Number(row.maxPopupsPerDay),
      maxVisibleOffers: Number(row.maxVisibleOffers),
      minimumTradeUnits: Number(row.minimumTradeUnits),
      maximumTradeUnits: Number(row.maximumTradeUnits),
      minHourlyTarget: Number(row.minHourlyTarget),
      normalHourlyTarget: Number(row.normalHourlyTarget),
      marketInfluenceBps: Number(row.marketInfluenceBps),
      burstEnabled: Boolean(row.burstEnabled),
      maxBurstSize: Number(row.maxBurstSize),
      ...overrides,
    });
    const nextVisibleOffers = Number(before.maxVisibleOffers) >= 10000
      ? Number(before.maxVisibleOffers) - 1
      : Number(before.maxVisibleOffers) + 1;
    const reason = "Part 1 Trading policy integration " + Date.now();
    let updateCommitted = false;

    try {
      // Exercise a true partial update: advanced settings are omitted and must
      // be preserved from the locked persisted row.
      const saved = await admin.adminOperations.updatePackagePolicies({
        policies: [partialPolicy(before, { maxVisibleOffers: nextVisibleOffers })],
        reason,
      });
      updateCommitted = true;
      const persisted = saved.find((row: any) => row.packageName === before.packageName) as any;
      expect(persisted).toBeDefined();
      expect(persisted.maxVisibleOffers).toBe(nextVisibleOffers);
      for (const field of ["enabled", "automaticDelivery", "automaticTradingEnabled", "dailyPopupTarget", "schedulingPeriod", "popupDisplayTargetSeconds", "completionDisplaySeconds", "maxSettlementAttempts", "maxTradeAttemptsPerDay", "settlementConfirmationState", "minimumPayoutRateBps", "maximumPayoutRateBps", "minimumTradeDurationSeconds", "maximumTradeDurationSeconds", "companyRotationCountryNames"]) {
        expect(persisted[field], field).toEqual(before[field]);
      }
      expect(Number(persisted.policyVersion)).toBe(Number(before.policyVersion || 0) + 1);

      const auditRows = await db.select().from(v5AuditEvents).where(and(
        eq(v5AuditEvents.action, "trading_opportunity_package_policy_updated"),
        eq(v5AuditEvents.reason, reason),
      ));
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0].actorUserId).toBe(administratorId);
      expect(auditRows[0].entityType).toBe("trading_package_policy");
      expect(auditRows[0].reference).toContain(before.packageName);
      expect(auditRows[0].metadataJson).toContain('"previousPolicy"');
      expect(auditRows[0].metadataJson).toContain('"nextPolicy"');
      const auditMetadata = JSON.parse(String(auditRows[0].metadataJson));
      expect(auditMetadata.previousPolicy.maxVisibleOffers).toBe(before.maxVisibleOffers);
      expect(auditMetadata.nextPolicy.maxVisibleOffers).toBe(nextVisibleOffers);
      expect(auditMetadata.policyVersion).toBe(Number(persisted.policyVersion));
      expect(auditRows[0].reason).toBe(reason);

      await expect(customer.adminOperations.updatePackagePolicies({
        policies: [partialPolicy(persisted, { maxVisibleOffers: Number(persisted.maxVisibleOffers) + 1 })],
        reason: "Customer must not change Trading policy",
      })).rejects.toMatchObject({ code: "FORBIDDEN" });

      const afterRejectedWrite = await admin.adminOperations.packagePolicies();
      const unchanged = afterRejectedWrite.find((row: any) => row.packageName === before.packageName) as any;
      expect(unchanged.maxVisibleOffers).toBe(nextVisibleOffers);
      expect(Number(unchanged.policyVersion)).toBe(Number(persisted.policyVersion));

      await expect(admin.adminOperations.updatePackagePolicies({
        policies: [
          partialPolicy(unchanged, { maxVisibleOffers: Number(unchanged.maxVisibleOffers) + 1 }),
          partialPolicy(unchanged, { maxVisibleOffers: Number(unchanged.maxVisibleOffers) + 2 }),
        ],
        reason: "Reject duplicate tier rows " + Date.now(),
      })).rejects.toThrow("Each Trading tier may appear only once in a policy update");
      const afterDuplicate = (await admin.adminOperations.packagePolicies()).find((row: any) => row.packageName === before.packageName) as any;
      expect(afterDuplicate.maxVisibleOffers).toBe(nextVisibleOffers);
      expect(Number(afterDuplicate.policyVersion)).toBe(Number(persisted.policyVersion));

      await expect(admin.adminOperations.updatePackagePolicies({
        policies: [
          partialPolicy(unchanged, { maxVisibleOffers: Number(unchanged.maxVisibleOffers) + 1 }),
          partialPolicy(unchanged, { packageName: "__unknown_disposable_tier_" + Date.now() }),
        ],
        reason: "Reject unknown tier atomically " + Date.now(),
      })).rejects.toThrow("Opportunity policy references an unknown Trading tier");
      const afterAtomicReject = (await admin.adminOperations.packagePolicies()).find((row: any) => row.packageName === before.packageName) as any;
      expect(afterAtomicReject.maxVisibleOffers).toBe(nextVisibleOffers);
      expect(Number(afterAtomicReject.policyVersion)).toBe(Number(persisted.policyVersion));
    } finally {
      if (updateCommitted) {
        await admin.adminOperations.updatePackagePolicies({
          policies: [partialPolicy(before)],
          reason: "Part 1 integration cleanup " + Date.now(),
        });
      }
    }
  });

  it("persists an administrator policy, reads it back, and rejects customer writes", async () => {
    previousValue = await getAppSetting("appearance.settings", missingValue);
    const policy = {
      defaultTheme: "clean-light" as const,
      enabledThemes: ["original", "clean-light"] as Array<"original" | "clean-light">,
      customerCanSelect: true,
    };

    await admin.adminOperations.updateSettings({ appearance: policy });
    expect(await getAppSetting("appearance.settings")).toBe(JSON.stringify(policy));

    const settings = await admin.adminOperations.settings();
    expect(settings.appearance).toEqual(policy);

    await expect(customer.adminOperations.updateSettings({
      appearance: { ...policy, customerCanSelect: false },
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    // A rejected non-admin mutation must leave the committed database value
    // unchanged, not merely return an authorization error to the caller.
    expect(await getAppSetting("appearance.settings")).toBe(JSON.stringify(policy));
  });

  it("withdraws a persisted campaign as admin and hides it from authenticated customer history, unread count and event cursor", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database is not available");
    const unique = Date.now().toString() + "_" + Math.random().toString(36).slice(2, 9);
    const insertedCustomer = await db.insert(users).values({
      openId: "stage4:withdraw:" + unique,
      email: "stage4-withdraw-" + unique + "@example.test",
      name: "Stage 4 Withdrawal Customer",
      loginMethod: "email",
      role: "user",
    });
    temporaryCustomerId = Number(insertedCustomer[0].insertId);
    temporaryCustomerIds.push(temporaryCustomerId);
    const adminUser = await getUserById(administratorId);
    expect(adminUser?.role).toBe("admin");
    if (!adminUser) throw new Error("Disposable database administrator fixture is missing");

    const eventKey = "stage4-withdraw-" + unique;
    const insertedCampaign = await db.insert(notificationCampaigns).values({
      createdBy: adminUser.id,
      eventKey,
      title: "Disposable withdrawal test campaign",
      body: "This campaign is created only in the disposable integration database.",
      category: "announcement",
      priority: "normal",
      targetUserId: temporaryCustomerId,
      status: "published",
      totalRecipientCount: 1,
    });
    temporaryCampaignId = Number(insertedCampaign[0].insertId);
    const insertedNotification = await db.insert(customerNotifications).values({
      userId: temporaryCustomerId,
      title: "Disposable campaign notice",
      body: "Integration fixture",
      eventKey: "stage4-withdraw-notice-" + unique,
      category: "announcement",
      priority: "normal",
    });
    temporaryNotificationId = Number(insertedNotification[0].insertId);
    await db.insert(notificationCampaignDeliveries).values({
      campaignId: temporaryCampaignId,
      userId: temporaryCustomerId,
      notificationId: temporaryNotificationId,
      status: "delivered",
    });

    const signedCaller = async (userId: number) => {
      const user = await getUserById(userId);
      if (!user) throw new Error("Signed-session fixture user is missing");
      const context = await createContext({
        req: { headers: { cookie: "arbitrade_app_session=" + createLocalSession(user.id, Number(user.authVersion || 0)) } } as never,
        res: {} as never,
      });
      return appRouter.createCaller(context);
    };
    const adminCaller = await signedCaller(adminUser.id);
    const customerCaller = await signedCaller(temporaryCustomerId);
    expect(await customerCaller.customer.notificationUnreadCount()).toBe(1);
    expect((await customerCaller.customer.notificationHistory({ limit: 10 })).items.map(item => item.id)).toContain(temporaryNotificationId);
    expect((await customerCaller.customer.notificationEventCursor()).map(item => item.id)).toContain(temporaryNotificationId);

    await expect(customerCaller.adminOperations.withdrawAnnouncement({ campaignId: temporaryCampaignId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(adminCaller.adminOperations.withdrawAnnouncement({ campaignId: temporaryCampaignId })).resolves.toMatchObject({ changed: true, status: "withdrawn" });
    await expect(adminCaller.adminOperations.withdrawAnnouncement({ campaignId: temporaryCampaignId })).resolves.toMatchObject({ changed: false, status: "withdrawn" });
    await expect(adminCaller.adminOperations.retryAnnouncement({ campaignId: temporaryCampaignId })).rejects.toThrow("Withdrawn announcement campaigns cannot be republished");
    expect(await customerCaller.customer.notificationUnreadCount()).toBe(0);
    expect((await customerCaller.customer.notificationHistory({ limit: 10 })).items.map(item => item.id)).not.toContain(temporaryNotificationId);
    expect((await customerCaller.customer.notificationEventCursor()).map(item => item.id)).not.toContain(temporaryNotificationId);
    const [delivery] = await db.select().from(notificationCampaignDeliveries).where(eq(notificationCampaignDeliveries.campaignId, temporaryCampaignId));
    expect(delivery?.status).toBe("delivered");
  });


  it("exercises authenticated support-ticket ownership and administrator assignment against the disposable database", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database is not available");
    const unique = Date.now().toString() + "_" + Math.random().toString(36).slice(2, 9);
    const insertedOwner = await db.insert(users).values({
      openId: "stage4:ticket-owner:" + unique,
      email: "stage4-ticket-owner-" + unique + "@example.test",
      name: "Stage 4 Ticket Owner",
      loginMethod: "email",
      role: "user",
    });
    const ownerId = Number(insertedOwner[0].insertId);
    temporaryCustomerId = ownerId;
    temporaryCustomerIds.push(ownerId);
    const insertedOther = await db.insert(users).values({
      openId: "stage4:ticket-other:" + unique,
      email: "stage4-ticket-other-" + unique + "@example.test",
      name: "Stage 4 Other Customer",
      loginMethod: "email",
      role: "user",
    });
    const otherId = Number(insertedOther[0].insertId);
    temporaryCustomerIds.push(otherId);

    const administrator = await getUserById(administratorId);
    expect(administrator?.role).toBe("admin");
    if (!administrator) throw new Error("Disposable database administrator fixture is missing");

    const signedCaller = async (userId: number) => {
      const user = await getUserById(userId);
      if (!user) throw new Error("Signed-session fixture user is missing");
      const context = await createContext({
        req: { headers: { cookie: "arbitrade_app_session=" + createLocalSession(user.id, Number(user.authVersion || 0)) } } as never,
        res: {} as never,
      });
      return appRouter.createCaller(context);
    };
    const ownerCaller = await signedCaller(ownerId);
    const otherCaller = await signedCaller(otherId);
    const adminCaller = await signedCaller(administrator.id);

    const created = await ownerCaller.customer.createTicket({
      subject: "Stage 4 assignment integration " + unique,
      body: "Disposable authenticated support-ticket integration fixture.",
      category: "technical",
      priority: "high",
    });
    temporaryTicketId = created.ticketId;
    temporaryTicketNumber = created.ticketNumber;

    // Exercise the persisted attachment-to-ticket ownership path against the
    // disposable database without calling an external storage provider.
    const uploadPolicy = await getTicketUploadPolicy();
    const candidates = [
      { fileName: "stage4-fixture.pdf", mimeType: "application/pdf" },
      { fileName: "stage4-fixture.png", mimeType: "image/png" },
      { fileName: "stage4-fixture.jpg", mimeType: "image/jpeg" },
      { fileName: "stage4-fixture.txt", mimeType: "text/plain" },
      { fileName: "stage4-fixture.csv", mimeType: "text/csv" },
      { fileName: "stage4-fixture.json", mimeType: "application/json" },
      { fileName: "stage4-fixture.gif", mimeType: "image/gif" },
      { fileName: "stage4-fixture.webp", mimeType: "image/webp" },
    ];
    const attachmentCandidate = candidates.find(candidate =>
      isAllowedAttachmentRequest({ ...candidate, sizeBytes: 1 }, uploadPolicy),
    );
    if (!attachmentCandidate) throw new Error("The disposable upload policy has no supported integration-test fixture type");
    const storageKey = `support/${temporaryTicketId}/${"a".repeat(48)}-${attachmentCandidate.fileName}`;
    await addTicketAttachment(ownerId, {
      ticketId: temporaryTicketId,
      ...attachmentCandidate,
      sizeBytes: 1,
      storageKey,
    });
    await expect(getTicketAttachmentAccess(storageKey)).resolves.toMatchObject({
      ticketId: temporaryTicketId,
      customerId: ownerId,
    });
    await expect(addTicketAttachment(otherId, {
      ticketId: temporaryTicketId,
      ...attachmentCandidate,
      sizeBytes: 1,
      storageKey: `support/${temporaryTicketId}/${"b".repeat(48)}-${attachmentCandidate.fileName}`,
    })).rejects.toThrow("Ticket not found");

    expect((await ownerCaller.customer.tickets()).map(ticket => ticket.id)).toContain(temporaryTicketId);
    expect((await ownerCaller.customer.ticketMessages({ ticketId: temporaryTicketId })).map(message => message.body)).toContain("Disposable authenticated support-ticket integration fixture.");
    await expect(otherCaller.customer.ticketMessages({ ticketId: temporaryTicketId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(otherCaller.customer.replyTicket({ ticketId: temporaryTicketId, body: "Unauthorized cross-account reply" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(ownerCaller.adminOperations.assignTicket({ ticketId: temporaryTicketId, assignedAdminId: administrator.id })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(adminCaller.adminOperations.assignTicket({ ticketId: temporaryTicketId, assignedAdminId: administrator.id })).resolves.toMatchObject({
      success: true,
      changed: true,
      assignedAdminId: administrator.id,
    });
    await expect(adminCaller.adminOperations.assignTicket({ ticketId: temporaryTicketId, assignedAdminId: administrator.id })).resolves.toMatchObject({
      success: true,
      changed: false,
      assignedAdminId: administrator.id,
    });

    const [persistedTicket] = await db.select().from(supportTickets).where(eq(supportTickets.id, temporaryTicketId));
    expect(persistedTicket?.assignedAdminId).toBe(administrator.id);
    const auditRows = await db.select().from(v5AuditEvents).where(and(
      eq(v5AuditEvents.action, "support.ticket.assigned"),
      eq(v5AuditEvents.entityId, String(temporaryTicketId)),
    ));
    expect(auditRows).toHaveLength(1);
    expect((await adminCaller.adminOperations.tickets()).find(ticket => ticket.id === temporaryTicketId)?.assignedAdminId).toBe(administrator.id);

    await expect(adminCaller.adminOperations.replyTicket({
      ticketId: temporaryTicketId,
      body: "Administrator resolution response",
      status: "resolved",
    })).resolves.toMatchObject({ success: true });
    await expect(ownerCaller.customer.replyTicket({
      ticketId: temporaryTicketId,
      body: "Reply before reopening",
    })).rejects.toThrow("Resolved or closed tickets must be reopened before a customer reply");

    await expect(ownerCaller.customer.reopenTicket({ ticketId: temporaryTicketId })).resolves.toMatchObject({
      success: true,
      changed: true,
      status: "open",
    });
    await expect(ownerCaller.customer.replyTicket({
      ticketId: temporaryTicketId,
      body: "Customer reply after reopening",
    })).resolves.toMatchObject({ success: true });

    const [reopenedTicket] = await db.select().from(supportTickets).where(eq(supportTickets.id, temporaryTicketId));
    expect(reopenedTicket?.status).toBe("open");
    const messages = await ownerCaller.customer.ticketMessages({ ticketId: temporaryTicketId });
    expect(messages.map(message => message.body)).toContain("Administrator resolution response");
    expect(messages.map(message => message.body)).toContain("Customer reply after reopening");
  });

  it("creates, edits, reloads, and audits Trading tier terms only for administrators", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database is not available");
    const suffix = Date.now().toString() + "_" + Math.random().toString(36).slice(2, 8);
    const name = "Part1 disposable tier " + suffix;
    const reasonCreate = "Disposable Part 1 tier creation " + suffix;
    const reasonUpdate = "Disposable Part 1 tier edit " + suffix;
    const startsAt = new Date(Math.floor((Date.now() + 60_000) / 1000) * 1000);
    const expiresAt = new Date(startsAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    let created = false;

    try {
      const beforeCount = (await admin.adminOperations.tradingPackages()).length;
      await expect(customer.adminOperations.createTradingPackage({
        name, minimumQualifyingBalanceUsdMinor: 12345, durationMonths: 3,
        opportunitiesPerDay: 7, maxPopupsPerDay: 8, maxActiveInvestments: 2,
        startsAt: null, expiresAt: null, enabled: false, reason: reasonCreate,
      })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect((await admin.adminOperations.tradingPackages()).length).toBe(beforeCount);

      await expect(admin.adminOperations.createTradingPackage({
        name, minimumQualifyingBalanceUsdMinor: 0, durationMonths: 3,
        opportunitiesPerDay: 7, maxPopupsPerDay: 8, maxActiveInvestments: 2,
        startsAt: null, expiresAt: null, enabled: false, reason: reasonCreate,
      })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(admin.adminOperations.createTradingPackage({
        name, minimumQualifyingBalanceUsdMinor: 12345, durationMonths: 3,
        opportunitiesPerDay: 7, maxPopupsPerDay: 8, maxActiveInvestments: 2,
        startsAt: expiresAt.toISOString(), expiresAt: startsAt.toISOString(),
        enabled: false, reason: reasonCreate,
      })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect((await admin.adminOperations.tradingPackages()).length).toBe(beforeCount);

      const createdPackage = await admin.adminOperations.createTradingPackage({
        name, minimumQualifyingBalanceUsdMinor: 12345, durationMonths: 3,
        opportunitiesPerDay: 7, maxPopupsPerDay: 8, maxActiveInvestments: 2,
        startsAt: null, expiresAt: null, enabled: false, reason: reasonCreate,
      });
      temporaryTradingPackageId = createdPackage.id;
      created = true;
      expect(createdPackage).toMatchObject({
        name, minimumQualifyingBalanceUsdMinor: 12345, durationMonths: 3,
        opportunitiesPerDay: 7, maxPopupsPerDay: 8, maxActiveInvestments: 2,
        enabled: false, termsVersion: 1,
      });

      const afterCreate = await admin.adminOperations.tradingPackages();
      expect(afterCreate.find((row: any) => row.id === createdPackage.id)).toMatchObject({
        name, minimumQualifyingBalanceUsdMinor: 12345, durationMonths: 3,
        opportunitiesPerDay: 7, maxPopupsPerDay: 8, maxActiveInvestments: 2,
        enabled: false, termsVersion: 1,
      });
      const [persistedCreate] = await db.select().from(packages).where(eq(packages.id, createdPackage.id));
      expect(persistedCreate).toMatchObject({
        name, minimumQualifyingBalanceUsdMinor: 12345, durationMonths: 3,
        opportunitiesPerDay: 7, maxPopupsPerDay: 8, maxActiveInvestments: 2,
        enabled: false, termsVersion: 1,
      });

      await expect(customer.adminOperations.updateTradingPackage({
        id: createdPackage.id, name, minimumQualifyingBalanceUsdMinor: 22345,
        durationMonths: 4, opportunitiesPerDay: 9, maxPopupsPerDay: 10,
        maxActiveInvestments: 3, startsAt: startsAt.toISOString(),
        expiresAt: expiresAt.toISOString(), enabled: true, reason: reasonUpdate,
      })).rejects.toMatchObject({ code: "FORBIDDEN" });

      await expect(admin.adminOperations.updateTradingPackage({
        id: createdPackage.id, name, minimumQualifyingBalanceUsdMinor: 22345,
        durationMonths: 4, opportunitiesPerDay: 9, maxPopupsPerDay: 10,
        maxActiveInvestments: 3, startsAt: expiresAt.toISOString(),
        expiresAt: startsAt.toISOString(), enabled: true,
        reason: "Reject invalid effective dates " + suffix,
      })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      const [unchangedAfterInvalidUpdate] = await db.select().from(packages).where(eq(packages.id, createdPackage.id));
      expect(unchangedAfterInvalidUpdate).toMatchObject({
        minimumQualifyingBalanceUsdMinor: 12345, durationMonths: 3,
        opportunitiesPerDay: 7, maxPopupsPerDay: 8, maxActiveInvestments: 2,
        enabled: false, termsVersion: 1,
      });

      const updatedPackage = await admin.adminOperations.updateTradingPackage({
        id: createdPackage.id, name, minimumQualifyingBalanceUsdMinor: 22345,
        durationMonths: 4, opportunitiesPerDay: 9, maxPopupsPerDay: 10,
        maxActiveInvestments: 3, startsAt: startsAt.toISOString(),
        expiresAt: expiresAt.toISOString(), enabled: true, reason: reasonUpdate,
      });
      expect(updatedPackage).toMatchObject({
        id: createdPackage.id, name, minimumQualifyingBalanceUsdMinor: 22345,
        durationMonths: 4, opportunitiesPerDay: 9, maxPopupsPerDay: 10,
        maxActiveInvestments: 3, enabled: true, termsVersion: 2,
      });
      expect(new Date(updatedPackage.startsAt as unknown as string).getTime()).toBe(startsAt.getTime());
      expect(new Date(updatedPackage.expiresAt as unknown as string).getTime()).toBe(expiresAt.getTime());

      const reloaded = (await admin.adminOperations.tradingPackages()).find((row: any) => row.id === createdPackage.id) as any;
      expect(reloaded).toMatchObject({
        id: createdPackage.id, name, minimumQualifyingBalanceUsdMinor: 22345,
        durationMonths: 4, opportunitiesPerDay: 9, maxPopupsPerDay: 10,
        maxActiveInvestments: 3, enabled: true, termsVersion: 2,
      });
      expect(new Date(reloaded.startsAt).getTime()).toBe(startsAt.getTime());
      expect(new Date(reloaded.expiresAt).getTime()).toBe(expiresAt.getTime());

      const [persistedUpdate] = await db.select().from(packages).where(eq(packages.id, createdPackage.id));
      expect(persistedUpdate).toMatchObject({
        name, minimumQualifyingBalanceUsdMinor: 22345, durationMonths: 4,
        opportunitiesPerDay: 9, maxPopupsPerDay: 10, maxActiveInvestments: 3,
        enabled: true, termsVersion: 2,
      });
      expect(new Date(persistedUpdate.startsAt as Date).getTime()).toBe(startsAt.getTime());
      expect(new Date(persistedUpdate.expiresAt as Date).getTime()).toBe(expiresAt.getTime());

      const [policy] = await db.select().from(opportunityPackagePolicies).where(eq(opportunityPackagePolicies.packageName, name));
      expect(policy).toBeDefined();
      const auditRows = await db.select().from(v5AuditEvents).where(and(
        eq(v5AuditEvents.entityType, "trading_package"),
        eq(v5AuditEvents.entityId, String(createdPackage.id)),
      ));
      expect(auditRows.map(row => row.action)).toEqual(expect.arrayContaining([
        "trading_package_created", "trading_package_terms_updated",
      ]));
      const createAudit = auditRows.find(row => row.action === "trading_package_created");
      const updateAudit = auditRows.find(row => row.action === "trading_package_terms_updated");
      expect(createAudit?.actorUserId).toBe(administratorId);
      expect(createAudit?.reason).toBe(reasonCreate);
      expect(createAudit?.metadataJson).toContain('"minimumQualifyingBalanceUsdMinor":12345');
      expect(updateAudit?.actorUserId).toBe(administratorId);
      expect(updateAudit?.reason).toBe(reasonUpdate);
      expect(updateAudit?.metadataJson).toContain('"old"');
      expect(updateAudit?.metadataJson).toContain('"new"');
    } finally {
      if (!created) {
        const [orphan] = await db.select({ id: packages.id }).from(packages).where(eq(packages.name, name));
        if (orphan) temporaryTradingPackageId = orphan.id;
      }
    }
  });

  afterAll(async () => {
    if (!enabled) return;
    const db = await getDb();
    if (db && temporaryTradingPackageId !== undefined) {
      await db.delete(v5AuditEvents).where(and(
        eq(v5AuditEvents.entityType, "trading_package"),
        eq(v5AuditEvents.entityId, String(temporaryTradingPackageId)),
      ));
      const [pkg] = await db.select({ name: packages.name }).from(packages).where(eq(packages.id, temporaryTradingPackageId));
      if (pkg) await db.delete(opportunityPackagePolicies).where(eq(opportunityPackagePolicies.packageName, pkg.name));
      await db.delete(packages).where(eq(packages.id, temporaryTradingPackageId));
    }
    if (db && temporaryCampaignId !== undefined) {
      await db.delete(v5AuditEvents).where(and(eq(v5AuditEvents.action, "notification.campaign.withdrawn"), eq(v5AuditEvents.entityId, String(temporaryCampaignId))));
      await db.delete(notificationCampaignDeliveries).where(eq(notificationCampaignDeliveries.campaignId, temporaryCampaignId));
      await db.delete(notificationCampaigns).where(eq(notificationCampaigns.id, temporaryCampaignId));
    }
    if (db && temporaryTicketId !== undefined) {
      await db.delete(v5AuditEvents).where(and(
        eq(v5AuditEvents.entityType, "support_ticket"),
        eq(v5AuditEvents.entityId, String(temporaryTicketId)),
      ));
      if (temporaryTicketNumber) {
        await db.delete(customerNotifications).where(or(
          and(eq(customerNotifications.title, "New customer support ticket"), like(customerNotifications.body, temporaryTicketNumber + ":%")),
          and(eq(customerNotifications.title, "Support ticket assigned"), like(customerNotifications.body, temporaryTicketNumber + ":%")),
          and(eq(customerNotifications.title, "Customer replied to a support ticket"), like(customerNotifications.body, temporaryTicketNumber + ":%")),
        ));
      }
      await db.delete(supportAttachments).where(eq(supportAttachments.ticketId, temporaryTicketId));
      await db.delete(supportMessages).where(eq(supportMessages.ticketId, temporaryTicketId));
      await db.delete(supportTickets).where(eq(supportTickets.id, temporaryTicketId));
    }
    if (db && temporaryNotificationId !== undefined) {
      await db.delete(customerNotifications).where(eq(customerNotifications.id, temporaryNotificationId));
    }
    if (db && temporaryCustomerIds.length) {
      await db.delete(customerNotifications).where(or(...temporaryCustomerIds.map(userId => eq(customerNotifications.userId, userId))));
      await db.delete(users).where(or(...temporaryCustomerIds.map(userId => eq(users.id, userId))));
    }
    if (previousValue !== undefined) {
      if (previousValue === missingValue) {
        if (db) await db.delete(appSettings).where(eq(appSettings.settingKey, "appearance.settings"));
      } else {
        await setAppSetting("appearance.settings", previousValue, administratorId);
      }
    }
    await db?.$client.end();
  });
});
