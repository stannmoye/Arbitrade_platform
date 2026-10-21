import { afterAll, describe, expect, it } from "vitest";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { and, eq } from "drizzle-orm";
import { appSettings, customerNotifications, notificationCampaignDeliveries, notificationCampaigns, users, v5AuditEvents } from "../drizzle/schema";
import { createContext } from "./_core/context";
import { createLocalSession } from "./_core/localAuth";
import { appRouter } from "./routers";
import { getAppSetting, getDb, getUserById, setAppSetting } from "./db";

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
  let temporaryCampaignId: number | undefined;
  let temporaryNotificationId: number | undefined;

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

    const administrator = await getUserById(administratorId);
    expect(administrator?.role).toBe("admin");
    if (!administrator) throw new Error("Fresh-install administrator fixture is missing");

    const createSessionContext = (userId: number, authVersion: number) =>
      createContext({
        req: {
          headers: {
            cookie: "webdev_app_session=" + createLocalSession(userId, authVersion),
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
        headers: { cookie: "webdev_app_session=" + adminToken },
      });
      expect(adminRead.status).toBe(200);
      const adminPayload = await adminRead.json() as {
        result?: { data?: { json?: { appearance?: unknown } } };
      };
      expect(adminPayload.result?.data?.json?.appearance).toBeDefined();

      const customerRead = await fetch(endpoint + "/adminOperations.settings", {
        headers: { cookie: "webdev_app_session=" + customerToken },
      });
      expect(customerRead.status).toBe(403);

      const customerWrite = await fetch(endpoint + "/adminOperations.updateSettings", {
        method: "POST",
        headers: {
          cookie: "webdev_app_session=" + customerToken,
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
        req: { headers: { cookie: "webdev_app_session=" + createLocalSession(user.id, Number(user.authVersion || 0)) } } as never,
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

  afterAll(async () => {
    if (!enabled) return;
    const db = await getDb();
    if (db && temporaryCampaignId !== undefined) {
      await db.delete(v5AuditEvents).where(and(eq(v5AuditEvents.action, "notification.campaign.withdrawn"), eq(v5AuditEvents.entityId, String(temporaryCampaignId))));
      await db.delete(notificationCampaignDeliveries).where(eq(notificationCampaignDeliveries.campaignId, temporaryCampaignId));
      await db.delete(notificationCampaigns).where(eq(notificationCampaigns.id, temporaryCampaignId));
    }
    if (db && temporaryNotificationId !== undefined) {
      await db.delete(customerNotifications).where(eq(customerNotifications.id, temporaryNotificationId));
    }
    if (temporaryCustomerId !== undefined && db) {
      await db.delete(users).where(eq(users.id, temporaryCustomerId));
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
