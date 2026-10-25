import { COOKIE_NAME } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getCompanyCatalogueById, getCompanyCatalogueSummary, searchCompanyCatalogue } from "./modules/company-catalogue";
import { z } from "zod";
import { communicationSettingsInput, getAdminCommunicationSettings, getCustomerCommunicationOptions, saveAdminCommunicationSettings, validateCommunicationSettingsInput } from "./communicationSettings";
import { TRPCError } from "@trpc/server";
import { ACCOUNT_CLOSURE_TICKET_SUBJECT, AccountClosureDecisionError, applyAccountClosureDecision, assignSupportTicket, createAccountClosureTicket, listSupportAssignees, addTicketAttachment, addTicketMessage, adjustCustomerBalance, broadcastCustomerNotification, listAdminNotificationCampaigns, retryNotificationCampaign, withdrawNotificationCampaign, bulkCreateOpportunityOffers, createAdminCustomer, createNotification, createRiskReport, createTicket, deleteAdminCustomer, getCustomerTicket, getSupportTicketById, getAppSetting, getTradeSettlementPolicy, getTradeFeePolicy, setTradeFeePolicy, getPackageActivationPolicy, setPackageActivationPolicy, listAdminTradingPackages, updateAdminTradingPackage, listCustomerTradingPackages, activateCustomerTradingPackage, getCustomerBalanceSummary, getCustomerWalletPreferences, getCustomerPayoutEligibility, getCustomerAuthenticatorStatus, startCustomerAuthenticatorEnrollment, confirmCustomerAuthenticatorEnrollment, generateCustomerAuthenticatorRecoveryCodes, startCustomerAuthenticatorRecoveryReplacement, startCustomerAuthenticatorReplacement, confirmCustomerAuthenticatorReplacement, createCustomerPayoutRequest, listCustomerPayoutRequests, cancelCustomerPayoutRequest, listAdminPayoutRequests, resolveCustomerPayoutRequest, manuallySettleTrade, listPendingSettlements, markCustomerNotificationsRead, updateCustomerWalletPreferences, getTicketUploadPolicy, setTradeSettlementPolicy, getNotificationCategoryVisibility, getCustomerNotificationUnreadCount, listCustomerNotificationPage, setNotificationCategoryVisibility, getUserById, getUserForSessionRevocation, listAdminCustomers, listAdminAuditEvents, listAdminRecentLedgerActivity, listAllTickets, listBalances, listCurrencies, listCustomerOpportunities, listCustomerSessions, listCustomerTickets, listCustomerNotifications, listNotifications, listNotificationEventCursor, listOpenOffers, listOpportunityPackagePolicies, listRiskReports, listTicketAttachments, listTicketMessages, listTrades, provisionSignupCredit, revokeCustomerSession, reopenSupportTicket, setAppSetting, updateAdminCustomer, updateCustomerControls, updateOpportunityPackagePolicies, upsertCustomerSession, createOpportunityOffer, upsertCurrency } from "./db";
import { allocateStake, cancelStake, getStakeDashboard, projectStake } from "./stakeEarn";
import { closeTransactionConsoleSession, listTransactionConsoleEvents, recordTransactionConsoleEvent, recordTransactionConsolePulse } from "./transactionConsole";
import { getOpportunityLifecycleSummary, runOpportunityRetention, updatePopupLifecycle, updatePopupDeliveryStatus } from "./opportunityLifecycle";
import { confirmEmailVerification, requestEmailVerification } from "./emailAuth";
import { enqueueAdminMessage, getCustomerEmailPreferences, updateCustomerEmailPreferences, sendEmailTest, getDailyDigestSchedule } from "./emailQueue";
import { isEmailDeliveryConfigured } from "./email";
import { ensureCustomerControls } from "./db";
import { adminAuditEvents, adminCustomerDirectory, adminDashboard, adminDecision, adminOverride, adminQueue, getAdminKycSettings, getCenter, issueEmail, issuePhone, recordConsent, recordFace as recordFaceVerification, startStage, submitAddress, submitDocument, updateAdminKycSettings, verifyAuditChain, verifyEmail, verifyPhone } from "./kyc";
import { isEmailAdminConfigured, listEmailRecipients, publicEmailConfig, runDailyEmailReports, saveEmailConfig, sendAdminComposedEmail, testEmailConnection } from "./emailAdmin";
import * as mining from "./mining";
import * as miningAdmin from "./mining-admin";
import { normalizeAppearanceSettings } from "./appearance-settings";
import { ADMIN_BROADCAST_CATEGORIES, buildTradeSettlementNotices } from "./modules/notification-events";
import { isValidSupportAttachmentStorageKey } from "./_core/attachmentPolicy";
import { invalidateUserSessions } from "./authSessions";
import { getLocalSessionFromRequest } from "./_core/localAuth";
import * as privacyService from "./privacy";
import { localIdentityService } from "./_core/localIdentityService";
import { createHeartbeatJob, deleteHeartbeatJob, listHeartbeatJobs, updateHeartbeatJob } from "./_core/heartbeat";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  appearanceConfig: publicProcedure.query(async () =>
    normalizeAppearanceSettings(await getAppSetting("appearance.settings"))
  ),

  companyCatalogue: router({
    summary: publicProcedure.query(() => getCompanyCatalogueSummary()),
    search: publicProcedure.input(z.object({
      search: z.string().trim().max(100).optional(),
      countryCode: z.string().trim().length(2).optional(),
      exchangeCode: z.string().trim().max(32).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }).optional()).query(({ input }) => searchCompanyCatalogue(input ?? {})),
    byId: publicProcedure.input(z.object({
      id: z.string().trim().min(1).max(180),
    })).query(({ input }) => getCompanyCatalogueById(input.id) ?? null),
  }),

  privacy: router({
    currentPolicy: protectedProcedure.query(({ ctx }) => {
      if (ctx.user.role !== "user") throw new TRPCError({ code: "FORBIDDEN", message: "Privacy Centre customer views require a customer account." });
      return privacyService.getCurrentPrivacyPolicy();
    }),
    policyHistory: protectedProcedure.query(({ ctx }) => {
      if (ctx.user.role !== "user") throw new TRPCError({ code: "FORBIDDEN", message: "Privacy Centre customer views require a customer account." });
      return privacyService.getPrivacyPolicyHistory();
    }),
    myRequests: protectedProcedure.query(({ ctx }) => {
      if (ctx.user.role !== "user") throw new TRPCError({ code: "FORBIDDEN", message: "Privacy requests are available to customer accounts." });
      return privacyService.listMyPrivacyRequests(ctx.user.id);
    }),
    createRequest: protectedProcedure.input(z.object({
      requestType: z.enum(["access", "correction", "deletion", "restriction", "objection", "other"]),
      subject: z.string().trim().min(5).max(180),
      details: z.string().max(3000).optional(),
      idempotencyKey: z.string().trim().min(8).max(80),
    })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "user") throw new TRPCError({ code: "FORBIDDEN", message: "Only customer accounts can submit privacy requests." });
      const result = await privacyService.createPrivacyRequest(ctx.user.id, input);
      if (!result.duplicate) {
        try {
          const admins = await privacyService.listAdminPrivacyRequesters();
          await Promise.allSettled(admins.map((admin) => createNotification(
            admin.id,
            "New privacy request",
            "A customer submitted privacy request " + result.requestReference + ". Open Privacy Management to review it.",
            {
              eventKey: "privacy-request-received:" + result.requestReference + ":" + admin.id,
              category: "account",
              priority: "normal",
              href: "/ops-console-7f3a",
            },
          )));
        } catch (error) {
          console.error("[Privacy] Administrator notification failed after request persistence:", error instanceof Error ? error.name : "UnknownError");
        }
      }
      return result;
    }),
    cancelRequest: protectedProcedure.input(z.object({ requestId: z.number().int().positive() })).mutation(({ ctx, input }) => {
      if (ctx.user.role !== "user") throw new TRPCError({ code: "FORBIDDEN", message: "Only the customer can cancel their privacy request." });
      return privacyService.cancelMyPrivacyRequest(ctx.user.id, input.requestId);
    }),
  }),

  auth: router({
    me: publicProcedure.query(opts => {
      if (!opts.ctx.user) return null;
      const { passwordHash: _passwordHash, ...safeUser } = opts.ctx.user;
      return safeUser;
    }),
    requestEmailVerification: protectedProcedure.mutation(({ ctx }) => requestEmailVerification(ctx.user.id)),
    confirmEmailVerification: protectedProcedure.input(z.object({ code: z.string().regex(/^\d{8}$/) })).mutation(({ ctx, input }) => confirmEmailVerification(ctx.user.id, input.code)),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      let user = ctx.user;
      let shouldRevoke = Boolean(ctx.user);

      // Recover a valid token when context construction could not attach its user.
      if (!user) {
        const localSession = getLocalSessionFromRequest(ctx.req);
        if (localSession) {
          const localUser = await getUserById(localSession.userId);
          if (localUser) {
            user = localUser;
            shouldRevoke = localUser.loginMethod !== "closed" &&
              Number(localSession.authVersion) === Number(localUser.authVersion ?? 0);
          }
        } else {
          const cookies = parseCookieHeader(ctx.req.headers.cookie ?? "");
          const cookieToken = cookies[COOKIE_NAME];
          const authHeader = ctx.req.headers.authorization;
          const bearerToken = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
            ? authHeader.slice(7)
            : undefined;
          let session = await localIdentityService.verifySession(cookieToken);
          if (!session && bearerToken && bearerToken !== cookieToken) {
            session = await localIdentityService.verifySession(bearerToken);
          }

          if (session) {
            // Never auto-provision an OAuth identity just because logout was requested.
            const sessionUser = await getUserForSessionRevocation(session.openId);
            if (!sessionUser) {
              throw new Error("Could not verify the account associated with this session. Retry logout.");
            }
            user = sessionUser;
            shouldRevoke = sessionUser.loginMethod !== "closed" &&
              !sessionUser.openId.startsWith("closed:") &&
              Number(session.authVersion ?? 0) === Number(sessionUser.authVersion ?? 0);
          }
        }
      }

      if (user) {
        // A stale or closed token is already invalid. If lookup or revocation fails,
        // do not clear the cookie; the customer's retry action needs the current token.
        if (shouldRevoke) await invalidateUserSessions(user.id);
        try {
          await closeTransactionConsoleSession(ctx.req, ctx.res, user.id);
        } catch (error) {
          // Auxiliary console cleanup must not undo successful revocation.
          console.error(
            "[Auth] Transaction-console cleanup failed after logout",
            error instanceof Error ? error.name : "UnknownError",
          );
        }
      }

      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  customer: router({
    tradingPackages: protectedProcedure.query(({ ctx }) => {
      if (ctx.user.role !== "user") throw new TRPCError({ code: "FORBIDDEN", message: "Trading packages are available to customer accounts." });
      return listCustomerTradingPackages(ctx.user.id);
    }),
    activateTradingPackage: protectedProcedure.input(z.object({
      packageId: z.number().int().positive(),
      idempotencyKey: z.string().trim().min(8).max(128),
    })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "user") throw new TRPCError({ code: "FORBIDDEN", message: "Only customer accounts can activate a trading package." });
      const result = await activateCustomerTradingPackage(ctx.user.id, input);
      const cycle = result.immediateCycle as any;
      for (const trade of cycle?.autoTrades || []) {
        await recordTransactionConsoleEvent(ctx.user.id,ctx.req,{
          eventType:"DEBIT",status:"COMPLETED",title:"Automatic wallet reservation confirmed",
          message:"An opportunity was automatically allocated after package activation; "+trade.amountMinor+" minor units of "+trade.currency+" were committed.",
          transactionCode:"auto-debit:"+trade.tradeId,amountMinor:-trade.amountMinor,asset:trade.currency,
        });
        const notices=[
          {title:"Automatic trading allocation confirmed",body:trade.symbol+" was allocated from your available "+trade.currency+" balance.",eventKey:"auto-trade-allocation:"+trade.tradeId,category:"trading",priority:"normal"},
          {title:"Balance reserved for trade",body:trade.amountMinor+" minor units of "+trade.currency+" were reserved for the automatic allocation.",eventKey:"auto-trade-debit:"+trade.tradeId,category:"ledger_debit",priority:"normal"},
        ] as const;
        const outcomes=await Promise.allSettled(notices.map(notice=>createNotification(ctx.user.id,notice.title,notice.body,{eventKey:notice.eventKey,category:notice.category,priority:notice.priority})));
        if(outcomes.some(outcome=>outcome.status==="rejected")) console.error("[Notifications] Post-activation allocation notice failed after ledger commit.");
      }
      return {subscriptionId:result.subscriptionId,packageId:result.packageId,packageName:result.packageName,activatedAt:result.activatedAt,expiresAt:result.expiresAt,qualifyingBalanceUsdMinor:result.qualifyingBalanceUsdMinor,replayed:result.replayed,automaticTradeCount:cycle?.autoTrades?.length||0};
    }),
    communicationOptions: protectedProcedure.query(({ ctx }) => getCustomerCommunicationOptions(ctx.user.name, ctx.user.email)),
    authenticatorStatus: protectedProcedure.query(({ ctx }) => getCustomerAuthenticatorStatus(ctx.user.id)),
    startAuthenticatorEnrollment: protectedProcedure.mutation(({ ctx }) => startCustomerAuthenticatorEnrollment(ctx.user.id)),
    confirmAuthenticatorEnrollment: protectedProcedure.input(z.object({ code: z.string().regex(/^\d{6}$/) })).mutation(({ ctx, input }) => confirmCustomerAuthenticatorEnrollment(ctx.user.id, input.code)),
    generateAuthenticatorRecoveryCodes: protectedProcedure.input(z.object({ currentCode: z.string().regex(/^\d{6}$/) })).mutation(({ ctx, input }) => generateCustomerAuthenticatorRecoveryCodes(ctx.user.id, input.currentCode)),
    startAuthenticatorRecovery: protectedProcedure.input(z.object({ recoveryCode: z.string().trim().min(16).max(40) })).mutation(({ ctx, input }) => startCustomerAuthenticatorRecoveryReplacement(ctx.user.id, input.recoveryCode)),
    startAuthenticatorReplacement: protectedProcedure.input(z.object({ currentCode: z.string().regex(/^\d{6}$/) })).mutation(({ ctx, input }) => startCustomerAuthenticatorReplacement(ctx.user.id, input.currentCode)),
    confirmAuthenticatorReplacement: protectedProcedure.input(z.object({ code: z.string().regex(/^\d{6}$/) })).mutation(({ ctx, input }) => confirmCustomerAuthenticatorReplacement(ctx.user.id, input.code)),
    kycCenter: protectedProcedure.query(({ ctx }) => getCenter(ctx.user.id)),
    kycStartStage: protectedProcedure.input(z.object({ stage: z.enum(["EMAIL", "PHONE", "ADDRESS", "IDENTITY_DOCUMENT", "FACE_LIVENESS"]), idempotencyKey: z.string().min(8).max(160), deviceMetadata: z.record(z.string(), z.unknown()).optional() })).mutation(async ({ ctx, input }) => { try { return await startStage(ctx.user.id, input.stage, input.idempotencyKey, input.deviceMetadata); } catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "This KYC stage is not available yet." }); } }),
    kycIssueEmail: protectedProcedure.mutation(({ ctx }) => issueEmail(ctx.user.id)),
    kycVerifyEmail: protectedProcedure.input(z.object({ token: z.string().min(8).max(128) })).mutation(({ ctx, input }) => verifyEmail(ctx.user.id, input.token)),
    kycIssuePhone: protectedProcedure.input(z.object({ phone: z.string().min(7).max(40) })).mutation(({ ctx, input }) => issuePhone(ctx.user.id, input.phone)),
    kycVerifyPhone: protectedProcedure.input(z.object({ otp: z.string().regex(/^\d{6}$/) })).mutation(({ ctx, input }) => verifyPhone(ctx.user.id, input.otp)),
    kycSubmitAddress: protectedProcedure.input(z.object({ countryCode: z.string().min(2).max(8), stateProvince: z.string().max(120).optional(), city: z.string().min(1).max(120), district: z.string().max(120).optional(), addressLine: z.string().min(3).max(255), postalCode: z.string().max(40).optional(), method: z.enum(["DECLARATION", "PROOF_DOCUMENT", "ADMIN", "PROVIDER"]).optional() })).mutation(({ ctx, input }) => submitAddress(ctx.user.id, input)),
    kycConsent: protectedProcedure.input(z.object({ purpose: z.string().min(3).max(120), version: z.string().min(1).max(40) })).mutation(({ ctx, input }) => recordConsent(ctx.user.id, input.purpose, input.version, ctx.req.ip)),
    kycSubmitDocument: protectedProcedure.input(z.object({ documentType: z.string().min(2).max(80), countryCode: z.string().min(2).max(8), frontStorageKey: z.string().min(1).max(512), backStorageKey: z.string().max(512).optional(), documentNumber: z.string().max(120).optional(), fields: z.record(z.string(), z.unknown()).optional() })).mutation(({ ctx, input }) => submitDocument(ctx.user.id, input)),
    kycRecordFace: protectedProcedure.input(z.object({ sessionId: z.string().min(16).max(64), challenge: z.record(z.string(), z.unknown()).optional(), demo: z.boolean().optional(), demoOutcome: z.enum(["pass", "fail", "review"]).optional() })).mutation(({ ctx, input }) => recordFaceVerification(ctx.user.id, input)),
    session: protectedProcedure.input(z.object({ deviceLabel: z.string().max(160), countryCode: z.string().max(8).optional() })).mutation(async ({ ctx, input }) => {
      // Express resolves the client IP using the explicitly configured trusted-proxy topology.
      // Never trust a caller-supplied X-Forwarded-For value directly in audit records.
      const ipAddress = ctx.req.ip || ctx.req.socket.remoteAddress;
      const deviceLabel = input.deviceLabel || "Authenticated browser";
      await upsertCustomerSession(ctx.user.id, { deviceLabel, ipAddress, countryCode: input.countryCode, userAgent: ctx.req.headers["user-agent"] });
      return listCustomerSessions(ctx.user.id);
    }),
    sessions: protectedProcedure.query(({ ctx }) => listCustomerSessions(ctx.user.id)),
    revokeSession: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const sessions = await listCustomerSessions(ctx.user.id);
      const target = sessions.find((session: any) => Number(session.id) === input.id);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      await revokeCustomerSession(ctx.user.id, input.id);
      // The security action is authoritative; notification delivery is best-effort.
      // The last-seen cursor distinguishes a later revocation after this session is reused.
      const sessionCursor = target.lastSeenAt instanceof Date
        ? target.lastSeenAt.getTime()
        : String(target.lastSeenAt || "unknown");
      try {
        await createNotification(ctx.user.id, "Security: session revoked",
          "A device session was revoked from your account security settings.", {
            eventKey: `security-session-revoked:${input.id}:${sessionCursor}`,
            category: "security",
            priority: "high",
            href: "/customer",
          });
      } catch (error) {
        console.error("[Notifications] Session revocation notice failed after security change:", error instanceof Error ? error.name : "UnknownError");
      }
      return { success: true };
    }),
    requestRiskReport: protectedProcedure.input(z.object({ title: z.string().min(3).max(200), requestedFor: z.string().max(200).optional() })).mutation(({ ctx, input }) => createRiskReport(ctx.user.id, input.title, input.requestedFor)),
    riskReports: protectedProcedure.query(({ ctx }) => listRiskReports(ctx.user.id)),
    requestAccountClosure: protectedProcedure.input(z.object({
      reasons: z.array(z.enum(["not-using", "experience", "fees", "privacy", "support"]))
        .min(3, "Select at least three closure reasons.")
        .max(5)
        .refine(reasons => new Set(reasons).size === reasons.length, "Each closure reason can only be selected once."),
      acknowledged: z.literal(true),
    })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "user") throw new TRPCError({ code: "FORBIDDEN", message: "Only customer accounts can request closure." });
      return createAccountClosureTicket(ctx.user.id, input.reasons);
    }),
    createTicket: protectedProcedure.input(z.object({ subject: z.string().min(3).max(200), body: z.string().min(1).max(20000), category: z.enum(["account","wallet","opportunity","security","technical"]).default("account"), priority: z.enum(["low", "normal", "high", "urgent"]) })).mutation(async ({ ctx, input }) => {
      if (/^\s*account closure request\b/i.test(input.subject)) throw new TRPCError({ code: "BAD_REQUEST", message: "Use the dedicated account-closure request form." });
      const created=await createTicket(ctx.user.id,input); return created;
    }),
    tickets: protectedProcedure.query(({ ctx }) => listCustomerTickets(ctx.user.id)),
    ticketMessages: protectedProcedure.input(z.object({ ticketId: z.number().int().positive() })).query(async ({ ctx, input }) => { if (!(await getCustomerTicket(ctx.user.id,input.ticketId))) throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" }); return listTicketMessages(input.ticketId); }),
    ticketAttachments: protectedProcedure.input(z.object({ ticketId: z.number().int().positive() })).query(async ({ ctx, input }) => { if (!(await getCustomerTicket(ctx.user.id,input.ticketId))) throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" }); return listTicketAttachments(input.ticketId); }),
    replyTicket: protectedProcedure.input(z.object({ ticketId: z.number().int().positive(), body: z.string().trim().min(1).max(20000) })).mutation(async ({ ctx, input }) => { if (!(await getCustomerTicket(ctx.user.id,input.ticketId))) throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" }); await addTicketMessage(ctx.user.id,input.ticketId,input.body); return { success:true }; }),
    reopenTicket: protectedProcedure.input(z.object({ ticketId: z.number().int().positive() })).mutation(({ ctx, input }) => reopenSupportTicket(ctx.user.id,input.ticketId)),
    addAttachment: protectedProcedure.input(z.object({ ticketId: z.number().int().positive(), fileName: z.string().max(255), mimeType: z.string().max(160), sizeBytes: z.number().int().positive().max(25_000_000), storageKey: z.string().max(512) })).mutation(({ ctx, input }) => { if (!isValidSupportAttachmentStorageKey(input.storageKey)) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid support attachment storage key" }); return addTicketAttachment(ctx.user.id, input); }),
    uploadPolicy: protectedProcedure.query(() => getTicketUploadPolicy()),
    balances: protectedProcedure.query(({ ctx }) => getCustomerBalanceSummary(ctx.user.id)),
    payoutEligibility: protectedProcedure.query(({ ctx }) => getCustomerPayoutEligibility(ctx.user.id)),
    payoutRequests: protectedProcedure.query(({ ctx }) => listCustomerPayoutRequests(ctx.user.id)),
    requestPayout: protectedProcedure.input(z.object({
      currency: z.enum(["USD", "EUR", "GBP", "BTC", "ETH", "USDT"]),
      amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      destinationType: z.enum(["bank_transfer", "crypto_transfer"]),
      destinationDetails: z.string().trim().min(8).max(1000),
      idempotencyKey: z.string().trim().min(8).max(160),
      totpCode: z.string().regex(/^\d{6}$/).optional(),
    })).mutation(({ ctx, input }) => createCustomerPayoutRequest(ctx.user.id, input)),
    cancelPayoutRequest: protectedProcedure.input(z.object({ requestId: z.number().int().positive() }))
      .mutation(({ ctx, input }) => cancelCustomerPayoutRequest(ctx.user.id, input.requestId)),
    walletPreferences: protectedProcedure.query(({ ctx }) => getCustomerWalletPreferences(ctx.user.id)),
    updateWalletPreferences: protectedProcedure.input(z.object({ tradingCurrency: z.string().min(2).max(32).optional(), swapCurrency: z.string().min(2).max(32).optional(), autoTopUpEnabled: z.boolean().optional(), withdrawalWhitelistEnabled: z.boolean().optional() })).mutation(({ ctx, input }) => updateCustomerWalletPreferences(ctx.user.id, input)),
    soundSettings: protectedProcedure.query(async () => { const raw = await getAppSetting("sound.settings"); try { return JSON.parse(raw || "{}"); } catch { return {}; } }),
    transactionConsole: protectedProcedure.query(({ ctx }) => listTransactionConsoleEvents(ctx.user.id, ctx.req)),
    transactionConsolePulse: protectedProcedure.mutation(({ ctx }) => recordTransactionConsolePulse(ctx.user.id, ctx.req)),
    popupLifecycle: protectedProcedure.input(z.object({ eventId: z.number().int().positive(), action: z.enum(["noticed","opened","dismissed","withdrawn","traded","settled"]) })).mutation(({ ctx, input }) => updatePopupLifecycle(ctx.user.id, input.eventId, input.action)),
    popupDeliveryStatus: protectedProcedure.input(z.object({ eventId: z.number().int().positive(), status: z.enum(["received","rendered","failed"]), errorCode: z.string().max(80).optional() })).mutation(({ ctx, input }) => updatePopupDeliveryStatus(ctx.user.id, input.eventId, input.status, input.errorCode)),
    opportunities: protectedProcedure.query(async ({ ctx }) => { const result=await listCustomerOpportunities(ctx.user.id); for (const trade of result.autoTrades||[]) { await recordTransactionConsoleEvent(ctx.user.id,ctx.req,{eventType:"DEBIT",status:"COMPLETED",title:"Automatic wallet debit posted",message:`${trade.symbol} available balance was debited for an automatic allocation under the saved controls.`,transactionCode:`auto-debit:${trade.tradeId}`,amountMinor:-trade.amountMinor,asset:trade.currency}); await recordTransactionConsoleEvent(ctx.user.id,ctx.req,{eventType:"INVESTMENT",status:"COMPLETED",title:"Automatic investment confirmed",message:`${trade.symbol} was allocated automatically from the available wallet balance under the saved customer and administrator controls.`,transactionCode:`auto-investment:${trade.tradeId}`,amountMinor:trade.amountMinor,asset:trade.currency}); const allocationNoticeResults=await Promise.allSettled([createNotification(ctx.user.id,"Automatic trading allocation confirmed",`${trade.symbol} was allocated from your available ${trade.currency} balance.`,{eventKey:`auto-trade-allocation:${trade.tradeId}`,category:"trading",priority:"normal"}),createNotification(ctx.user.id,"Balance debited",`${trade.amountMinor} minor units of ${trade.currency} were reserved for the automatic allocation.`,{eventKey:`auto-trade-debit:${trade.tradeId}`,category:"ledger_debit",priority:"normal"})]); if(allocationNoticeResults.some(outcome=>outcome.status==="rejected")) console.error("[Notifications] Automatic allocation notices failed after ledger commit."); } for (const settlement of result.settled||[]) { await recordTransactionConsoleEvent(ctx.user.id,ctx.req,{eventType:"CREDIT",status:"COMPLETED",title:"Trade earnings credited",message:`Trade ${settlement.tradeId} matured and ${settlement.rewardMinor} minor units of earnings were credited to the ${settlement.currency} wallet.`,transactionCode:`trade-reward:${settlement.tradeId}`,amountMinor:settlement.rewardMinor,asset:settlement.currency}); await recordTransactionConsoleEvent(ctx.user.id,ctx.req,{eventType:"TRADE_SETTLEMENT",status:"COMPLETED",title:"Trade principal released",message:`Trade ${settlement.tradeId} completed its duration and released principal plus earnings through the wallet ledger.`,transactionCode:`trade-settlement:${settlement.tradeId}`,amountMinor:settlement.totalMinor,asset:settlement.currency}); const settlementNoticeResults=await Promise.allSettled([createNotification(ctx.user.id,"Trading reward confirmed",`Trade ${settlement.tradeId} completed and the recorded reward was credited to your ${settlement.currency} wallet.`,{eventKey:`trade-reward:${settlement.tradeId}`,category:"trading_reward",priority:"high"}),createNotification(ctx.user.id,"Balance credited",`Trade ${settlement.tradeId} settlement was recorded for ${settlement.currency}.`,{eventKey:`trade-settlement-credit:${settlement.tradeId}`,category:"ledger_credit",priority:"normal"})]); if(settlementNoticeResults.some(outcome=>outcome.status==="rejected")) console.error("[Notifications] Automatic settlement notices failed after ledger commit."); } for (const missed of result.missed||[]) await recordTransactionConsoleEvent(ctx.user.id,ctx.req,{eventType:"MISSED_OPPORTUNITY",status:"MISSED",title:`Missed opportunity · ${missed.symbol}`,message:`The opportunity was recorded because the required wallet balance was unavailable. Estimated reward only; no ledger debit occurred.`,transactionCode:`missed-opportunity:${missed.id}`,amountMinor:missed.potentialRewardMinor,asset:missed.currency}); return result; }),
    trades: protectedProcedure.query(({ ctx }) => listTrades(ctx.user.id)),
    settle: protectedProcedure.input(z.object({ tradeId: z.number().int().positive() })).mutation(async () => { throw new TRPCError({ code: "FORBIDDEN", message: "Settlement is performed manually by an administrator after the external payment is confirmed." }); }),
    notifications: protectedProcedure.query(({ ctx }) => listCustomerNotifications(ctx.user.id)),
    notificationHistory: protectedProcedure.input(z.object({ cursor: z.string().max(100).optional(), limit: z.number().int().min(1).max(100).optional() }).optional()).query(({ ctx, input }) => listCustomerNotificationPage(ctx.user.id, input?.cursor, input?.limit)),
    notificationUnreadCount: protectedProcedure.query(({ ctx }) => getCustomerNotificationUnreadCount(ctx.user.id)),
    notificationCategoryVisibility: protectedProcedure.query(() => getNotificationCategoryVisibility()),
    notificationEventCursor: protectedProcedure.query(({ ctx }) => listNotificationEventCursor(ctx.user.id)),
    markNotificationsRead: protectedProcedure.input(z.object({ id: z.number().int().positive().optional() }).optional()).mutation(({ ctx, input }) => markCustomerNotificationsRead(ctx.user.id, input?.id)),
    emailPreferences: protectedProcedure.query(({ ctx }) => getCustomerEmailPreferences(ctx.user.id)),
    updateEmailPreferences: protectedProcedure.input(z.object({ dailyTradingReports: z.boolean().optional(), systemAlerts: z.boolean().optional(), transactionAlerts: z.boolean().optional(), adminMessages: z.boolean().optional() })).mutation(({ ctx, input }) => updateCustomerEmailPreferences(ctx.user.id, input)),
    emailStatus: protectedProcedure.query(async ({ ctx }) => ({ emailVerified: (await ensureCustomerControls(ctx.user.id)).emailVerified })),
    stakeEarn: router({
      dashboard: protectedProcedure.query(async ({ ctx }) => { const result=await getStakeDashboard(ctx.user.id); for (const event of result.events.filter((item:any)=>["reward.posted","position.completed"].includes(item.eventType))) await recordTransactionConsoleEvent(ctx.user.id,ctx.req,{eventType:event.eventType === "reward.posted" ? "REWARD_POSTED" : "POSITION_SETTLED",status:"COMPLETED",title:event.eventType === "reward.posted" ? "Reward posting completed" : "Position settlement completed",message:`${event.eventType} was committed to the authoritative ledger.`,transactionCode:`stake-event:${event.id}`,amountMinor:event.amountMinor,asset:event.asset,metadata:{positionId:event.positionId}}); return result; }),
      allocate: protectedProcedure.input(z.object({ productId: z.number().int().positive(), amountMinor: z.number().int().positive(), idempotencyKey: z.string().min(8).max(160) })).mutation(async ({ ctx, input }) => { const result=await allocateStake(ctx.user.id,input); await recordTransactionConsoleEvent(ctx.user.id,ctx.req,{eventType:"DEBIT",status:"COMPLETED",title:"Wallet debit posted",message:`${result.asset} available balance was debited and locked for the Stake & Earn position.`,transactionCode:`debit:${result.positionCode}`,amountMinor:-result.principalMinor,asset:result.asset,metadata:{positionId:result.positionId}}); await recordTransactionConsoleEvent(ctx.user.id,ctx.req,{eventType:"INVESTMENT",status:"COMPLETED",title:"Stake investment confirmed",message:`${result.asset} principal was reserved through the wallet ledger and the position is active.`,transactionCode:`investment:${result.positionCode}`,amountMinor:result.principalMinor,asset:result.asset,metadata:{positionId:result.positionId}}); return result; }),
      cancel: protectedProcedure.input(z.object({ positionId: z.number().int().positive(), idempotencyKey: z.string().min(8).max(160) })).mutation(async ({ ctx, input }) => { const result=await cancelStake(ctx.user.id, input.positionId, input.idempotencyKey); await recordTransactionConsoleEvent(ctx.user.id,ctx.req,{eventType:"CREDIT",status:"COMPLETED",title:"Wallet credit posted",message:`Position ${input.positionId} was cancelled and principal was released back to the available wallet balance.`,transactionCode:`credit:stake:${input.positionId}`,asset:"USD",metadata:{positionId:input.positionId}}); return result; }),
      project: protectedProcedure.input(z.object({ amountMinor: z.number().int().positive(), annualRateBps: z.number().int().min(0).max(100000), durationDays: z.number().int().positive(), compounding: z.boolean().optional() })).query(({ input }) => projectStake(input)),
    }),
    mining: router({
      dashboard: protectedProcedure.query(({ ctx }) => mining.getCustomerMiningDashboard(ctx.user.id)),
      packages: protectedProcedure.query(({ ctx }) => mining.listCustomerMiningPackages(ctx.user.id)),
      boostStatus: protectedProcedure.query(({ ctx }) => mining.getCustomerMiningBoostStatus(ctx.user.id)),
      purchasePackage: protectedProcedure.input(z.object({ packageVersionId: z.number().int().positive(), idempotencyKey: z.string().min(8).max(160) })).mutation(({ ctx, input }) => mining.purchaseCustomerMiningPackage(ctx.user.id, input)),
      quotePurchase: protectedProcedure.input(z.object({ packageVersionId: z.number().int().positive() })).mutation(({ ctx, input }) => mining.createCustomerMiningPurchaseQuote(ctx.user.id, input)),
      confirmPurchase: protectedProcedure.input(z.object({ quoteId: z.number().int().positive(), idempotencyKey: z.string().min(8).max(160), acceptedTerms: z.boolean() })).mutation(({ ctx, input }) => mining.confirmCustomerMiningPurchase(ctx.user.id, input)),
      activateBoost: protectedProcedure.input(z.object({ idempotencyKey: z.string().min(8).max(160) })).mutation(({ ctx, input }) => mining.activateCustomerMiningBoost(ctx.user.id, input)),
      updateConversionPreference: protectedProcedure.input(z.object({ enabled: z.boolean(), targetDenomination: z.string().min(2).max(12), minimumThreshold: z.string().min(1).max(64) })).mutation(({ ctx, input }) => mining.updateCustomerMiningConversionPreference(ctx.user.id, input)),
      quoteSwap: protectedProcedure.input(z.object({ tokenAmount: z.string().min(1).max(64), targetAsset: z.string().min(2).max(12) })).mutation(({ ctx, input }) => mining.createCustomerMiningSwapQuote(ctx.user.id, input)),
      confirmSwap: protectedProcedure.input(z.object({ quoteId: z.number().int().positive(), idempotencyKey: z.string().min(8).max(160) })).mutation(({ ctx, input }) => mining.confirmCustomerMiningSwap(ctx.user.id, input)),
      transactions: protectedProcedure.query(({ ctx }) => mining.listCustomerMiningTransactions(ctx.user.id)),
    }),
  }),

  adminOperations: router({
    scheduledJobs: router({
      list: adminProcedure.input(z.object({ page: z.number().int().positive().optional(), pageSize: z.number().int().min(1).max(100).optional() }).optional()).query(({ ctx, input }) => {
        const token = parseCookieHeader(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
        return listHeartbeatJobs(token, input);
      }),
      create: adminProcedure.input(z.object({
        name: z.string().trim().min(1).max(160),
        cron: z.string().trim().min(1).max(120),
        path: z.string().trim().min(1).max(512),
        method: z.enum(["POST", "PUT"]).optional(),
        payload: z.unknown().optional(),
        description: z.string().max(1000).optional(),
      })).mutation(({ ctx, input }) => {
        const token = parseCookieHeader(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
        return createHeartbeatJob(input, token);
      }),
      update: adminProcedure.input(z.object({
        taskUid: z.string().trim().min(1).max(64),
        patch: z.object({
          cron: z.string().trim().min(1).max(120).optional(),
          path: z.string().trim().min(1).max(512).optional(),
          method: z.enum(["POST", "PUT"]).optional(),
          payload: z.unknown().optional(),
          description: z.string().max(1000).optional(),
          enable: z.boolean().optional(),
        }).refine((value) => Object.keys(value).length > 0, "At least one field to update is required"),
      })).mutation(({ ctx, input }) => {
        const token = parseCookieHeader(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
        return updateHeartbeatJob(input.taskUid, input.patch, token);
      }),
      delete: adminProcedure.input(z.object({ taskUid: z.string().trim().min(1).max(64) })).mutation(({ ctx, input }) => {
        const token = parseCookieHeader(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
        return deleteHeartbeatJob(input.taskUid, token).then(() => ({ success: true }));
      }),
    }),

    tradingPackages: adminProcedure.query(() => listAdminTradingPackages()),
    updateTradingPackage: adminProcedure.input(z.object({
      id: z.number().int().positive(),
      name: z.string().trim().min(1).max(80),
      minimumQualifyingBalanceUsdMinor: z.number().int().positive().max(9007199254740991),
      durationMonths: z.number().int().min(1).max(1200),
      opportunitiesPerDay: z.number().int().min(1).max(10000),
      enabled: z.boolean(),
    })).mutation(({ ctx, input }) => updateAdminTradingPackage(ctx.user.id, input)),
    packageActivationPolicy: adminProcedure.query(() => getPackageActivationPolicy()),
    updatePackageActivationPolicy: adminProcedure.input(z.object({
      eligibleCurrencies: z.array(z.string().trim().min(2).max(32)).min(1).max(64),
      combineEligibleWallets: z.boolean(),
      repeatAllowed: z.boolean(),
      maxCopies: z.number().int().min(0).max(10000),
      repeatRestriction: z.enum(["active_only","all_history"]),
      cooldownSeconds: z.number().int().min(0).max(31536000),
    })).mutation(({ ctx, input }) => setPackageActivationPolicy(ctx.user.id, input)),

    communicationSettings: adminProcedure.query(() => getAdminCommunicationSettings()),
    updateCommunicationSettings: adminProcedure.input(communicationSettingsInput).mutation(async ({ ctx, input }) => {
      const errors = validateCommunicationSettingsInput(input);
      if (errors.length) throw new TRPCError({ code: "BAD_REQUEST", message: errors.join(" ") });
      return saveAdminCommunicationSettings(ctx.user.id, input);
    }),

    privacyPolicyState: adminProcedure.query(() => privacyService.getAdminPrivacyPolicyState()),
    savePrivacyPolicyDraft: adminProcedure.input(z.object({
      draftId: z.number().int().positive().optional(),
      title: z.string().trim().min(5).max(200),
      summary: z.string().trim().min(20).max(700),
      controllerName: z.string().trim().min(3).max(200),
      controllerAddress: z.string().max(500),
      privacyContact: z.string().trim().min(5).max(320),
      applicableJurisdiction: z.string().max(180),
      htmlContent: z.string(),
      sections: z.array(z.object({
        id: z.string(),
        title: z.string(),
        body: z.string(),
      })).max(16),
    })).mutation(({ ctx, input }) => privacyService.savePrivacyPolicyDraft(ctx.user.id, input)),
    publishPrivacyPolicy: adminProcedure.input(z.object({ draftId: z.number().int().positive(), reviewAcknowledged: z.literal(true) }))
      .mutation(({ ctx, input }) => privacyService.publishPrivacyPolicy(ctx.user.id, input.draftId, input.reviewAcknowledged)),
    privacyRequests: adminProcedure.input(z.object({
      status: z.enum(["submitted", "identity_check", "in_review", "awaiting_customer", "completed", "declined", "cancelled"]).optional(),
    }).optional()).query(({ input }) => privacyService.listAdminPrivacyRequests(input?.status)),
    privacyRequestDetail: adminProcedure.input(z.object({ requestId: z.number().int().positive() }))
      .query(({ input }) => privacyService.getAdminPrivacyRequestDetail(input.requestId)),
    updatePrivacyRequest: adminProcedure.input(z.object({
      requestId: z.number().int().positive(),
      status: z.enum(["submitted", "identity_check", "in_review", "awaiting_customer", "completed", "declined", "cancelled"]),
      customerMessage: z.string().max(1500).optional(),
      internalNote: z.string().max(3000).optional(),
    })).mutation(async ({ ctx, input }) => {
      const result = await privacyService.updatePrivacyRequest(ctx.user.id, input);
      if (result.customerMessage) {
        try {
          await createNotification(result.userId, "Privacy request update",
            result.requestReference + ": " + result.customerMessage, {
              eventKey: "privacy-request-update:" + result.requestReference + ":" + Date.now(),
              category: "account",
              priority: "normal",
              href: "/customer",
            });
        } catch (error) {
          console.error("[Privacy] Customer update notice failed after request persistence:", error instanceof Error ? error.name : "UnknownError");
        }
      }
      return result;
    }),
    payoutRequests: adminProcedure.query(() => listAdminPayoutRequests()),
    resolvePayoutRequest: adminProcedure.input(z.object({
      requestId: z.number().int().positive(),
      action: z.enum(["paid", "rejected"]),
      externalReference: z.string().trim().max(160).optional(),
      note: z.string().trim().max(1000).optional(),
    })).mutation(({ ctx, input }) => resolveCustomerPayoutRequest(ctx.user.id, input)),
    notifications: adminProcedure.query(({ctx})=>listNotifications(ctx.user.id)),
    markNotificationsRead: adminProcedure.input(z.object({id:z.number().int().positive().optional()}).optional()).mutation(({ctx,input})=>markCustomerNotificationsRead(ctx.user.id,input?.id)),
    notificationCategoryVisibility: adminProcedure.query(() => getNotificationCategoryVisibility()),
    updateNotificationCategoryVisibility: adminProcedure.input(z.object({account:z.boolean(),transaction:z.boolean(),deposit:z.boolean(),withdrawal:z.boolean(),ledger_credit:z.boolean(),ledger_debit:z.boolean(),trading:z.boolean(),trading_reward:z.boolean(),mining:z.boolean(),mining_reward:z.boolean(),support:z.boolean(),announcement:z.boolean(),promotion:z.boolean(),platform_update:z.boolean(),security:z.boolean()})).mutation(({ctx,input})=>setNotificationCategoryVisibility(input,ctx.user.id)),
    publishAnnouncement: adminProcedure.input(z.object({title:z.string().trim().min(3).max(200),body:z.string().trim().min(1).max(10000),eventKey:z.string().trim().min(8).max(120),category:z.enum(ADMIN_BROADCAST_CATEGORIES),priority:z.enum(["low","normal","high","urgent"]).default("normal"),href:z.string().max(512).optional(),targetUserId:z.number().int().positive().nullable().optional(),scheduledAt:z.string().datetime().optional(),expiresAt:z.string().datetime().optional()})).mutation(({ctx,input})=>broadcastCustomerNotification(ctx.user.id,input)),
    announcementHistory: adminProcedure.query(() => listAdminNotificationCampaigns()),
    retryAnnouncement: adminProcedure.input(z.object({campaignId:z.number().int().positive()})).mutation(({ctx,input})=>retryNotificationCampaign(ctx.user.id,input.campaignId)),
    withdrawAnnouncement: adminProcedure.input(z.object({campaignId:z.number().int().positive()})).mutation(({ctx,input})=>withdrawNotificationCampaign(ctx.user.id,input.campaignId)),
    miningDashboard: adminProcedure.query(() => miningAdmin.getMiningAdminDashboard()),
    miningPackages: adminProcedure.query(() => miningAdmin.getMiningAdminPackages()),
    miningEconomics: adminProcedure.query(() => miningAdmin.getMiningAdminEconomics()),
    saveMiningEconomics: adminProcedure.input(z.object({ globalEnabled:z.boolean(),packagePurchasesEnabled:z.boolean(),boostsEnabled:z.boolean(),tokenName:z.string().trim().min(2).max(64),tokenSymbol:z.string().trim().min(2).max(16),defaultContractDurationMonths:z.number().int().min(1).max(120),calculationModel:z.enum(["package_daily","hashrate_daily"]),ckiPerThsPerDay:z.string().min(1).max(64),effectiveAt:z.string().min(1).max(64).optional(),difficultyBaselineThs:z.string().min(1).max(64),tokenUnitsPerUsd:z.string().min(1).max(64),rewardTokensPerThsHour:z.string().min(1).max(64),swapFeeBps:z.number().int().min(0).max(10000),purchaseFeeBps:z.number().int().min(0).max(10000),minSwapTokens:z.string().min(1).max(64),maxSwapTokens:z.string().min(1).max(64),defaultAutoConversionThreshold:z.string().min(1).max(64),boostCycleSeconds:z.number().int().min(60).max(31536000),boostDurationSeconds:z.number().int().min(10).max(31536000),boostRewardCkiPerDay:z.string().min(1).max(64),boostActivationBonusCki:z.string().min(1).max(64),quoteTtlSeconds:z.number().int().min(10).max(600),fiatMaxAgeSeconds:z.number().int().min(60).max(604800),cryptoMaxAgeSeconds:z.number().int().min(30).max(3600),maxRateDeviationBps:z.number().int().min(0).max(10000),dailyRewardCapTokens:z.string().min(1).max(64),dualApprovalThresholdUsd:z.string().min(1).max(64),globalHashPowerThs:z.string().min(1).max(64),reason:z.string().trim().min(10).max(2000) })).mutation(({ ctx,input }) => miningAdmin.saveMiningEconomics(ctx.user.id,input)),
    saveMiningPackageDraft: adminProcedure.input(z.object({ packageId:z.number().int().positive().optional(),versionId:z.number().int().positive().optional(),code:z.string().min(2).max(48),name:z.string().min(2).max(120),displayOrder:z.number().int().min(1).max(10000),durationMonths:z.number().int().min(1).max(120),expectedDailyRewardCki:z.string().max(64).nullable().optional(),priceAmount:z.string().min(1).max(64),priceAsset:z.string().min(2).max(12),baseThs:z.string().min(1).max(64),boostBonusThs:z.string().min(1).max(64),boostDurationSeconds:z.number().int().min(10).max(31536000).nullable().optional(),maxPerCustomer:z.literal(1),stackingPolicy:z.enum(["stack","replace"]),termsText:z.string().min(80).max(12000),simulationAcknowledgementRequired:z.boolean(),reason:z.string().trim().min(10).max(2000) })).mutation(({ctx,input})=>miningAdmin.saveMiningPackageDraft(ctx.user.id,input)),
    publishMiningPackage: adminProcedure.input(z.object({packageId:z.number().int().positive(),versionId:z.number().int().positive(),reason:z.string().trim().min(10).max(2000)})).mutation(({ctx,input})=>miningAdmin.publishMiningPackage(ctx.user.id,input)),
    setMiningPackageStatus: adminProcedure.input(z.object({packageId:z.number().int().positive(),status:z.enum(["published","paused","retired"]),reason:z.string().trim().min(10).max(2000)})).mutation(({ctx,input})=>miningAdmin.setMiningPackageStatus(ctx.user.id,input)),
    miningPriceFeeds: adminProcedure.query(()=>miningAdmin.getMiningAdminPriceFeeds()),
    refreshMiningPriceFeeds: adminProcedure.mutation(()=>miningAdmin.refreshMiningPriceFeeds()),
    miningCustomers: adminProcedure.input(z.object({query:z.string().max(120).optional(),limit:z.number().int().min(1).max(100).optional()}).optional()).query(({input})=>miningAdmin.listMiningAdminCustomers(input||{})),
    miningCustomerDetail: adminProcedure.input(z.object({userId:z.number().int().positive()})).query(({input})=>miningAdmin.getMiningAdminCustomerDetail(input.userId)),
    grantSandboxMiningPackage: adminProcedure.input(z.object({userId:z.number().int().positive(),packageVersionId:z.number().int().positive(),reason:z.string().trim().min(10).max(2000),idempotencyKey:z.string().min(8).max(160)})).mutation(({ctx,input})=>miningAdmin.grantSandboxMiningPackage(ctx.user.id,input)),
    createMiningAdjustment: adminProcedure.input(z.object({userId:z.number().int().positive(),assetCode:z.string().min(2).max(12),amount:z.string().min(1).max(64),direction:z.enum(["credit","debit"]),reason:z.string().trim().min(10).max(2000),idempotencyKey:z.string().min(8).max(160)})).mutation(({ctx,input})=>miningAdmin.createMiningAdjustment(ctx.user.id,input)),
    miningAdjustmentQueue: adminProcedure.query(()=>miningAdmin.listMiningAdjustmentQueue()),
    resolveMiningAdjustment: adminProcedure.input(z.object({requestId:z.number().int().positive(),approve:z.boolean(),reason:z.string().trim().min(10).max(2000)})).mutation(({ctx,input})=>miningAdmin.resolveMiningAdjustment(ctx.user.id,input)),
    reverseMiningTransaction: adminProcedure.input(z.object({transactionId:z.number().int().positive(),reason:z.string().trim().min(10).max(2000)})).mutation(({ctx,input})=>miningAdmin.reverseMiningTransaction(ctx.user.id,input)),
    reconcileMiningLedger: adminProcedure.input(z.object({repair:z.boolean().optional(),reason:z.string().max(2000).optional()}).optional()).mutation(({ctx,input})=>miningAdmin.reconcileMiningLedger(ctx.user.id,input||{})),
    kycDashboard: adminProcedure.query(() => adminDashboard()),
    kycCustomers: adminProcedure.input(z.object({ page: z.number().int().positive().optional(), pageSize: z.number().int().min(10).max(100).optional(), search: z.string().max(100).optional(), status: z.enum(["NOT_STARTED", "IN_PROGRESS", "VERIFIED", "REVIEW_REQUIRED", "RETRY_AVAILABLE", "REJECTED"]).optional() }).optional()).query(({ input }) => adminCustomerDirectory(input || {})),
    kycQueue: adminProcedure.query(() => adminQueue()),
    kycSettings: adminProcedure.query(async () => getAdminKycSettings(await isEmailDeliveryConfigured() || await isEmailAdminConfigured())),
    updateKycSettings: adminProcedure.input(z.object({ emailExpiryMinutes: z.number().int().min(5).max(60), phoneExpiryMinutes: z.number().int().min(1).max(30), rawRetentionDays: z.number().int().min(1).max(30), extractedRetentionDays: z.number().int().min(30).max(3650), resultRetentionDays: z.number().int().min(365).max(3650), faceMatchPassThreshold: z.number().min(0.7).max(0.99), faceMatchReviewThreshold: z.number().min(0.5).max(0.98), reviewSlaHours: z.number().int().min(1).max(168) })).mutation(({ ctx, input }) => updateAdminKycSettings(ctx.user.id, input)),
    kycDecision: adminProcedure.input(z.object({ profileId: z.number().int().positive(), stage: z.enum(["EMAIL", "PHONE", "ADDRESS", "IDENTITY_DOCUMENT", "FACE_LIVENESS"]), decision: z.enum(["APPROVE", "REJECT"]), reason: z.string().trim().min(5).max(2000) })).mutation(({ ctx, input }) => adminDecision(ctx.user.id, input.profileId, input.stage, input.decision, input.reason)),
    kycOverride: adminProcedure.input(z.object({ profileId: z.number().int().positive(), stage: z.enum(["EMAIL", "PHONE", "ADDRESS", "IDENTITY_DOCUMENT", "FACE_LIVENESS"]), reason: z.string().min(5).max(2000) })).mutation(({ ctx, input }) => adminOverride(ctx.user.id, input.profileId, input.stage, input.reason)),
    kycAuditEvents: adminProcedure.query(() => adminAuditEvents()),
    kycVerifyAudit: adminProcedure.query(() => verifyAuditChain()),
    emailAdminConfig: adminProcedure.query(async () => ({ email: { smtp: await publicEmailConfig(), smtpReady: await isEmailAdminConfigured(), dailyCloseHourUtc: Number(await getAppSetting("email.dailyCloseHourUtc", "23")), dailyCloseMinuteUtc: Number(await getAppSetting("email.dailyCloseMinuteUtc", "59")) } })),
    emailRecipients: adminProcedure.query(() => listEmailRecipients()),
    testEmail: adminProcedure.input(z.object({ to: z.string().email() })).mutation(({ input }) => testEmailConnection(input.to)),
    runDailyReports: adminProcedure.input(z.object({ force: z.boolean().optional() }).optional()).mutation(({ input }) => runDailyEmailReports(Boolean(input?.force))),
    saveEmailConfig: adminProcedure.input(z.object({ provider: z.enum(["local", "local-smtp", "sendgrid", "aws-ses", "other"]).optional(), region: z.string().max(64).optional(), clearPassword: z.boolean().optional(), mode: z.enum(["external", "direct"]), host: z.string().max(255), port: z.number().int().min(1).max(65535), secure: z.boolean(), authType: z.enum(["login", "plain", "none"]), user: z.string().max(255), password: z.string().max(2000).optional(), fromName: z.string().min(1).max(120), fromAddress: z.string().email(), replyTo: z.string().email().or(z.literal("")), dailyCloseHourUtc: z.number().int().min(0).max(23), dailyCloseMinuteUtc: z.number().int().min(0).max(59) })).mutation(async ({ ctx, input }) => { const { dailyCloseHourUtc, dailyCloseMinuteUtc, clearPassword, ...emailConfig } = input; const saved = await saveEmailConfig({ ...emailConfig, clearPassword }, ctx.user.id); await setAppSetting("email.dailyCloseHourUtc", String(dailyCloseHourUtc), ctx.user.id); await setAppSetting("email.dailyCloseMinuteUtc", String(dailyCloseMinuteUtc), ctx.user.id); return saved; }),
    composeEmail: adminProcedure.input(z.object({ recipients: z.array(z.string().email()).min(1).max(500), subject: z.string().trim().min(3).max(200), htmlBody: z.string().min(1).max(200000), textBody: z.string().max(200000).optional(), attachments: z.array(z.object({ filename: z.string().min(1).max(255), content: z.string().max(35000000), contentType: z.string().max(160).optional() })).max(10).optional() })).mutation(({ ctx, input }) => sendAdminComposedEmail(ctx.user.id, input)),
    emailStatus: adminProcedure.query(async () => ({ smtpConfigured: await isEmailDeliveryConfigured(), dailyDigestSchedule: getDailyDigestSchedule() })),
    sendTestEmail: adminProcedure.input(z.object({ userId: z.number().int().positive().optional() }).optional()).mutation(({ ctx, input }) => sendEmailTest(input?.userId || ctx.user.id)),
    sendCustomerEmail: adminProcedure.input(z.object({ userId: z.number().int().positive(), subject: z.string().trim().min(3).max(160), body: z.string().trim().min(1).max(8000) })).mutation(({ ctx, input }) => enqueueAdminMessage(input.userId, input.subject, input.body, `admin:${ctx.user.id}:${Date.now()}:${input.userId}`)),
    customers: adminProcedure.query(() => listAdminCustomers()),
    audit: adminProcedure.query(() => listAdminAuditEvents()),
    ledgerActivity: adminProcedure.query(() => listAdminRecentLedgerActivity()),
    tradeFeePolicy: adminProcedure.query(() => getTradeFeePolicy()),
    updateTradeFeePolicy: adminProcedure.input(z.object({
      feeRateBps: z.number().int().min(0).max(10000),
      roundingMode: z.enum(["half_up","down","up","half_even"]),
    })).mutation(({ ctx, input }) => setTradeFeePolicy(input,ctx.user.id)),
    pendingSettlements: adminProcedure.query(() => listPendingSettlements()),
    confirmManualSettlement: adminProcedure.input(z.object({
      tradeId: z.number().int().positive(),
      grossProfitMinor: z.number().int(),
      settlementReference: z.string().trim().min(3).max(160),
      notes: z.string().trim().max(2000).optional(),
    })).mutation(async ({ ctx, input }) => {
      const result=await manuallySettleTrade(input.tradeId,ctx.user.id,input);
      const notices=buildTradeSettlementNotices({
        tradeId:result.tradeId,
        currency:result.currency,
        principalMinor:result.principalMinor,
        rewardMinor:result.rewardMinor,
        grossProfitMinor:result.grossProfitMinor,
        platformFeeMinor:result.platformFeeMinor,
        netProfitMinor:result.netProfitMinor,
        outcome:result.outcome,
      });
      const outcomes=await Promise.allSettled(notices.map(notice=>createNotification(result.userId,notice.title,notice.body,{
        eventKey:notice.eventKey,category:notice.category,priority:notice.priority,
      })));
      if(outcomes.some(outcome=>outcome.status==="rejected")) console.error("[Notifications] One or more trade settlement notices failed after ledger commit.");
      return result;
    }),
    customerBalances: adminProcedure.input(z.object({ userId: z.number().int().positive() })).query(({ input }) => listBalances(input.userId)),
    currencies: adminProcedure.query(() => listCurrencies()),
    upsertCurrency: adminProcedure.input(z.object({ code: z.string().min(2).max(32), name: z.string().min(2).max(120), symbol: z.string().min(1).max(16), scale: z.number().int().min(0).max(18), assetType: z.enum(["fiat","crypto","token"]), usdRate: z.string().min(1).max(64), rateProvider: z.string().min(1).max(120), externalCode: z.string().max(80).optional(), enabled: z.boolean().optional() })).mutation(({ input }) => upsertCurrency(input)),
    createCustomer: adminProcedure.input(z.object({ name: z.string().min(2).max(160), email: z.string().email(), password: z.string().min(10).max(200) })).mutation(({ input }) => createAdminCustomer(input)),
    updateCustomer: adminProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().min(2).max(160), email: z.string().email() })).mutation(({ input }) => updateAdminCustomer(input)),
    deleteCustomer: adminProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ input }) => {
      try {
        return await deleteAdminCustomer(input.userId);
      } catch (error) {
        if (error instanceof AccountClosureDecisionError) throw new TRPCError({ code: "PRECONDITION_FAILED", message: error.message });
        throw error;
      }
    }),
    updateCustomerControls: adminProcedure.input(z.object({ userId: z.number().int().positive(), accountStatus: z.enum(["active","suspended","restricted"]).optional(), withdrawalsEnabled: z.boolean().optional(), kycRequired: z.boolean().optional(), twoFactorRequired: z.boolean().optional(), emailVerified: z.boolean().optional(), riskTier: z.string().min(1).max(24).optional(), adminNote: z.string().max(2000).optional() })).mutation(({ ctx, input }) => updateCustomerControls(ctx.user.id, input)),
    adjustCustomerBalance: adminProcedure.input(z.object({ userId: z.number().int().positive(), currency: z.string().min(2).max(32), amountMinor: z.number().int().positive(), mode: z.enum(["credit","debit"]), reason: z.string().min(3).max(500) })).mutation(async ({ ctx, input }) => { const result=await adjustCustomerBalance(ctx.user.id, input); await recordTransactionConsoleEvent(ctx.user.id,ctx.req,{eventType:`ADMIN_${input.mode.toUpperCase()}`,status:"COMPLETED",title:`Wallet ${input.mode} transaction completed`,message:`${input.currency} wallet adjustment was committed to the ledger for account ${input.userId}.`,amountMinor:input.amountMinor,asset:input.currency,metadata:{targetUserId:input.userId,reason:input.reason,rateUsd:result.rateUsd,amountUsd:result.amountUsd,rateUpdatedAt:result.rateUpdatedAt}}); return result; }),
    settings: adminProcedure.query(async () => ({ sounds: await (async () => { const raw = await getAppSetting("sound.settings"); try { return JSON.parse(raw || "{}"); } catch { return {}; } })(), ticket: await getTicketUploadPolicy(), email: { provider: await getAppSetting("email.provider"), fromName: await getAppSetting("email.fromName"), fromAddress: await getAppSetting("email.fromAddress"), replyTo: await getAppSetting("email.replyTo", "") }, opportunity: { countdownSeconds: Number(await getAppSetting("opportunity.countdownSeconds")), signupCreditMinor: Number(await getAppSetting("signup.autoCreditMinor")), signupCreditCurrency: await getAppSetting("signup.autoCreditCurrency") }, policy: await (async()=>{ try{return JSON.parse((await getAppSetting("policy.defaults"))||"{}")}catch{return {}} })(), branding: await (async()=>{ try{return JSON.parse((await getAppSetting("branding.settings"))||"{}")}catch{return {}} })(), appearance: await normalizeAppearanceSettings(await getAppSetting("appearance.settings")), trade: await getTradeSettlementPolicy() })),
    updateSettings: adminProcedure.input(z.object({ ticket: z.object({ maxAttachmentMb: z.number().int().min(1).max(100), allowedMimeTypes: z.array(z.string().min(1).max(120)).min(1).max(50) }).optional(), email: z.object({ provider: z.enum(["smtp", "sendgrid", "disabled"]), fromName: z.string().min(1).max(120), fromAddress: z.string().email(), replyTo: z.string().email().or(z.literal("")) }).optional(), opportunity: z.object({ countdownSeconds: z.number().int().min(10).max(86400), signupCreditMinor: z.number().int().min(0).max(100000000), signupCreditCurrency: z.enum(["USD","EUR","GBP","BTC","ETH"]) }).optional(), sounds: z.object({ default: z.string().min(1).max(80), opportunity: z.string().min(1).max(80), deposit: z.string().min(1).max(80), credit: z.string().min(1).max(80), debit: z.string().min(1).max(80), withdrawal: z.string().min(1).max(80), trading: z.string().min(1).max(80), mining: z.string().min(1).max(80), support: z.string().min(1).max(80), announcement: z.string().min(1).max(80), failure: z.string().min(1).max(80), enabled: z.boolean(), loopOpportunity: z.boolean(), volume: z.number().int().min(0).max(100).default(80) }).optional(), policy: z.object({ kyc: z.boolean(), withdrawals: z.boolean(), twofa: z.boolean(), facial: z.boolean() }).optional(), branding: z.record(z.string(), z.string()).optional(), appearance: z.object({ defaultTheme: z.enum(["original","midnight-premium","clean-light","emerald-finance","aurora-modern","gold-luxe"]), enabledThemes: z.array(z.enum(["original","midnight-premium","clean-light","emerald-finance","aurora-modern","gold-luxe"])).min(1).max(6), customerCanSelect: z.boolean() }).optional(), trade: z.object({ settlementDelaySeconds: z.number().int().min(1).max(604800), creditDelaySeconds: z.number().int().min(0).max(604800), cooldownSeconds: z.number().int().min(0).max(604800), nextPopupFormulaDelaySeconds: z.number().int().min(0).max(604800), popupCooldownSeconds: z.number().int().min(0).max(604800), popupDisplaySeconds: z.number().int().min(1).max(3600), popupPreAlertSeconds: z.number().int().min(0).max(3600), popupJitterSeconds: z.number().int().min(0).max(604800), popupMaxPerHour: z.number().int().min(1).max(10000), marketRefreshIntervalMinutes: z.number().int().min(1).max(10080), blockUntilSettled: z.boolean() }).optional() })).mutation(async ({ ctx, input }) => { if (input.appearance && !input.appearance.enabledThemes.includes(input.appearance.defaultTheme)) throw new TRPCError({ code: "BAD_REQUEST", message: "The default theme must be enabled." }); if (input.ticket) { await setAppSetting("ticket.maxAttachmentMb", String(input.ticket.maxAttachmentMb), ctx.user.id); await setAppSetting("ticket.allowedMimeTypes", input.ticket.allowedMimeTypes.join(","), ctx.user.id); } if (input.email) { await setAppSetting("email.provider", input.email.provider, ctx.user.id); await setAppSetting("email.fromName", input.email.fromName, ctx.user.id); await setAppSetting("email.fromAddress", input.email.fromAddress, ctx.user.id); await setAppSetting("email.replyTo", input.email.replyTo, ctx.user.id); } if (input.sounds) { await setAppSetting("sound.settings", JSON.stringify(input.sounds), ctx.user.id); } if (input.policy) await setAppSetting("policy.defaults", JSON.stringify(input.policy), ctx.user.id); if (input.branding) await setAppSetting("branding.settings", JSON.stringify(input.branding), ctx.user.id); if (input.appearance) { await setAppSetting("appearance.settings", JSON.stringify(input.appearance), ctx.user.id); } if (input.trade) await setTradeSettlementPolicy({delaySeconds:input.trade.settlementDelaySeconds,creditDelaySeconds:input.trade.creditDelaySeconds,cooldownSeconds:input.trade.cooldownSeconds,nextPopupFormulaDelaySeconds:input.trade.nextPopupFormulaDelaySeconds,popupCooldownSeconds:input.trade.popupCooldownSeconds,popupDisplaySeconds:input.trade.popupDisplaySeconds,popupPreAlertSeconds:input.trade.popupPreAlertSeconds,popupJitterSeconds:input.trade.popupJitterSeconds,popupMaxPerHour:input.trade.popupMaxPerHour,marketRefreshIntervalMinutes:input.trade.marketRefreshIntervalMinutes,blockUntilSettled:input.trade.blockUntilSettled}, ctx.user.id); if (input.opportunity) { await setAppSetting("opportunity.countdownSeconds", String(input.opportunity.countdownSeconds), ctx.user.id); await setAppSetting("signup.autoCreditMinor", String(input.opportunity.signupCreditMinor), ctx.user.id); await setAppSetting("signup.autoCreditCurrency", input.opportunity.signupCreditCurrency, ctx.user.id); } return { success: true }; }),
    offers: adminProcedure.query(() => listOpenOffers()),
    packagePolicies: adminProcedure.query(() => listOpportunityPackagePolicies()),
    popupLifecycleSummary: adminProcedure.query(() => getOpportunityLifecycleSummary()),
    runPopupRetention: adminProcedure.mutation(() => runOpportunityRetention()),
    updatePackagePolicies: adminProcedure.input(z.object({ policies: z.array(z.object({ packageName: z.string().min(1).max(40), maxPopupsPerDay: z.number().int().min(1).max(1000), maxVisibleOffers: z.number().int().min(1).max(10000), minimumTradeUnits: z.number().int().min(1).max(2147483647), maximumTradeUnits: z.number().int().min(1).max(2147483647), minHourlyTarget: z.number().int().min(0).max(100), normalHourlyTarget: z.number().int().min(0).max(100), marketInfluenceBps: z.number().int().min(0).max(10000), burstEnabled: z.boolean(), maxBurstSize: z.number().int().min(0).max(100), dailyPopupTarget: z.number().int().min(0).max(10000).optional(), schedulingPeriod: z.enum(["rolling_24h","calendar_day"]).optional(), minIntervalSeconds: z.number().int().min(0).max(604800).optional(), maxIntervalSeconds: z.number().int().min(0).max(604800).optional(), randomizationEnabled: z.boolean().optional(), popupDisplayTargetSeconds: z.number().int().min(1).max(604800).optional(), completionDisplaySeconds: z.number().int().min(1).max(3600).optional(), postCompletionIntervalSeconds: z.number().int().min(0).max(604800).optional(), maxPendingDeliveries: z.number().int().min(0).max(1000).optional(), maxDeliveryAttempts: z.number().int().min(1).max(20).optional(), maxTradeAttemptsPerDay: z.number().int().min(0).max(10000).optional(), maxSuccessfulTradesPerDay: z.number().int().min(0).max(10000).optional(), maxConcurrentActiveTrades: z.number().int().min(1).max(1000).optional(), requirePreviousSettlement: z.boolean().optional(), minSettlementDelaySeconds: z.number().int().min(0).max(604800).optional(), maxSettlementDelaySeconds: z.number().int().min(0).max(604800).optional(), minimumRewardBps: z.number().int().min(0).max(10000).optional(), maxDailyRewardMinor: z.number().int().min(0).max(2147483647).optional(), maxRewardPerTradeMinor: z.number().int().min(0).max(2147483647).optional(), closePolicy: z.enum(["after_completion","after_final_display"]).optional() })).min(1).max(20) })).mutation(({ ctx, input }) => updateOpportunityPackagePolicies(ctx.user.id, input.policies)),
    createOffer: adminProcedure.input(z.object({ symbol: z.string().min(1).max(40), venueFrom: z.string().min(1).max(80), venueTo: z.string().min(1).max(80), currency: z.enum(["USD","EUR","GBP","BTC","ETH"]), minimumMinor: z.number().int().positive(), expectedRewardBps: z.number().int().min(1).max(5000), durationSeconds: z.number().int().min(10).max(86400) })).mutation(({ input }) => createOpportunityOffer(input)),
    bulkCreateOffers: adminProcedure.input(z.object({ offers: z.array(z.object({ symbol: z.string().min(1).max(40), venueFrom: z.string().min(1).max(80), venueTo: z.string().min(1).max(80), currency: z.enum(["USD","EUR","GBP","BTC","ETH"]), minimumMinor: z.number().int().positive(), expectedRewardBps: z.number().int().min(1).max(5000), durationSeconds: z.number().int().min(10).max(86400) })).min(1).max(5000) })).mutation(({ input }) => bulkCreateOpportunityOffers(input.offers)),
    tickets: adminProcedure.query(() => listAllTickets()),
    supportAssignees: adminProcedure.query(() => listSupportAssignees()),
    assignTicket: adminProcedure.input(z.object({ ticketId: z.number().int().positive(), assignedAdminId: z.number().int().positive().nullable() })).mutation(({ ctx, input }) => assignSupportTicket(ctx.user.id, input.ticketId, input.assignedAdminId)),
    ticketMessages: adminProcedure.input(z.object({ ticketId: z.number().int().positive() })).query(({ input }) => listTicketMessages(input.ticketId)),
    ticketAttachments: adminProcedure.input(z.object({ ticketId: z.number().int().positive() })).query(async ({ input }) => { if (!(await getSupportTicketById(input.ticketId))) throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" }); return listTicketAttachments(input.ticketId); }),
    decideAccountClosure: adminProcedure.input(z.object({
      ticketId: z.number().int().positive(),
      decision: z.enum(["approve", "reject"]),
      reason: z.string().trim().min(10, "Enter a review reason of at least 10 characters.").max(2000),
    })).mutation(async ({ ctx, input }) => {
      try {
        const result = await applyAccountClosureDecision(ctx.user.id, input);
        if (result.decision === "reject") {
          try {
            await createNotification(result.customerId, "Account closure request reviewed", `${result.ticketNumber}: The administration team declined this closure request. Please open the ticket to read the review note.`, {
              eventKey: `account-closure-decision:${result.ticketId}:rejected`, category: "support", priority: "high",
            });
          } catch (error) {
            console.error("[AccountClosure] Rejection notice failed after decision:", error instanceof Error ? error.name : "UnknownError");
          }
        }
        return result;
      } catch (error) {
        if (error instanceof AccountClosureDecisionError) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: error.message });
        }
        throw error;
      }
    }),
    replyTicket: adminProcedure.input(z.object({ ticketId: z.number().int().positive(), body: z.string().trim().min(1).max(20000), status: z.enum(["answered", "resolved", "closed"]) })).mutation(async ({ ctx, input }) => { const ticket=await getSupportTicketById(input.ticketId); if(!ticket) throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" }); if(ticket.subject === ACCOUNT_CLOSURE_TICKET_SUBJECT) throw new TRPCError({code:"BAD_REQUEST",message:"Use the explicit account-closure decision controls for this request."}); await addTicketMessage(ctx.user.id,input.ticketId,input.body,input.status); return { success:true }; }),
    reopenTicket: adminProcedure.input(z.object({ ticketId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const ticket=await getSupportTicketById(input.ticketId); if(ticket?.subject === ACCOUNT_CLOSURE_TICKET_SUBJECT) throw new TRPCError({code:"BAD_REQUEST",message:"Account-closure requests cannot be reopened from generic support controls."}); return reopenSupportTicket(ctx.user.id,input.ticketId); }),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
